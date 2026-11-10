import { Layers } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { loadInventoryPartTuples } from "@/lib/inventory-backend/load-parts";
import { summarizeTuples } from "@/lib/inventory-backend/list-tuple";
import { formatNumber } from "@/lib/utils";

/**
 * Derived from the cached catalog list rather than its own queries. This used
 * to run two head counts plus a full fetchAllRows() of every part's quantity
 * -- about twelve round trips against the nested parts_app_view on every
 * /admin load. The list is already cached and shared with the Inventory page,
 * so on a cache hit this widget costs no database work at all.
 */
export async function InventoryTotalsWidget() {
  const totals = summarizeTuples(await loadInventoryPartTuples());

  const stats = [
    { label: "Distinct parts", value: totals.partsCount },
    { label: "Total qty on hand", value: totals.totalQuantity },
    { label: "Multi-location parts", value: totals.multiLocationCount },
  ];

  return (
    <WidgetCard
      title="Inventory totals"
      description="SKAPS Spare Parts Inventory"
      icon={<Layers className="h-4 w-4" />}
      href="/admin/inventory"
    >
      <dl className="space-y-2">
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline justify-between">
            <dt className="text-xs text-slate-500">{s.label}</dt>
            <dd className="text-lg font-semibold text-slate-900">{formatNumber(s.value)}</dd>
          </div>
        ))}
      </dl>
    </WidgetCard>
  );
}
