import { Clock } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils";

export async function OverdueRepairsWidget() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data, count, error } = await supabase
    .from("parts_in_repair")
    .select("id, part_name, skaps_number, expected_return_at", { count: "exact" })
    .eq("status", "in_repair")
    .lt("expected_return_at", nowIso)
    .order("expected_return_at", { ascending: true })
    .limit(3);

  if (error) {
    console.error("failed to load overdue repairs", error);
  }

  return (
    <WidgetCard
      title="Overdue repairs"
      description="Past expected return date"
      icon={<Clock className="h-4 w-4" />}
      href="/admin/repair"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-slate-900">{formatNumber(count ?? 0)}</span>
        <span className="text-xs text-slate-500">overdue</span>
      </div>

      {data && data.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {data.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between text-xs text-slate-600">
              <span className="truncate">
                {item.skaps_number && (
                  <>
                    <span className="font-mono text-slate-500">{item.skaps_number}</span>
                    <span className="mx-1.5 text-slate-300">&middot;</span>
                  </>
                )}
                <span>{item.part_name}</span>
              </span>
              <span className="ml-2 shrink-0 font-medium text-red-600">
                {formatDate(item.expected_return_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No overdue repairs.</p>
      )}
    </WidgetCard>
  );
}
