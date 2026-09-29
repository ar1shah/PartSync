import { MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { startOfBusinessDayOffset } from "@/lib/inventory/stock";
import { capBreakdown, groupSubmissionsByField } from "@/lib/inventory/aggregate";
import { UsageByLineChartClient } from "./UsageByLineChartClient";

const WINDOW_DAYS = 30;
const MAX_SLICES = 8;

export async function MachineAreaWidget() {
  const supabase = await createClient();
  const start = startOfBusinessDayOffset(-(WINDOW_DAYS - 1));

  const { data, error } = await supabase
    .from("submissions")
    .select("machine_area, quantity")
    .eq("form_type", "used")
    .gte("submitted_at", start.toISOString());

  if (error) {
    console.error("failed to load machine-area submissions", error);
  }

  const breakdown = capBreakdown(groupSubmissionsByField(data ?? [], "machine_area"), MAX_SLICES);
  const series = breakdown.map((b) => ({ label: b.label, value: b.count }));
  const total = series.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Usage by machine area</h3>
            <p className="mt-0.5 text-xs text-slate-500">Used-form submissions, last 30 days</p>
          </div>
          <div className="rounded-md bg-blue-50 p-2 text-blue-700">
            <MapPin className="h-4 w-4" />
          </div>
        </div>

        {total === 0 ? (
          <p className="mt-6 text-xs text-slate-500">No used-form submissions in the last 30 days.</p>
        ) : (
          <div className="mt-4 h-72">
            <UsageByLineChartClient data={series} total={total} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
