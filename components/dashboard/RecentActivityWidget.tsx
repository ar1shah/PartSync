import { History } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";

export async function RecentActivityWidget() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_label, summary, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("failed to load recent activity", error);
  }

  const entries = data ?? [];

  return (
    <WidgetCard
      title="Recent activity"
      description="Latest admin actions"
      icon={<History className="h-4 w-4" />}
      href="/admin/audit"
    >
      {entries.length === 0 ? (
        <p className="text-xs text-slate-500">No activity recorded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-900">{e.summary}</p>
                <p className="text-xs text-slate-500">{e.actor_label ?? "Unknown"}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">
                {formatRelativeTime(e.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
