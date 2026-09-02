import type { InventoryPart } from "@/lib/inventory-backend/types";

export type StockTone = "success" | "warning" | "danger";

/** Shared stock tone/label logic so the detail modal and hover preview agree. */
export function getStockStatus(part: InventoryPart): { tone: StockTone; label: string } {
  const qty = part.quantity_on_hand ?? 0;
  const threshold = part.reorder_threshold;

  if (qty <= 0) return { tone: "danger", label: "Out of stock" };
  if (threshold !== null && threshold !== undefined && qty <= threshold) {
    return { tone: "warning", label: "Low stock" };
  }
  return { tone: "success", label: "In stock" };
}
