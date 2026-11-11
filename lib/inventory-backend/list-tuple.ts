import type { InventoryListPart } from "./types";

/**
 * The compact wire format for the catalog list.
 *
 * Deliberately free of server imports so client components can decode it.
 * The list crosses two boundaries — database to server, and server to browser
 * — and object keys repeated ~10,000 times dominate both: 4.23MB as objects
 * versus 2.00MB as arrays for identical data. So it stays in tuple form all
 * the way into the browser and is decoded in the grid.
 */

/**
 * One row from `inventory_parts_list()`. POSITIONAL — this must stay in step
 * with the tuple layout documented in
 * supabase/inventory-migrations/0003_inventory_parts_rpcs.sql.
 */
export type ListTuple = [
  part_id: number,
  skaps_number: string | null,
  product_name: string | null,
  product_description: string | null,
  main_category: string | null,
  subcategory: string | null,
  location_on_machine: string | null,
  line_number: string | null,
  warehouses: string | null,
  current_quantity: number | string | null,
  inventory_location_count: number | null,
  has_image: 1 | null,
];

/** Field positions, for readers that want one value without decoding a row. */
export const TUPLE = {
  partId: 0,
  skapsNumber: 1,
  quantity: 9,
  locationCount: 10,
} as const;

function numberValue(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function decodeListTuple(tuple: ListTuple): InventoryListPart | null {
  const [
    partId,
    skapsNumber,
    productName,
    description,
    category,
    subCategory,
    locationOnMachine,
    lineNumber,
    warehouses,
    quantity,
    locationCount,
    hasImage,
  ] = tuple;

  if (!partId || !skapsNumber) return null;

  return {
    part_id: partId,
    skaps_number: skapsNumber,
    name: productName?.trim() || skapsNumber,
    description,
    category,
    sub_category: subCategory,
    location_on_machine: locationOnMachine,
    line_no: lineNumber,
    warehouses,
    quantity_on_hand: numberValue(quantity),
    variant_count: locationCount ?? 0,
    has_image: hasImage === 1,
    // Filled in client-side by the signed-URL effect, never by the list load.
    image_url: null,
    // Not modelled in the new backend yet; kept so the shared stock-status
    // helpers work against list rows as well as full parts.
    reorder_threshold: null,
  };
}

export function decodeListTuples(tuples: ListTuple[]): InventoryListPart[] {
  return tuples.flatMap((tuple) => {
    const part = decodeListTuple(tuple);
    return part ? [part] : [];
  });
}

/**
 * Catalog-wide totals, read straight off the tuples. Used by the admin
 * dashboard widgets, which need four numbers and should not pay to decode
 * ~10,000 objects to get them.
 */
export function summarizeTuples(tuples: ListTuple[]): {
  partsCount: number;
  totalQuantity: number;
  multiLocationCount: number;
  zeroStockCount: number;
} {
  let totalQuantity = 0;
  let multiLocationCount = 0;
  let zeroStockCount = 0;

  for (const tuple of tuples) {
    const qty = numberValue(tuple[TUPLE.quantity]);
    totalQuantity += qty;
    if ((tuple[TUPLE.locationCount] ?? 0) > 1) multiLocationCount += 1;
    if (qty <= 0) zeroStockCount += 1;
  }

  return { partsCount: tuples.length, totalQuantity, multiLocationCount, zeroStockCount };
}
