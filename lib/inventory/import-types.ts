/** Shapes returned by process_inventory_import / inventory_import_untouched. */

export type ImportAction = "new_part" | "new_location" | "update" | "error";

export type ImportDetailField =
  | "product_name"
  | "product_description"
  | "location_on_machine"
  | "line_number"
  | "main_category"
  | "subcategory"
  | "storage_location";

export interface ImportDiffRow {
  row: number;
  skaps_number: string | null;
  action: ImportAction;
  product_name?: string | null;
  qty_old?: number | null;
  qty_new?: number | null;
  zone?: string | null;
  location_code?: string | null;
  warehouse?: string | null;
  storage_location?: string | null;
  changes?: Partial<Record<ImportDetailField, { old: string | null; new: string | null }>>;
  error?: string;
}

export interface ImportCounts {
  new_parts: number;
  new_locations: number;
  qty_changes: number;
  detail_changes: number;
  unchanged: number;
  errors: number;
}

export interface ImportUntouchedSummary {
  parts_not_in_sheet: number;
  bins_not_in_sheet: number;
  bins_not_in_sheet_qty: number;
  bins_not_in_sheet_sample: Array<{
    skaps_number: string;
    zone: string | null;
    location_code: string | null;
    warehouse_description: string | null;
    quantity: number;
  }>;
}

export const EMPTY_COUNTS: ImportCounts = {
  new_parts: 0,
  new_locations: 0,
  qty_changes: 0,
  detail_changes: 0,
  unchanged: 0,
  errors: 0,
};

export function addCounts(a: ImportCounts, b: ImportCounts): ImportCounts {
  return {
    new_parts: a.new_parts + b.new_parts,
    new_locations: a.new_locations + b.new_locations,
    qty_changes: a.qty_changes + b.qty_changes,
    detail_changes: a.detail_changes + b.detail_changes,
    unchanged: a.unchanged + b.unchanged,
    errors: a.errors + b.errors,
  };
}

export const DETAIL_FIELD_LABELS: Record<ImportDetailField, string> = {
  product_name: "Name",
  product_description: "Description",
  location_on_machine: "Location on machine",
  line_number: "Line no",
  main_category: "Main category",
  subcategory: "Subcategory",
  storage_location: "Storage location",
};
