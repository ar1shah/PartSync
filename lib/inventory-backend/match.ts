import { normalizeSkapsNumber } from "@/lib/forms/normalize";
import { timed } from "@/lib/perf";
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
 *
 * Exact/case-insensitive lookups stay cheap. The normalized lookup handles
 * legacy free-text variants such as `insert 164` vs `INSERT_164`, and is an
 * index scan on parts_list_mv rather than the full-catalog scan this used to
 * do on every unmatched submission.
 *
 * Semantics are unchanged: a normalized key that matches more than one part
 * resolves to null rather than guessing.
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

  return timed(`findInventoryPartBySkapsNumber(${normalized})`, async () => {
    const { data, error } = await client.rpc("inventory_parts_by_normalized_skaps", {
      p_keys: [normalized],
    });
    if (error) {
      console.error("failed to resolve SKAPS number", error);
      return null;
    }

    const matches = (data ?? []) as LookupRow[];
    return matches.length === 1 ? adapt(matches[0]!) : null;
  });
}

/**
 * Up to three "did you mean" suggestions for an unmatched SKAPS number.
 * A candidate matches on a substring hit in either direction, same as before;
 * the ordering is now explicitly by part_id, which is the order the previous
 * full-catalog scan happened to return.
 */
export async function findFuzzyInventoryMatches(
  submittedSkaps: string,
): Promise<Array<{ skaps_number: string; name: string }>> {
  const normalized = normalizeSkapsNumber(submittedSkaps);
  if (normalized.length < 2) return [];

  const client = createInventoryServiceClient();

  return timed(`findFuzzyInventoryMatches(${normalized})`, async () => {
    const { data, error } = await client.rpc("inventory_parts_fuzzy_skaps", {
      p_key: normalized,
      p_limit: 3,
    });
    if (error) {
      console.error("failed to find fuzzy SKAPS matches", error);
      return [];
    }

    return ((data ?? []) as LookupRow[]).flatMap((row) => {
      const adapted = adapt(row);
      return adapted ? [{ skaps_number: adapted.skaps_number, name: adapted.name }] : [];
    });
  });
}
