import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { normalizeSkapsNumber } from "@/lib/forms/normalize";
import { TopConsumersChartClient } from "./TopConsumersChartClient";

const TOP_N = 8;

export async function TopConsumersWidget() {
  // Usage history remains in the legacy PartSync submissions table during
  // phase 1. Aggregate from submissions directly instead of old public_inventory.
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("submissions")
    .select("skaps_number,quantity")
    .eq("form_type", "used")
    .gte("submitted_at", since)
    .not("skaps_number", "is", null);

  if (error) console.error("failed to load usage submissions", error);

  const totals = new Map<string, { label: string; value: number }>();
  for (const row of data ?? []) {
    if (!row.skaps_number) continue;
    const key = normalizeSkapsNumber(row.skaps_number);
    if (!key) continue;
    const current = totals.get(key) ?? { label: row.skaps_number, value: 0 };
    current.value += Number(row.quantity ?? 0) || 0;
    totals.set(key, current);
  }

  const series = Array.from(totals.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Top consumers</h3>
            <p className="mt-0.5 text-xs text-slate-500">Highest logged usage in the last 30 days</p>
          </div>
          <div className="rounded-md bg-blue-50 p-2 text-blue-700">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>

        {series.length === 0 ? (
          <p className="mt-6 text-xs text-slate-500">No usage recorded in the last 30 days.</p>
        ) : (
          <div className="mt-4 h-72">
            <TopConsumersChartClient data={series} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
