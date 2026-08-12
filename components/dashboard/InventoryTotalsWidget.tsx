import { Layers } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export async function InventoryTotalsWidget() {
  const supabase = await createClient();

  const [partsCount, multiLocation, qtyRows] = await Promise.all([
    supabase.from("parts").select("id", { count: "exact", head: true }),
    supabase
      .from("public_inventory")
      .select("id", { count: "exact", head: true })
      .gt("variant_count", 1),
    supabase.from("public_inventory").select("quantity_on_hand"),
  ]);

  if (partsCount.error) console.error("failed to count parts", partsCount.error);
  if (multiLocation.error) console.error("failed to count multi-location parts", multiLocation.error);
  if (qtyRows.error) console.error("failed to sum quantity on hand", qtyRows.error);

  const totalQty = (qtyRows.data ?? []).reduce(
    (sum, row) => sum + (typeof row.quantity_on_hand === "number" ? row.quantity_on_hand : 0),
    0,
  );

  const stats: { label: string; value: number }[] = [
    { label: "Distinct parts", value: partsCount.count ?? 0 },
    { label: "Total qty on hand", value: totalQty },
    { label: "Multi-location parts", value: multiLocation.count ?? 0 },
  ];

  return (
    <WidgetCard
      title="Inventory totals"
      description="Master list at a glance"
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
