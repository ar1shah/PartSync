import { normalizeSkapsNumber } from "@/lib/forms/normalize";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createInventoryServiceClient } from "./server";
import type { InventoryLookupRow } from "./types";

type LookupRow = {
  skaps_number: string | null;
  product_name: string | null;
  current_quantity: number | string | null;
};

function adapt(row: LookupRow): InventoryLookupRow | null {
  if (!row.skaps_number) return null;
  return {
    skaps_number: row.skaps_number,
    name: row.product_name?.trim() || row.skaps_number,
    current_quantity: Number(row.current_quantity ?? 0),
    reorder_threshold: null,
  };
}

/**
 * Resolve a form-entered SKAPS number against the new inventory backend.
 * Exact/case-insensitive lookups stay cheap. The full normalized scan is only
 * used for legacy free-text variants such as `insert 164` vs `INSERT_164`.
 */
export async function findInventoryPartBySkapsNumber(
  submittedSkaps: string,
): Promise<InventoryLookupRow | null> {
  const client = createInventoryServiceClient();

  const { data: exact } = await client
    .from("parts_app_view")
    .select("skaps_number,product_name,current_quantity")
    .eq("skaps_number", submittedSkaps.trim())
    .limit(2);

  if (exact?.length === 1) return adapt(exact[0] as LookupRow);

  const normalized = normalizeSkapsNumber(submittedSkaps);
  if (!normalized) return null;

  const { data: rows, error } = await fetchAllRows<LookupRow>((from, to) =>
    client
      .from("parts_app_view")
      .select("skaps_number,product_name,current_quantity")
      .eq("active", true)
      .range(from, to),
  );
  if (error) return null;

  const matches = rows.filter(
    (row) => row.skaps_number && normalizeSkapsNumber(row.skaps_number) === normalized,
  );
  return matches.length === 1 ? adapt(matches[0]!) : null;
}

export async function findFuzzyInventoryMatches(
  submittedSkaps: string,
): Promise<Array<{ skaps_number: string; name: string }>> {
  const normalized = normalizeSkapsNumber(submittedSkaps);
  if (normalized.length < 2) return [];

  const client = createInventoryServiceClient();
  const { data: rows, error } = await fetchAllRows<LookupRow>((from, to) =>
    client
      .from("parts_app_view")
      .select("skaps_number,product_name,current_quantity")
      .eq("active", true)
      .range(from, to),
  );
  if (error) return [];

  return rows
    .filter((row) => {
      if (!row.skaps_number) return false;
      const candidate = normalizeSkapsNumber(row.skaps_number);
      return candidate.includes(normalized) || normalized.includes(candidate);
    })
    .slice(0, 3)
    .flatMap((row) => {
      const adapted = adapt(row);
      return adapted ? [{ skaps_number: adapted.skaps_number, name: adapted.name }] : [];
    });
}
