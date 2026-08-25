import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadNotificationsWithRead } from "@/lib/notifications/read-state";
import { NotificationsInbox } from "./NotificationsInbox";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const notifications = await loadNotificationsWithRead(supabase, 200);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <Bell className="h-5 w-5 text-blue-700" />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </p>
        </div>
      </header>

      <div className="mt-6">
        <NotificationsInbox notifications={notifications} />
      </div>
    </div>
  );
}
