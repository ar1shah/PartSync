import { AlertTriangle } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export async function LowStockWidget() {
  const supabase = await createClient();

  // Postgres can't compare two columns through PostgREST, so pull the parts
  // that have a threshold set and do the qty <= threshold check in TS.
  // Bound the scan — we only render the top 3 low-stock rows in the widget,
  // and filter qty <= threshold in TS because PostgREST can't compare columns.
  const { data, error } = await supabase
    .from("public_inventory")
    .select("id, skaps_number, name, quantity_on_hand, reorder_threshold")
    .not("reorder_threshold", "is", null)
    .order("quantity_on_hand", { ascending: true })
    .limit(200);

  if (error) {
    console.error("failed to load low-stock parts", error);
  }

  const low = (data ?? []).filter(
    (p) =>
      p.reorder_threshold !== null &&
      (p.quantity_on_hand ?? 0) <= (p.reorder_threshold ?? 0),
  );

  return (
    <WidgetCard
      title="Low stock"
      description="At or below reorder threshold"
      icon={<AlertTriangle className="h-4 w-4" />}
      href="/admin/inventory"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-slate-900">{formatNumber(low.length)}</span>
        <span className="text-xs text-slate-500">parts need attention</span>
      </div>

      {low.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {low.slice(0, 3).map((p) => (
            <li key={p.id} className="flex items-baseline justify-between text-xs text-slate-600">
              <span className="truncate">
                <span className="font-mono text-slate-500">{p.skaps_number ?? "?"}</span>
                <span className="mx-1.5 text-slate-300">&middot;</span>
                <span>{p.name ?? "(unnamed)"}</span>
              </span>
              <span className="ml-2 shrink-0 font-medium text-amber-600">
                {formatNumber(p.quantity_on_hand ?? 0)} / {formatNumber(p.reorder_threshold ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Everything is above its reorder point.</p>
      )}
    </WidgetCard>
  );
}
