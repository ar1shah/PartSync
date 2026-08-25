"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseDashboardLayout, type WidgetPlacement } from "@/lib/dashboard/catalog";
import type { Json } from "@/lib/supabase/types";

/**
 * Persists the current user's dashboard layout. Passing `null` clears it,
 * which makes the dashboard fall back to DEFAULT_LAYOUT again.
 */
export async function saveDashboardLayout(widgets: WidgetPlacement[] | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Re-validate whatever the client sent so we never store junk.
  const layout = widgets === null ? null : parseDashboardLayout({ widgets });

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      dashboard_layout: (layout as unknown as Json) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}
