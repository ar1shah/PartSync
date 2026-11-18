/**
 * Parses Athens Inventory Excel workbooks into normalized location rows for
 * `process_inventory_import`. Expects FULL_08112026-style headers:
 * SKAPSNo, ProductName, Product Desc, Location On Machine, Line No, Quantity,
 * Zone, Location, Storage Location, LWhsDesc, New_Sub_Category, New_Main_Category.
 */

export interface ExcelImportRow {
  /** 1-based Excel row number, for pointing the user back at the sheet. */
  row_number: number;
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

const SCIENTIFIC = /^[+-]?[\d.]+e[+-]?\d+$/i;

/**
 * Numeric cells use the text Excel displays (custom formats can show a code
 * like "1917-1" for the value 6211), except rounded scientific notation such
 * as "1.00E+11", where the raw value keeps the digits. A cell showing zero in
 * scientific notation ("0.00E+00") held text Excel misread as a number, such
 * as the part code 1451E-6547, and is treated as blank. Line breaks and
 * Excel's escaped carriage return (_x000D_) collapse to single spaces, which
 * is how the inventory database stores text.
 */
function cellToString(value: unknown, display?: unknown): string | null {
  if (value === null || value === undefined) return null;
  let text: string;
  if (typeof value === "number") {
    const shown = typeof display === "string" ? display.trim() : "";
    if (value === 0 && SCIENTIFIC.test(shown)) return null;
    if (shown && !SCIENTIFIC.test(shown)) text = shown;
    else if (Number.isFinite(value)) text = String(value);
    else return null;
  } else if (typeof value === "boolean") {
    text = value ? "true" : "false";
  } else {
    text = String(value);
  }
  const cleaned = text.replace(/_x000D_?/gi, " ").replace(/\s+/g, " ").trim();
  return cleaned.length === 0 ? null : cleaned;
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
 * `preferredSheet` when it exists; otherwise a FULL-style sheet whose name
 * starts with "FULL"; otherwise the FULL-style sheet with the most rows (the
 * Athens workbook also has small per-category tabs with the same headers,
 * such as DISC); otherwise the first sheet.
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

  const fullStyle = sheets.filter((s) => sheetLooksLikeFullInventory(s.rows[0] ?? []));
  const named = fullStyle.find((s) => s.name.trim().toUpperCase().startsWith("FULL"));
  if (named) return named;
  if (fullStyle.length > 0) {
    return fullStyle.reduce((best, s) => (s.rows.length > best.rows.length ? s : best));
  }

  return sheets[0] ?? null;
}

/**
 * Splits rows into chunks of roughly `size`, never splitting one SKAPS number
 * across chunks: the import treats the first row of an unseen SKAPS as a new
 * part and later rows as its extra bins, which only holds within one call.
 */
export function chunkRowsBySkaps(rows: ExcelImportRow[], size: number): ExcelImportRow[][] {
  const groups = new Map<string, ExcelImportRow[]>();
  for (const row of rows) {
    const group = groups.get(row.skaps_number);
    if (group) group.push(row);
    else groups.set(row.skaps_number, [row]);
  }

  const chunks: ExcelImportRow[][] = [];
  let current: ExcelImportRow[] = [];
  for (const group of groups.values()) {
    if (current.length > 0 && current.length + group.length > size) {
      chunks.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function parseInventoryExcelSheet(
  sheetName: string,
  matrix: unknown[][],
  availableSheets: string[],
  /** Same sheet read with `raw: false` (display text); used for text columns. */
  displayMatrix?: unknown[][],
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

    const displayRow = displayMatrix?.[i] ?? [];

    const pick = (field: FieldKey): unknown => {
      const idx = indexMap[field];
      return idx === undefined ? null : sheetRow[idx];
    };

    const text = (field: FieldKey): string | null => {
      const idx = indexMap[field];
      return idx === undefined ? null : cellToString(sheetRow[idx], displayRow[idx]);
    };

    const skaps = text("skaps_number");
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
      row_number: excelRowNumber,
      skaps_number: skaps,
      product_name: text("product_name"),
      product_description: text("product_description"),
      location_on_machine: text("location_on_machine"),
      line_number: text("line_number"),
      quantity,
      zone: text("zone"),
      location_code: text("location_code"),
      storage_location: text("storage_location"),
      warehouse_description: text("warehouse_description"),
      main_category: text("main_category"),
      subcategory: text("subcategory"),
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
