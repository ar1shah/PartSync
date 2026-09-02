"use client";

import { Button } from "@/components/ui/button";
import type { InventoryPart } from "@/lib/inventory-backend/types";

interface Props {
  part: InventoryPart;
  onClose: () => void;
}

/**
 * Kept as a compatibility component for old imports. Direct editing of
 * Datatex-controlled master data is intentionally disabled in the new model.
 */
export function EditPartModal({ part, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">Master data is protected</h2>
        <p className="mt-2 text-sm text-slate-600">
          {part.skaps_number} is controlled by the SKAPS inventory workflow. Use Location Refresh
          for Zone, Location, and LWhsDesc changes. Technical attributes are managed through the
          specification workflow.
        </p>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
