"use client";

import { useEffect, useState } from "react";
import { MapPin, Package, QrCode, Radio, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import { getStockStatus } from "@/lib/inventory/stock-status";
import type {
  InventoryLocation,
  InventoryPart,
  InventorySpecification,
} from "@/lib/inventory-backend/types";

interface Props {
  part: InventoryPart;
  onClose: () => void;
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs font-medium tracking-wider text-slate-400 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-slate-800">{String(value)}</dd>
    </div>
  );
}

function variantLabel(v: InventoryLocation, idx: number): string {
  return v.lwhsdesc?.trim() || v.zone?.trim() || v.storage_location?.trim() || `Location ${idx + 1}`;
}

function SpecificationRow({ spec }: { spec: InventorySpecification }) {
  const display =
    spec.display_value ??
    spec.value_text ??
    (spec.value_numeric === null
      ? null
      : `${formatNumber(spec.value_numeric)}${spec.unit ? ` ${spec.unit}` : ""}`);
  if (!display) return null;

  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <dt className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">{spec.name}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{display}</dd>
    </div>
  );
}

export function PartDetailModal({ part, onClose }: Props) {
  const qty = part.quantity_on_hand ?? 0;
  const { tone: stockTone, label: stockLabel } = getStockStatus(part);
  const variants = part.variants;
  const hasVariants = variants.length > 0;
  const [activeIdx, setActiveIdx] = useState(0);

  const activeLocation: InventoryLocation | null = hasVariants
    ? (variants[activeIdx] ?? variants[0] ?? null)
    : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${part.name}`}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="overflow-y-auto">
          <div className="flex gap-5 border-b border-slate-100 p-5">
            <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
              {part.image_url ? (
                <img
                  src={part.image_url}
                  alt={part.name}
                  className="h-full w-full rounded-lg object-contain"
                />
              ) : (
                <Package className="h-12 w-12 text-slate-300" />
              )}
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <h2 className="font-mono text-xl leading-tight font-bold text-slate-900">
                {part.skaps_number}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{part.name}</p>
              {part.description && (
                <p className="mt-1.5 text-sm leading-snug text-slate-600">{part.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={stockTone}>{stockLabel}</Badge>
                <span className="text-sm font-medium text-slate-700">
                  Qty: <span className="font-semibold">{formatNumber(qty)}</span>
                </span>
                {part.category && <Badge tone="accent">{part.category}</Badge>}
                {part.sub_category && <Badge tone="neutral">{part.sub_category}</Badge>}
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <QrCode className="h-4 w-4" /> QR
              </div>
              <p className="mt-1 break-all font-mono text-sm text-slate-800">
                {part.qr_code ?? "Not assigned"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Radio className="h-4 w-4" /> RFID
              </div>
              <p className="mt-1 text-sm text-slate-800">
                {part.active_rfid_tag_count > 0
                  ? `${part.active_rfid_tag_count} active tag${part.active_rfid_tag_count === 1 ? "" : "s"}`
                  : "No active tag"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <MapPin className="h-4 w-4" /> Locations
              </div>
              <p className="mt-1 text-sm text-slate-800">
                {formatNumber(part.inventory_location_count)} inventory location
                {part.inventory_location_count === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {hasVariants && variants.length > 1 && (
            <div className="border-b border-slate-100 bg-white px-5">
              <div className="flex items-center gap-1 overflow-x-auto py-2" role="tablist">
                <MapPin className="mr-1 h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden />
                {variants.map((v, idx) => (
                  <button
                    key={v.id}
                    role="tab"
                    aria-selected={idx === activeIdx}
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    className={cn(
                      "flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      idx === activeIdx
                        ? "bg-blue-700 text-white"
                        : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    {variantLabel(v, idx)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <DetailField label="Main Category" value={part.category} />
              <DetailField label="Sub-Category" value={part.sub_category} />
              <DetailField label="Location on Machine" value={part.location_on_machine} />
              <DetailField label="Line No." value={part.line_no} />
              <DetailField label="Warehouses" value={part.warehouses} />
              <DetailField label="Last Updated" value={formatDate(part.updated_at)} />
            </dl>

            {activeLocation && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  {variants.length > 1
                    ? `Inventory location: ${variantLabel(activeLocation, activeIdx)}`
                    : "Inventory location"}
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
                  <DetailField label="Warehouse / LWhsDesc" value={activeLocation.lwhsdesc} />
                  <DetailField label="Quantity at location" value={activeLocation.quantity} />
                  <DetailField label="Zone" value={activeLocation.zone} />
                  <DetailField label="Location" value={activeLocation.location} />
                  <DetailField label="Storage Location" value={activeLocation.storage_location} />
                  <DetailField label="Location on Machine" value={activeLocation.location_on_machine} />
                  <DetailField label="Line No." value={activeLocation.line_no} />
                </dl>
              </div>
            )}

            {part.specifications.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Technical specifications
                </h3>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {part.specifications.map((spec) => (
                    <SpecificationRow key={spec.key} spec={spec} />
                  ))}
                </dl>
              </div>
            )}

            <div className="mt-6 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Master identity fields are controlled by the SKAPS inventory database. Zone, Location,
              and LWhsDesc changes should use the controlled Location Refresh workflow rather than
              editing imported Datatex records directly.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
