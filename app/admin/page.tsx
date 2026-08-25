import type { ReactNode } from "react";
import { WelcomeHeader } from "@/components/dashboard/WelcomeHeader";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { createClient } from "@/lib/supabase/server";
import { parseDashboardLayout, type WidgetId } from "@/lib/dashboard/catalog";
import { WIDGET_COMPONENTS } from "@/lib/dashboard/widgets";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let layoutRaw: unknown = null;
  if (user) {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("dashboard_layout")
      .eq("user_id", user.id)
      .maybeSingle();
    layoutRaw = prefs?.dashboard_layout ?? null;
  }

  const layout = parseDashboardLayout(layoutRaw);

  // Render only the widgets that are actually placed. Hidden widgets are
  // never instantiated, so they do no database work.
  const nodes: Partial<Record<WidgetId, ReactNode>> = {};
  for (const placement of layout.widgets) {
    const Widget = WIDGET_COMPONENTS[placement.id];
    nodes[placement.id] = <Widget />;
  }

  return (
    <div className="space-y-8">
      <WelcomeHeader />
      <DashboardGrid initial={layout.widgets} nodes={nodes} />
    </div>
  );
}
