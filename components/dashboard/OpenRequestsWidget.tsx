import { ClipboardList } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, formatRelativeTime } from "@/lib/utils";

export async function OpenRequestsWidget() {
  const supabase = await createClient();

  const { data, count, error } = await supabase
    .from("submissions")
    .select("id, skaps_number, part_description, submitted_at", { count: "exact" })
    .eq("form_type", "request")
    .eq("status", "open")
    .order("submitted_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("failed to load open requests", error);
  }

  return (
    <WidgetCard
      title="Open requests"
      description="Waiting to be actioned"
      icon={<ClipboardList className="h-4 w-4" />}
      href="/admin/requests"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold text-slate-900">{formatNumber(count ?? 0)}</span>
        <span className="text-xs text-slate-500">open</span>
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
                {formatRelativeTime(row.submitted_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No open requests right now.</p>
      )}
    </WidgetCard>
  );
}
