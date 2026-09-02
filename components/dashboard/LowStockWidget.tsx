import { AlertTriangle } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { createInventoryServiceClient } from "@/lib/inventory-backend/server";
import { formatNumber } from "@/lib/utils";

export async function LowStockWidget() {
  const inventory = createInventoryServiceClient();

  const [{ count, error: countError }, { data, error }] = await Promise.all([
    inventory
      .from("parts_app_view")
      .select("part_id", { count: "exact", head: true })
      .eq("active", true)
      .lte("current_quantity", 0),
    inventory
      .from("parts_app_view")
      .select("part_id,skaps_number,product_name,current_quantity")
      .eq("active", true)
      .lte("current_quantity", 0)
      .order("skaps_number", { ascending: true })
      .limit(3),
  ]);

  if (countError) console.error("failed to count zero-stock parts", countError);
  if (error) console.error("failed to load zero-stock sample", error);

  return (
    <WidgetCard
      title="Out of stock"
      description="Parts with quantity at zero"
      icon={<AlertTriangle className="h-4 w-4" />}
      href="/admin/inventory"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-slate-900">{formatNumber(count ?? 0)}</span>
        <span className="text-xs text-slate-500">parts at zero</span>
      </div>

      {(data ?? []).length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {(data ?? []).map((p) => (
            <li key={p.part_id} className="text-xs text-slate-600">
              <span className="font-mono text-slate-500">{p.skaps_number ?? "?"}</span>
              <span className="mx-1.5 text-slate-300">&middot;</span>
              <span>{p.product_name ?? "(unnamed)"}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
