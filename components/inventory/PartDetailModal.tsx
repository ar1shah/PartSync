"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, MapPin, Package, QrCode, Radio, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatNumber, formatDate } from "@/lib/utils";
import { getStockStatus } from "@/lib/inventory/stock-status";
import { uploadPartImage } from "@/lib/inventory-backend/detail-action";
import type {
  InventoryLocation,
  InventoryPart,
  InventorySpecification,
} from "@/lib/inventory-backend/types";

interface Props {
  part: InventoryPart;
  onClose: () => void;
  onImageChange?: (partId: number, imageUrl: string) => void;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

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

export function PartDetailModal({ part, onClose, onImageChange }: Props) {
  const qty = part.quantity_on_hand ?? 0;
  const { tone: stockTone, label: stockLabel } = getStockStatus(part);
  const variants = part.variants;
  const hasVariants = variants.length > 0;
  const [activeIdx, setActiveIdx] = useState(0);
  const [imageUrl, setImageUrl] = useState(part.image_url);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<(file: File) => void>(() => {});

  const activeLocation: InventoryLocation | null = hasVariants
    ? (variants[activeIdx] ?? variants[0] ?? null)
    : null;

  function handleImageFile(file: File) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast.error("Image must be JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be 15 MB or smaller.");
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setImageUrl(localPreview);

    const formData = new FormData();
    formData.set("skaps_number", part.skaps_number);
    formData.set("part_id", String(part.part_id));
    formData.set("image", file);

    startTransition(async () => {
      const result = await uploadPartImage(formData);
      URL.revokeObjectURL(localPreview);
      if (!result.ok) {
        toast.error(result.error);
        setImageUrl(part.image_url);
        return;
      }
      setImageUrl(result.imageUrl);
      onImageChange?.(part.part_id, result.imageUrl);
      toast.success("Image saved");
    });
  }

  uploadRef.current = handleImageFile;

  useEffect(() => {
    setImageUrl(part.image_url);
  }, [part.image_url, part.part_id]);

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

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          uploadRef.current(file);
          return;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

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
            <div
              className={cn(
                "relative flex h-32 w-32 flex-shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed bg-slate-50 transition-colors",
                dragOver ? "border-blue-500 bg-blue-50" : "border-slate-200",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleImageFile(file);
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={part.name}
                  className="h-full w-full rounded-lg object-contain"
                />
              ) : (
                <Package className="h-12 w-12 text-slate-300" />
              )}
              {pending && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-700" />
                </div>
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : imageUrl ? (
                    <ImagePlus className="h-4 w-4" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {imageUrl ? "Replace image" : "Add image"}
                </Button>
                <span className="text-xs text-slate-400">
                  Drop a file, browse, or paste (Ctrl+V)
                </span>
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
              editing imported Datatex records directly. Quantities are updated via Excel import.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
