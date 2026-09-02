import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createInventoryServiceClient } from "./server";
import type {
  InventoryLocation,
  InventoryPart,
  InventorySpecification,
} from "./types";

type PartsAppRow = {
  part_id: number | null;
  skaps_number: string | null;
  product_name: string | null;
  product_description: string | null;
  location_on_machine: string | null;
  line_number: string | null;
  main_category: string | null;
  subcategory: string | null;
  current_quantity: number | string | null;
  inventory_location_count: number | null;
  warehouses: string | null;
  qr_code: string | null;
  active_rfid_tag_count: number | null;
  primary_image_bucket: string | null;
  primary_image_path: string | null;
  active_image_count: number | null;
  has_image: boolean | null;
  has_rfid: boolean | null;
  specification_count: number | null;
  specifications: unknown;
  has_specifications: boolean | null;
  active: boolean | null;
  updated_at: string | null;
};

type LocationRow = {
  inventory_record_id: number | null;
  part_id: number | null;
  quantity: number | string | null;
  zone: string | null;
  location_code: string | null;
  storage_location: string | null;
  warehouse_description: string | null;
  location_on_machine: string | null;
  line_number: string | null;
};

function numberValue(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseSpecifications(value: unknown): InventorySpecification[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key : null;
    const name = typeof row.name === "string" ? row.name : null;
    if (!key || !name) return [];

    return [
      {
        key,
        name,
        display_value:
          typeof row.display_value === "string" ? row.display_value : null,
        value_numeric:
          typeof row.value_numeric === "number" ? row.value_numeric : null,
        value_text: typeof row.value_text === "string" ? row.value_text : null,
        unit: typeof row.unit === "string" ? row.unit : null,
      },
    ];
  });
}

function specificationDisplay(
  specs: InventorySpecification[],
  key: string,
): string | null {
  const match = specs.find((spec) => spec.key.toLowerCase() === key.toLowerCase());
  return match?.display_value ?? match?.value_text ?? null;
}

async function signedImageUrls(
  rows: PartsAppRow[],
): Promise<Map<number, string>> {
  const client = createInventoryServiceClient();
  const result = new Map<number, string>();

  await Promise.all(
    rows.map(async (row) => {
      if (!row.part_id || !row.primary_image_bucket || !row.primary_image_path) return;
      const { data, error } = await client.storage
        .from(row.primary_image_bucket)
        .createSignedUrl(row.primary_image_path, 60 * 60);
      if (!error && data?.signedUrl) result.set(row.part_id, data.signedUrl);
    }),
  );

  return result;
}

/** Loads the new Supabase inventory and adapts it to the existing PartSync UI. */
export async function loadInventoryParts(): Promise<InventoryPart[]> {
  const client = createInventoryServiceClient();

  const [{ data: parts, error: partsError }, { data: locations, error: locationsError }] =
    await Promise.all([
      fetchAllRows<PartsAppRow>((from, to) =>
        client
          .from("parts_app_view")
          .select("*")
          .eq("active", true)
          .order("skaps_number", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<LocationRow>((from, to) =>
        client
          .from("current_inventory_detail")
          .select(
            "inventory_record_id,part_id,quantity,zone,location_code,storage_location,warehouse_description,location_on_machine,line_number",
          )
          .order("inventory_record_id", { ascending: true })
          .range(from, to),
      ),
    ]);

  if (partsError) console.error("failed to load new SKAPS inventory", partsError);
  if (locationsError) console.error("failed to load SKAPS locations", locationsError);

  const locationsByPart = new Map<number, InventoryLocation[]>();
  for (const row of locations) {
    if (!row.part_id || !row.inventory_record_id) continue;
    const location: InventoryLocation = {
      id: String(row.inventory_record_id),
      inventory_record_id: row.inventory_record_id,
      part_id: String(row.part_id),
      quantity: numberValue(row.quantity),
      lwhsdesc: row.warehouse_description,
      zone: row.zone,
      location: row.location_code,
      storage_location: row.storage_location,
      location_on_machine: row.location_on_machine,
      line_no: row.line_number,
      source_sheet: null,
      external_row_id: null,
      sort_order: locationsByPart.get(row.part_id)?.length ?? 0,
      created_at: "",
      updated_at: "",
    };
    const list = locationsByPart.get(row.part_id) ?? [];
    list.push(location);
    locationsByPart.set(row.part_id, list);
  }

  const imageUrls = await signedImageUrls(parts);

  return parts.flatMap((row) => {
    if (!row.part_id || !row.skaps_number) return [];
    const variants = locationsByPart.get(row.part_id) ?? [];
    const primary = variants[0];
    const specs = parseSpecifications(row.specifications);
    const qty = numberValue(row.current_quantity);

    return [
      {
        id: String(row.part_id),
        part_id: row.part_id,
        skaps_number: row.skaps_number,
        name: row.product_name?.trim() || row.skaps_number,
        description: row.product_description,
        category: row.main_category,
        sub_category: row.subcategory,
        location: primary?.location ?? null,
        location_on_machine: row.location_on_machine ?? primary?.location_on_machine ?? null,
        line_no: row.line_number ?? primary?.line_no ?? null,
        zone: primary?.zone ?? null,
        storage_location: primary?.storage_location ?? null,
        lwhsdesc: primary?.lwhsdesc ?? null,
        size: specificationDisplay(specs, "size"),
        belt_type: specificationDisplay(specs, "belt_type"),
        vendor_names: specificationDisplay(specs, "vendor"),
        unit: "each",
        current_quantity: qty,
        quantity_on_hand: qty,
        reorder_threshold: null,
        notes: null,
        used_last_30d: null,
        image_url: imageUrls.get(row.part_id) ?? null,
        updated_at: row.updated_at,
        created_at: null,
        variant_count: row.inventory_location_count ?? variants.length,
        variants,
        qr_code: row.qr_code,
        active_rfid_tag_count: row.active_rfid_tag_count ?? 0,
        inventory_location_count: row.inventory_location_count ?? variants.length,
        primary_image_bucket: row.primary_image_bucket,
        primary_image_path: row.primary_image_path,
        active_image_count: row.active_image_count ?? 0,
        has_image: row.has_image ?? false,
        has_rfid: row.has_rfid ?? false,
        specification_count: row.specification_count ?? specs.length,
        specifications: specs,
        has_specifications: row.has_specifications ?? specs.length > 0,
        warehouses: row.warehouses,
        active: row.active ?? true,
      } satisfies InventoryPart,
    ];
  });
}
