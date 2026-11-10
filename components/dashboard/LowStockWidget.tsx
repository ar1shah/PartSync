import { AlertTriangle } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { loadInventoryParts } from "@/lib/inventory-backend/load-parts";
import { formatNumber } from "@/lib/utils";

/**
 * Derived from the cached catalog list rather than its own count + sample
 * queries against parts_app_view. The list already arrives sorted by
 * skaps_number, which is the order the sample used.
 */
export async function LowStockWidget() {
  const parts = await loadInventoryParts();
  const zeroStock = parts.filter((part) => part.quantity_on_hand <= 0);
  const sample = zeroStock.slice(0, 3);

  return (
    <WidgetCard
      title="Out of stock"
      description="Parts with quantity at zero"
      icon={<AlertTriangle className="h-4 w-4" />}
      href="/admin/inventory"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-slate-900">{formatNumber(zeroStock.length)}</span>
        <span className="text-xs text-slate-500">parts at zero</span>
      </div>

      {sample.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {sample.map((part) => (
            <li key={part.part_id} className="text-xs text-slate-600">
              <span className="font-mono text-slate-500">{part.skaps_number}</span>
              <span className="mx-1.5 text-slate-300">&middot;</span>
              <span>{part.name}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
