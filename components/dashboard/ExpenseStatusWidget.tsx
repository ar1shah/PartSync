import { DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { startOfBusinessDayOffset } from "@/lib/inventory/stock";
import { UsageByLineChartClient } from "./UsageByLineChartClient";

const WINDOW_DAYS = 30;

const EXPENSE_LABELS: Record<string, string> = {
  expensed: "Expensed out",
  not_expensed: "Not expensed",
  check_inventory: "Check inventory",
  datatex_zero: "Already 0 on Datatex",
  testing: "Testing",
};

export async function ExpenseStatusWidget() {
  const supabase = await createClient();
  const start = startOfBusinessDayOffset(-(WINDOW_DAYS - 1));

  const { data, error } = await supabase
    .from("submissions")
    .select("expense_status")
    .not("expense_status", "is", null)
    .gte("submitted_at", start.toISOString());

  if (error) {
    console.error("failed to load expense status breakdown", error);
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const key = row.expense_status ?? "";
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const series = Array.from(counts.entries())
    .map(([key, value]) => ({ label: EXPENSE_LABELS[key] ?? key, value }))
    .sort((a, b) => b.value - a.value);
  const total = series.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Expense status</h3>
            <p className="mt-0.5 text-xs text-slate-500">Coded submissions, last 30 days</p>
          </div>
          <div className="rounded-md bg-blue-50 p-2 text-blue-700">
            <DollarSign className="h-4 w-4" />
          </div>
        </div>

        {total === 0 ? (
          <p className="mt-6 text-xs text-slate-500">No expense-coded submissions in the last 30 days.</p>
        ) : (
          <div className="mt-4 h-72">
            <UsageByLineChartClient data={series} total={total} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
