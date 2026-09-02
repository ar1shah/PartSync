"use client";

import { MapPin, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import type { InventoryPart } from "@/lib/inventory-backend/types";

interface Props {
  part: InventoryPart;
  onClick: () => void;
}

export function PartTileCard({ part, onClick }: Props) {
  const qty = part.quantity_on_hand ?? 0;
  const threshold = part.reorder_threshold;
  const stockTone: "success" | "warning" | "danger" =
    qty <= 0
      ? "danger"
      : threshold !== null && threshold !== undefined && qty <= threshold
        ? "warning"
        : "success";
  const stockLabel =
    qty <= 0
      ? "Out of stock"
      : threshold !== null && qty <= threshold
        ? "Low stock"
        : "In stock";

  const variantCount = part.variant_count ?? part.variants.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        "transition-all duration-150 hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
      )}
      aria-label={`View details for ${part.name}`}
    >
      {/* Image area */}
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden border-b border-slate-100 bg-slate-50">
        {part.image_url ? (
          <img
            src={part.image_url}
            alt={part.name ?? ""}
            className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <Package className="h-10 w-10 text-slate-300 transition-colors group-hover:text-slate-400" />
        )}
        {/* Multi-location badge */}
        {variantCount > 1 && (
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-slate-700/80 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
            <MapPin className="h-2.5 w-2.5" />
            {variantCount} locations
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="font-mono text-sm font-bold leading-tight text-slate-900">{part.skaps_number}</p>
        <p className="line-clamp-2 text-xs leading-snug text-slate-500">{part.name}</p>
        {part.category && <p className="truncate text-xs text-slate-400">{part.category}</p>}
        <div className="mt-auto flex items-center justify-between pt-2">
          <Badge tone={stockTone} className="text-[10px]">
            {stockLabel}
          </Badge>
          <span className="text-xs font-semibold text-slate-700">{formatNumber(qty)}</span>
        </div>
      </div>
    </button>
  );
}
