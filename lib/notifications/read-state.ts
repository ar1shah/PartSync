import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Notification } from "@/lib/supabase/types";

/** A notification plus whether the *current* user has read it. */
export type NotificationWithRead = Notification & { read: boolean };

/**
 * Loads the latest notifications and merges in the current user's personal
 * read state from `notification_reads`. A notification is unread when there
 * is no read row for this user.
 */
export async function loadNotificationsWithRead(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<NotificationWithRead[]> {
  const [{ data: notifications, error }, { data: reads }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("notification_reads").select("notification_id"),
  ]);

  if (error) {
    console.error("failed to load notifications", error);
    return [];
  }

  const readIds = new Set((reads ?? []).map((r) => r.notification_id));
  return (notifications ?? []).map((n) => ({ ...n, read: readIds.has(n.id) }));
}
