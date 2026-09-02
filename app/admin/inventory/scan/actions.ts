"use server";

import { createInventoryServiceClient } from "@/lib/inventory-backend/server";
import { requirePartSyncUser } from "@/lib/inventory-backend/authorize";

export interface ScanState {
  error?: string;
  result?: {
    matched_identifier_type: string;
    matched_identifier_value: string;
    skaps_number: string;
    product_name: string | null;
    product_description: string | null;
    main_category: string | null;
    subcategory: string | null;
    current_quantity: number;
    inventory_location_count: number;
    warehouses: string | null;
    qr_code: string | null;
    active_rfid_tag_count: number;
    specification_count: number;
    specifications: unknown;
    image_url: string | null;
  };
}

export async function resolveScan(_prev: ScanState, formData: FormData): Promise<ScanState> {
  const value = String(formData.get("scanned_value") ?? "").trim();
  const rawType = String(formData.get("identifier_type") ?? "").trim().toUpperCase();
  const identifierType = rawType === "QR" || rawType === "RFID" ? rawType : undefined;

  if (!value) return { error: "Scan or enter a QR/RFID value." };

  try {
    await requirePartSyncUser();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" };
  }

  const inventory = createInventoryServiceClient();
  const { data, error } = await inventory.rpc("resolve_part_by_scan_detail", {
    p_scanned_value: value,
    p_identifier_type: identifierType,
  });

  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { error: `No active SKAPS identifier matched "${value}".` };

  let imageUrl: string | null = null;
  if (row.primary_image_bucket && row.primary_image_path) {
    const signed = await inventory.storage
      .from(row.primary_image_bucket)
      .createSignedUrl(row.primary_image_path, 60 * 60);
    imageUrl = signed.data?.signedUrl ?? null;
  }

  // Best-effort audit in the inventory scan log. A logging failure should not
  // hide an otherwise successful lookup from the operator.
  const logged = await inventory.rpc("record_scan_event", {
    p_scanned_value: value,
    p_identifier_type: identifierType,
    p_event_type: "VERIFY",
    p_operator_reference: "PARTSYNC_ADMIN",
  });
  if (logged.error) console.error("scan lookup succeeded but event logging failed", logged.error);

  return {
    result: {
      matched_identifier_type: row.matched_identifier_type,
      matched_identifier_value: row.matched_identifier_value,
      skaps_number: row.skaps_number,
      product_name: row.product_name,
      product_description: row.product_description,
      main_category: row.main_category,
      subcategory: row.subcategory,
      current_quantity: Number(row.current_quantity ?? 0),
      inventory_location_count: Number(row.inventory_location_count ?? 0),
      warehouses: row.warehouses,
      qr_code: row.qr_code,
      active_rfid_tag_count: Number(row.active_rfid_tag_count ?? 0),
      specification_count: Number(row.specification_count ?? 0),
      specifications: row.specifications,
      image_url: imageUrl,
    },
  };
}
