export interface InventorySpecification {
  key: string;
  name: string;
  display_value: string | null;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
}

/** Location row returned from current_inventory_detail, adapted for the UI. */
export interface InventoryLocation {
  id: string;
  inventory_record_id: number;
  part_id: string;
  quantity: number;
  lwhsdesc: string | null;
  zone: string | null;
  location: string | null;
  storage_location: string | null;
  location_on_machine: string | null;
  line_no: string | null;
  source_sheet: string | null;
  external_row_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Compatibility model used by the existing PartSync inventory components.
 * The field names mirror the original public_inventory view so the UI can be
 * migrated without a destructive rewrite, while the added fields expose the
 * richer new backend (QR, RFID, dynamic specifications, multi-location data).
 */
export interface InventoryPart {
  id: string;
  part_id: number;
  skaps_number: string;
  name: string;
  description: string | null;
  category: string | null;
  sub_category: string | null;
  location: string | null;
  location_on_machine: string | null;
  line_no: string | null;
  zone: string | null;
  storage_location: string | null;
  lwhsdesc: string | null;
  size: string | null;
  belt_type: string | null;
  vendor_names: string | null;
  unit: string;
  current_quantity: number;
  quantity_on_hand: number;
  reorder_threshold: number | null;
  notes: string | null;
  used_last_30d: number | null;
  image_url: string | null;
  updated_at: string | null;
  created_at: string | null;
  variant_count: number;
  variants: InventoryLocation[];

  qr_code: string | null;
  active_rfid_tag_count: number;
  inventory_location_count: number;
  primary_image_bucket: string | null;
  primary_image_path: string | null;
  active_image_count: number;
  has_image: boolean;
  has_rfid: boolean;
  specification_count: number;
  specifications: InventorySpecification[];
  has_specifications: boolean;
  warehouses: string | null;
  active: boolean;
}

/**
 * The catalog list row — only what the tile grid renders and its client-side
 * search reads. Deliberately much smaller than `InventoryPart`: the full
 * 42-field shape serialized 9,988 times was 8.54MB on every Inventory page
 * load, of which 14 fields were permanently null, empty or hardcoded.
 *
 * The detail modal still gets a full `InventoryPart`, fetched on open.
 */
export interface InventoryListPart {
  part_id: number;
  skaps_number: string;
  name: string;
  description: string | null;
  category: string | null;
  sub_category: string | null;
  location_on_machine: string | null;
  line_no: string | null;
  warehouses: string | null;
  quantity_on_hand: number;
  variant_count: number;
  has_image: boolean;
  /** Always null from the server; the grid fills it from signed URLs on demand. */
  image_url: string | null;
  /** Always null — not modelled in the new backend yet. */
  reorder_threshold: number | null;
}

export interface InventoryLookupRow {
  skaps_number: string;
  name: string;
  current_quantity: number;
  reorder_threshold: number | null;
}
