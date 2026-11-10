"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { refreshInventoryPartsCache } from "./refresh";
import { recordAudit } from "@/lib/audit/log";
import { requirePartSyncUser } from "./authorize";
import { createInventoryServiceClient } from "./server";
import { loadInventoryPartDetail } from "./load-parts";
import type { InventoryPart } from "./types";

export type PartDetailResult = { part: InventoryPart } | { error: string };

/** Authenticated lookup of one part's locations, specifications, and image. */
export async function getInventoryPartDetail(partId: number): Promise<PartDetailResult> {
  if (!Number.isInteger(partId) || partId <= 0) {
    return { error: "That part could not be loaded." };
  }

  try {
    await requirePartSyncUser();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" };
  }

  const part = await loadInventoryPartDetail(partId);
  if (!part) return { error: "That part could not be loaded." };
  return { part };
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type UploadPartImageResult =
  | { ok: true; imageUrl: string; partId: number }
  | { ok: false; error: string };

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/**
 * Upload a primary product image for a SKAPS part. Files land in the private
 * `part-images` bucket and are registered through `register_part_image`.
 */
export async function uploadPartImage(formData: FormData): Promise<UploadPartImageResult> {
  try {
    await requirePartSyncUser();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unauthorized" };
  }

  const skapsNumber = String(formData.get("skaps_number") ?? "").trim();
  const partIdRaw = Number(formData.get("part_id"));
  const file = formData.get("image");

  if (!skapsNumber) return { ok: false, error: "SKAPS number is required." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image to upload." };
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: "Image must be JPEG, PNG, or WebP." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image must be 15 MB or smaller." };
  }

  const client = createInventoryServiceClient();
  const safeSkaps = skapsNumber.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${safeSkaps}/${randomUUID()}.${extensionForMime(file.type)}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await client.storage
    .from("part-images")
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    console.error("failed to upload part image", uploadError);
    return { ok: false, error: uploadError.message };
  }

  const { data: imageId, error: registerError } = await client.rpc("register_part_image", {
    p_skaps_number: skapsNumber,
    p_storage_path: storagePath,
    p_original_file_name: file.name || null,
    p_image_type: "PRODUCT",
    p_is_primary: true,
    p_mime_type: file.type,
    p_file_size_bytes: file.size,
    p_source_system: "SKAPS_APP",
  });

  if (registerError) {
    console.error("failed to register part image", registerError);
    await client.storage.from("part-images").remove([storagePath]);
    return { ok: false, error: registerError.message };
  }

  const signed = await client.storage
    .from("part-images")
    .createSignedUrl(storagePath, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    console.error("failed to sign uploaded part image", signed.error);
    return { ok: false, error: "Image uploaded but could not create a preview URL." };
  }

  await recordAudit({
    action: "part.image_uploaded",
    entityType: "part",
    entityId: Number.isFinite(partIdRaw) ? String(partIdRaw) : null,
    entityLabel: skapsNumber,
    summary: `Uploaded primary image for ${skapsNumber}`,
    changes: {
      storage_path: storagePath,
      image_id: imageId ?? null,
      mime_type: file.type,
      file_size_bytes: file.size,
    },
  });

  await refreshInventoryPartsCache();
  revalidatePath("/admin/inventory");
  revalidatePath("/inventory");

  return {
    ok: true,
    imageUrl: signed.data.signedUrl,
    partId: Number.isFinite(partIdRaw) ? partIdRaw : 0,
  };
}

const MAX_IMAGE_IDS = 240;

/**
 * Signed image URLs for the tiles currently on screen. The catalog load
 * deliberately does not sign every photo up front.
 */
export async function getInventoryImageUrls(partIds: number[]): Promise<Record<string, string>> {
  const ids = Array.from(
    new Set(partIds.filter((id) => Number.isInteger(id) && id > 0)),
  ).slice(0, MAX_IMAGE_IDS);
  if (ids.length === 0) return {};

  try {
    await requirePartSyncUser();
  } catch {
    return {};
  }

  const client = createInventoryServiceClient();
  const { data, error } = await client
    .from("parts_app_view")
    .select("part_id,primary_image_bucket,primary_image_path")
    .in("part_id", ids)
    .eq("has_image", true);

  if (error || !data) {
    if (error) console.error("failed to load inventory image paths", error);
    return {};
  }

  const byBucket = new Map<string, Array<{ partId: number; path: string }>>();
  for (const row of data) {
    if (!row.part_id || !row.primary_image_bucket || !row.primary_image_path) continue;
    const list = byBucket.get(row.primary_image_bucket) ?? [];
    list.push({ partId: row.part_id, path: row.primary_image_path });
    byBucket.set(row.primary_image_bucket, list);
  }

  const urls: Record<string, string> = {};
  await Promise.all(
    Array.from(byBucket.entries()).map(async ([bucket, files]) => {
      const signed = await client.storage.from(bucket).createSignedUrls(
        files.map((file) => file.path),
        60 * 60,
      );
      if (signed.error || !signed.data) {
        console.error("failed to sign inventory images", signed.error);
        return;
      }
      signed.data.forEach((item, index) => {
        const partId = files[index]?.partId;
        if (partId && item.signedUrl) urls[String(partId)] = item.signedUrl;
      });
    }),
  );

  return urls;
}
