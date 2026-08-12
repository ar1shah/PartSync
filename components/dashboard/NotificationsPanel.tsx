import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownCircle,
  Bell,
  CircleAlert,
  CircleHelp,
  ClipboardList,
} from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { createClient } from "@/lib/supabase/server";
import { loadNotificationsWithRead } from "@/lib/notifications/read-state";
import { cn, formatDateTime } from "@/lib/utils";

const iconByType: Record<string, React.ReactNode> = {
  new_request: <ClipboardList className="h-3.5 w-3.5" />,
  urgent_request: <CircleAlert className="h-3.5 w-3.5" />,
  low_stock: <AlertTriangle className="h-3.5 w-3.5" />,
  unknown_skaps: <CircleHelp className="h-3.5 w-3.5" />,
  stock_updated: <ArrowDownCircle className="h-3.5 w-3.5" />,
};

const toneBgByType: Record<string, string> = {
  new_request: "bg-blue-100 text-blue-700",
  urgent_request: "bg-red-100 text-red-700",
  low_stock: "bg-amber-100 text-amber-700",
  unknown_skaps: "bg-slate-100 text-slate-600",
  stock_updated: "bg-green-100 text-green-700",
};

export async function NotificationsPanel() {
  const supabase = await createClient();
  const notifications = await loadNotificationsWithRead(supabase, 3);

  return (
    <WidgetCard
      title="Notifications"
      description="Latest 3 alerts"
      icon={<Bell className="h-4 w-4" />}
      href="/admin/notifications"
    >
      {notifications.length === 0 ? (
        <p className="text-xs text-slate-500">No notifications yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {notifications.map((n) => (
            <li key={n.id} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  toneBgByType[n.type] ?? "bg-slate-100 text-slate-600",
                )}
              >
                {iconByType[n.type] ?? <Bell className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-snug text-slate-900">
                  {n.link ? (
                    <Link href={n.link} className="hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    n.title
                  )}
                </p>
                <p className="text-xs text-slate-500">{formatDateTime(n.created_at)}</p>
              </div>
              {!n.read && (
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-700" />
              )}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
