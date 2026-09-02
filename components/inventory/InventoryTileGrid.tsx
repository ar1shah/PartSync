"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, Package, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizeSkapsNumber } from "@/lib/forms/normalize";
import { PartTileCard } from "./PartTileCard";
import { PartDetailModal } from "./PartDetailModal";
import type { InventoryPart } from "@/lib/inventory-backend/types";

interface Props {
  parts: InventoryPart[];
}

type StockFilter = "all" | "in_stock" | "out_of_stock";

/** Lower is a closer SKAPS # match; Infinity means the query only matched some other field. */
function skapsMatchRank(
  skapsNumber: string | null,
  queryTokens: string[],
  compactQuery: string,
): number {
  if (!skapsNumber) return Number.POSITIVE_INFINITY;
  const lower = skapsNumber.toLowerCase();
  const compact = normalizeSkapsNumber(skapsNumber);

  if (compactQuery && compact === compactQuery) return 0;
  if (compactQuery && compact.startsWith(compactQuery)) return 1;
  if (compactQuery && compact.includes(compactQuery)) return 2;

  const allTokensInSkaps = queryTokens.every((token) => {
    if (lower.includes(token)) return true;
    const compactToken = normalizeSkapsNumber(token);
    return compactToken.length > 0 && compact.includes(compactToken);
  });
  return allTokensInSkaps ? 3 : Number.POSITIVE_INFINITY;
}

export function InventoryTileGrid({ parts }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [selected, setSelected] = useState<InventoryPart | null>(null);
  const [visibleCount, setVisibleCount] = useState(240);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of parts) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [parts]);

  // Built once per `parts` load rather than on every keystroke -- typing
  // only needs to run cheap substring checks against these precomputed
  // strings instead of re-joining/re-normalizing every part's fields.
  const searchIndex = useMemo(() => {
    return parts.map((part) => {
      const haystackValues = [
        part.skaps_number,
        part.name,
        part.description,
        part.category,
        part.sub_category,
        ...part.variants.flatMap((v) => [
          v.lwhsdesc,
          v.zone,
          v.location,
          v.storage_location,
          v.location_on_machine,
          v.line_no,
        ]),
        part.lwhsdesc,
        part.zone,
        part.location,
        part.storage_location,
        part.location_on_machine,
      ].filter((v): v is string => Boolean(v));

      return {
        part,
        full: haystackValues.join(" ").toLowerCase(),
        // Separator-insensitive fallback so "insert 97" matches "INSERT_097".
        compact: haystackValues.map(normalizeSkapsNumber).join(" "),
      };
    });
  }, [parts]);

  const filtered = useMemo(() => {
    const queryTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = searchIndex.filter(({ part, full, compact }) => {
      if (queryTokens.length > 0) {
        const matchesAllTokens = queryTokens.every((token) => {
          if (full.includes(token)) return true;
          const compactToken = normalizeSkapsNumber(token);
          return compactToken.length > 0 && compact.includes(compactToken);
        });
        if (!matchesAllTokens) return false;
      }

      if (category && part.category !== category) return false;

      const qty = part.quantity_on_hand ?? 0;
      if (stockFilter === "in_stock" && qty <= 0) return false;
      if (stockFilter === "out_of_stock" && qty > 0) return false;
      return true;
    });

    if (queryTokens.length === 0) return matches.map(({ part }) => part);

    // Rank closer SKAPS # matches first (exact > prefix > substring > other
    // matched fields), so e.g. searching "insert 97" surfaces "INSERT_097"
    // ahead of parts that only matched on an unrelated field.
    const compactQuery = queryTokens.map(normalizeSkapsNumber).join("");
    return matches
      .map(({ part }, index) => ({
        part,
        index,
        rank: skapsMatchRank(part.skaps_number, queryTokens, compactQuery),
      }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ part }) => part);
  }, [searchIndex, query, category, stockFilter]);

  useEffect(() => {
    setVisibleCount(240);
  }, [query, category, stockFilter]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by SKAPS #, name, location…"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Filter className="h-4 w-4 text-slate-400" aria-hidden />
          {(
            [
              ["all", "All"],
              ["in_stock", "In stock"],
              ["out_of_stock", "Out of stock"],
            ] as Array<[StockFilter, string]>
          ).map(([value, label]) => (
            <FilterChip
              key={value}
              active={stockFilter === value}
              onClick={() => setStockFilter(value)}
              label={label}
            />
          ))}

          {categories.length > 0 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Showing {filtered.length.toLocaleString()} of {parts.length.toLocaleString()} parts
      </p>

      {parts.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <NoMatchesState />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((part) => (
            <PartTileCard
              key={part.skaps_number ?? part.name}
              part={part}
              onClick={() => setSelected(part)}
            />
          ))}
        </div>
      )}

      {filtered.length > visible.length && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => setVisibleCount((n) => n + 240)}>
            Load more ({(filtered.length - visible.length).toLocaleString()} remaining)
          </Button>
        </div>
      )}

      {selected && <PartDetailModal part={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-blue-700 text-white"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Package className="h-8 w-8 text-slate-400" />
        <div>
          <p className="font-medium text-slate-900">No parts in the inventory yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Add a new SKAPS part from the admin panel or import it through the controlled inventory workflow.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function NoMatchesState() {
  return (
    <Card className="mt-3">
      <CardContent className="py-10 text-center">
        <p className="text-sm font-medium text-slate-900">No parts match your filters</p>
        <p className="mt-1 text-xs text-slate-500">Try clearing the search or filter chips.</p>
      </CardContent>
    </Card>
  );
}
