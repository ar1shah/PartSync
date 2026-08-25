"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function currentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function markAsRead(id: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) throw new Error("Not signed in");

  const { error } = await supabase
    .from("notification_reads")
    .upsert(
      { notification_id: id, user_id: userId, read_at: new Date().toISOString() },
      { onConflict: "notification_id,user_id" },
    );
  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
}

export async function markAsUnread(id: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) throw new Error("Not signed in");

  const { error } = await supabase
    .from("notification_reads")
    .delete()
    .eq("notification_id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
}

export async function markAllAsRead() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
}
