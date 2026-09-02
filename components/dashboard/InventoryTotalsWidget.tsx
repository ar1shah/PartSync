import { Layers } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { createInventoryServiceClient } from "@/lib/inventory-backend/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { formatNumber } from "@/lib/utils";

export async function InventoryTotalsWidget() {
  const inventory = createInventoryServiceClient();

  const [partsCount, multiLocation, qtyRows] = await Promise.all([
    inventory.from("parts_app_view").select("part_id", { count: "exact", head: true }).eq("active", true),
    inventory
      .from("parts_app_view")
      .select("part_id", { count: "exact", head: true })
      .eq("active", true)
      .gt("inventory_location_count", 1),
    fetchAllRows<{ current_quantity: number | string | null }>((from, to) =>
      inventory
        .from("parts_app_view")
        .select("current_quantity")
        .eq("active", true)
        .range(from, to),
    ),
  ]);

  if (partsCount.error) console.error("failed to count inventory parts", partsCount.error);
  if (multiLocation.error) console.error("failed to count multi-location parts", multiLocation.error);
  if (qtyRows.error) console.error("failed to sum inventory quantity", qtyRows.error);

  const totalQty = qtyRows.data.reduce((sum, row) => {
    const qty = Number(row.current_quantity ?? 0);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);

  const stats = [
    { label: "Distinct parts", value: partsCount.count ?? 0 },
    { label: "Total qty on hand", value: totalQty },
    { label: "Multi-location parts", value: multiLocation.count ?? 0 },
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
