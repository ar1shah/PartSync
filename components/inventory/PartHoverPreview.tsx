import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import { getStockStatus } from "@/lib/inventory/stock-status";
import type { InventoryPart } from "@/lib/inventory-backend/types";

/** Compact summary card shown in the SKAPS# hover tooltip on the parts-used log. */
export function PartHoverPreview({ part }: { part: InventoryPart }) {
  const { tone: stockTone, label: stockLabel } = getStockStatus(part);

  return (
    <div className="flex w-64 gap-3">
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
        {part.image_url ? (
          <img
            src={part.image_url}
            alt={part.name ?? ""}
            className="h-full w-full rounded-md object-contain"
          />
        ) : (
          <Package className="h-6 w-6 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs font-semibold text-slate-900">{part.skaps_number}</p>
        <p className="truncate text-sm text-slate-700">{part.name}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={stockTone} className="text-[10px]">
            {stockLabel}
          </Badge>
          {part.category && (
            <Badge tone="accent" className="text-[10px]">
              {part.category}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Qty:{" "}
          <span className="font-medium text-slate-700">{formatNumber(part.quantity_on_hand)}</span>
        </p>
      </div>
    </div>
  );
}
