import { AlertTriangle } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { urgencyTone } from "@/lib/forms/normalize";
import { formatNumber } from "@/lib/utils";

export async function UrgentRequestsWidget() {
  const supabase = await createClient();

  const { data, count, error } = await supabase
    .from("submissions")
    .select("id, skaps_number, part_description, urgency", { count: "exact" })
    .eq("form_type", "request")
    .eq("status", "open")
    .not("urgency", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("failed to load urgent requests", error);
  }

  return (
    <WidgetCard
      title="Urgent requests"
      description="Open requests with an urgency flag"
      icon={<AlertTriangle className="h-4 w-4" />}
      href="/admin/requests"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-slate-900">{formatNumber(count ?? 0)}</span>
        <span className="text-xs text-slate-500">flagged</span>
      </div>

      {data && data.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="truncate">
                <span className="font-mono text-slate-500">{row.skaps_number ?? "?"}</span>
                <span className="mx-1.5 text-slate-300">&middot;</span>
                <span>{row.part_description ?? "(no description)"}</span>
              </span>
              {row.urgency && (
                <Badge tone={urgencyTone(row.urgency)} className="shrink-0">
                  {row.urgency}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No urgent requests right now.</p>
      )}
    </WidgetCard>
  );
}
