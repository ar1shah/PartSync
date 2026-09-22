import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { InventoryPart, Part, PartVariant, PublicInventoryRow } from "@/lib/supabase/types";

function attachVariants(
  rows: PublicInventoryRow[],
  variants: PartVariant[],
): InventoryPart[] {
  const variantsByPartId = new Map<string, PartVariant[]>();
  for (const v of variants) {
    const list = variantsByPartId.get(v.part_id) ?? [];
    list.push(v);
    variantsByPartId.set(v.part_id, list);
  }

  return rows.map((row) => ({
    ...row,
    variants: row.id ? (variantsByPartId.get(row.id) ?? []) : [],
  }));
}

/** Loads the raw parts table plus the public_inventory view (with variants attached). */
export async function loadParts(): Promise<{ parts: Part[]; inventoryParts: InventoryPart[] }> {
  const supabase = await createClient();

  const [
    { data: parts, error: partsErr },
    { data: rows, error: rowsErr },
    { data: variants, error: varErr },
  ] = await Promise.all([
    fetchAllRows<Part>((from, to) =>
      supabase.from("parts").select("*").order("name", { ascending: true }).range(from, to),
    ),
    fetchAllRows<PublicInventoryRow>((from, to) =>
      supabase
        .from("public_inventory")
        .select("*")
        .order("name", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<PartVariant>((from, to) =>
      supabase
        .from("part_variants")
        .select("*")
        .order("sort_order", { ascending: true })
        .range(from, to),
    ),
  ]);

  if (partsErr) console.error("failed to load parts", partsErr);
  if (rowsErr) console.error("failed to load inventory rows", rowsErr);
  if (varErr) console.error("failed to load variants", varErr);

  return {
    parts: parts ?? [],
    inventoryParts: attachVariants(rows ?? [], variants ?? []),
  };
}

/**
 * Loads only the parts that match a set of already-normalized SKAPS# keys.
 * Used by the Parts Used log so it doesn't pull the entire master list just
 * to resolve hover previews / edit links for the visible submission rows.
 */
export async function loadPartsForSkaps(
  normalizedKeys: string[],
): Promise<{ parts: Part[]; inventoryParts: InventoryPart[] }> {
  const unique = Array.from(new Set(normalizedKeys.filter((k) => k.length > 0)));
  if (unique.length === 0) {
    return { parts: [], inventoryParts: [] };
  }

  const supabase = await createClient();

  const { data: rows, error: rowsErr } = await supabase.rpc("inventory_by_normalized_skaps", {
    p_keys: unique,
  });

  if (rowsErr) {
    console.error("failed to load inventory by skaps", rowsErr);
    return { parts: [], inventoryParts: [] };
  }

  const inventoryRows = rows ?? [];
  const partIds = inventoryRows.map((r) => r.id).filter((id): id is string => Boolean(id));

  if (partIds.length === 0) {
    return { parts: [], inventoryParts: [] };
  }

  const [{ data: parts, error: partsErr }, { data: variants, error: varErr }] = await Promise.all([
    supabase.from("parts").select("*").in("id", partIds),
    supabase
      .from("part_variants")
      .select("*")
      .in("part_id", partIds)
      .order("sort_order", { ascending: true }),
  ]);

  if (partsErr) console.error("failed to load parts for skaps", partsErr);
  if (varErr) console.error("failed to load variants for skaps", varErr);

  return {
    parts: parts ?? [],
    inventoryParts: attachVariants(inventoryRows, variants ?? []),
  };
}
