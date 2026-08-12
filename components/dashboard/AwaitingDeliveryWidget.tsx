import { Truck } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export async function AwaitingDeliveryWidget() {
  const supabase = await createClient();

  const { data, count, error } = await supabase
    .from("submissions")
    .select("id, skaps_number, part_description, po_number, status", { count: "exact" })
    .eq("form_type", "request")
    .in("status", ["ordered", "in_transit"])
    .order("submitted_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("failed to load awaiting-delivery requests", error);
  }

  return (
    <WidgetCard
      title="Awaiting delivery"
      description="Ordered or in transit"
      icon={<Truck className="h-4 w-4" />}
      href="/admin/requests"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-slate-900">{formatNumber(count ?? 0)}</span>
        <span className="text-xs text-slate-500">on the way</span>
      </div>

      {data && data.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {data.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between text-xs text-slate-600">
              <span className="truncate">
                <span className="font-mono text-slate-500">{row.skaps_number ?? "?"}</span>
                <span className="mx-1.5 text-slate-300">&middot;</span>
                <span>{row.part_description ?? "(no description)"}</span>
              </span>
              <span className="ml-2 shrink-0 text-slate-400">
                {row.po_number ? `PO ${row.po_number}` : row.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Nothing awaiting delivery.</p>
      )}
    </WidgetCard>
  );
}
