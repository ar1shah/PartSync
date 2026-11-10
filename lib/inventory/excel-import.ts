/**
 * Parses Athens Inventory Excel workbooks into normalized location rows for
 * `apply_inventory_quantity_import`. Expects FULL_08112026-style headers:
 * SKAPSNo, ProductName, Product Desc, Location On Machine, Line No, Quantity,
 * Zone, Location, Storage Location, LWhsDesc, New_Sub_Category, New_Main_Category.
 */

export interface ExcelImportRow {
  skaps_number: string;
  product_name: string | null;
  product_description: string | null;
  location_on_machine: string | null;
  line_number: string | null;
  quantity: number;
  zone: string | null;
  location_code: string | null;
  storage_location: string | null;
  warehouse_description: string | null;
  main_category: string | null;
  subcategory: string | null;
}

export interface ExcelParseIssue {
  row: number;
  skaps_number: string | null;
  error: string;
}

export interface ExcelParseResult {
  sheetName: string;
  availableSheets: string[];
  rows: ExcelImportRow[];
  issues: ExcelParseIssue[];
}

type FieldKey =
  | "skaps_number"
  | "product_name"
  | "product_description"
  | "location_on_machine"
  | "line_number"
  | "quantity"
  | "zone"
  | "location_code"
  | "storage_location"
  | "warehouse_description"
  | "main_category"
  | "subcategory";

const COLUMN_HINTS: Record<FieldKey, string[]> = {
  skaps_number: ["skapsno", "skaps no", "skaps number", "skaps#"],
  product_name: ["productname", "product name"],
  product_description: ["product desc", "product description"],
  location_on_machine: ["location on machine", "locationonmac"],
  line_number: ["line no", "line number", "prdlineno"],
  quantity: ["quantity", "total qty", "qty"],
  zone: ["zone"],
  location_code: ["location"],
  storage_location: ["storage location"],
  warehouse_description: ["lwhsdesc", "warehouse"],
  main_category: ["new_main_category", "main category", "maincategory"],
  subcategory: ["new_sub_category", "sub category", "subcategory"],
};

function canonicalHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_/#]+/g, " ")
    .replace(/\s+/g, " ");
}

function cellToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Preserve integers without scientific notation / trailing .0
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function cellToQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value).trim().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildIndexMap(headers: unknown[]): Partial<Record<FieldKey, number>> {
  const canonical = headers.map(canonicalHeader);
  const map: Partial<Record<FieldKey, number>> = {};

  for (const field of Object.keys(COLUMN_HINTS) as FieldKey[]) {
    for (const hint of COLUMN_HINTS[field]) {
      const idx = canonical.findIndex((h) => h === hint || h.includes(hint));
      if (idx >= 0) {
        // Prefer exact / earlier hints; don't overwrite a better match.
        if (map[field] === undefined) map[field] = idx;
        break;
      }
    }
  }

  // "Location" is ambiguous with "Location On Machine" / "Storage Location".
  // Prefer a header that is exactly "location" when available.
  const exactLocation = canonical.findIndex((h) => h === "location");
  if (exactLocation >= 0) map.location_code = exactLocation;

  return map;
}

function sheetLooksLikeFullInventory(headers: unknown[]): boolean {
  const map = buildIndexMap(headers);
  return (
    map.skaps_number !== undefined &&
    map.quantity !== undefined &&
    map.zone !== undefined &&
    map.location_code !== undefined
  );
}

function locationKey(row: Pick<ExcelImportRow, "skaps_number" | "zone" | "location_code" | "warehouse_description">): string {
  return [
    row.skaps_number,
    row.zone ?? "",
    row.location_code ?? "",
    row.warehouse_description ?? "",
  ].join("|");
}

/**
 * Pick the first sheet that has FULL-style headers, otherwise use `preferredSheet`
 * if provided, otherwise the first sheet.
 */
export function pickInventorySheet(
  sheets: Array<{ name: string; rows: unknown[][] }>,
  preferredSheet?: string | null,
): { name: string; rows: unknown[][] } | null {
  if (sheets.length === 0) return null;

  if (preferredSheet) {
    const match = sheets.find((s) => s.name === preferredSheet);
    if (match) return match;
  }

  for (const sheet of sheets) {
    const headers = sheet.rows[0] ?? [];
    if (sheetLooksLikeFullInventory(headers)) return sheet;
  }

  return sheets[0] ?? null;
}

export function parseInventoryExcelSheet(
  sheetName: string,
  matrix: unknown[][],
  availableSheets: string[],
): ExcelParseResult {
  const issues: ExcelParseIssue[] = [];
  const rows: ExcelImportRow[] = [];

  if (matrix.length === 0) {
    return {
      sheetName,
      availableSheets,
      rows: [],
      issues: [{ row: 0, skaps_number: null, error: "Sheet is empty" }],
    };
  }

  const headers = matrix[0] ?? [];
  const indexMap = buildIndexMap(headers);

  if (indexMap.skaps_number === undefined || indexMap.quantity === undefined) {
    return {
      sheetName,
      availableSheets,
      rows: [],
      issues: [
        {
          row: 1,
          skaps_number: null,
          error:
            "Could not find SKAPSNo and Quantity columns. Use a FULL_*-style sheet with Zone/Location columns.",
        },
      ],
    };
  }

  const seenKeys = new Map<string, number>();

  for (let i = 1; i < matrix.length; i++) {
    const sheetRow = matrix[i] ?? [];
    const excelRowNumber = i + 1;

    const pick = (field: FieldKey): unknown => {
      const idx = indexMap[field];
      return idx === undefined ? null : sheetRow[idx];
    };

    const skaps = cellToString(pick("skaps_number"));
    if (!skaps) {
      // Skip trailing blank rows silently.
      const anyValue = sheetRow.some((v) => cellToString(v) !== null);
      if (anyValue) {
        issues.push({
          row: excelRowNumber,
          skaps_number: null,
          error: "Blank SKAPS number",
        });
      }
      continue;
    }

    const quantity = cellToQuantity(pick("quantity"));
    if (quantity === null) {
      issues.push({
        row: excelRowNumber,
        skaps_number: skaps,
        error: "Quantity is missing or not numeric",
      });
      continue;
    }
    if (quantity < 0) {
      issues.push({
        row: excelRowNumber,
        skaps_number: skaps,
        error: "Quantity cannot be negative",
      });
      continue;
    }

    const row: ExcelImportRow = {
      skaps_number: skaps,
      product_name: cellToString(pick("product_name")),
      product_description: cellToString(pick("product_description")),
      location_on_machine: cellToString(pick("location_on_machine")),
      line_number: cellToString(pick("line_number")),
      quantity,
      zone: cellToString(pick("zone")),
      location_code: cellToString(pick("location_code")),
      storage_location: cellToString(pick("storage_location")),
      warehouse_description: cellToString(pick("warehouse_description")),
      main_category: cellToString(pick("main_category")),
      subcategory: cellToString(pick("subcategory")),
    };

    const key = locationKey(row);
    const previous = seenKeys.get(key);
    if (previous !== undefined) {
      issues.push({
        row: excelRowNumber,
        skaps_number: skaps,
        error: `Duplicate location key (also on row ${previous})`,
      });
      continue;
    }
    seenKeys.set(key, excelRowNumber);
    rows.push(row);
  }

  return { sheetName, availableSheets, rows, issues };
}
