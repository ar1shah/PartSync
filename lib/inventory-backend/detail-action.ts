"use server";

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
