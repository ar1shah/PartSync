import { Suspense, type ReactNode } from "react";
import { WelcomeHeader } from "@/components/dashboard/WelcomeHeader";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { WidgetSkeleton } from "@/components/admin/AdminSkeletons";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, getUserPreferences } from "@/lib/supabase/session";
import {
  canUseWidget,
  parseDashboardLayout,
  widgetIdsForRole,
  type WidgetId,
} from "@/lib/dashboard/catalog";
import { getRole } from "@/lib/auth/roles";
import { WIDGET_COMPONENTS } from "@/lib/dashboard/widgets";

export const dynamic = "force-dynamic";

const TALL_WIDGETS = new Set<WidgetId>([
  "usage_by_line",
  "pm_type_breakdown",
  "machine_area",
  "weekly_overview",
]);

export default async function AdminDashboardPage() {
  const user = await getSessionUser();
  const supabase = await createClient();

  let layoutRaw: unknown = null;
  const role = user ? await getRole(user.id) : "staff";
  if (user) {
    // Shared with the admin layout's read via React cache -- one round trip.
    const prefs = await getUserPreferences(user.id);
    layoutRaw = prefs?.dashboard_layout ?? null;
  }

  const parsed = parseDashboardLayout(layoutRaw);
  // Drop widgets this role can't see (e.g. Recent activity for staff), even if
  // they were saved into the layout earlier.
  const layout = { widgets: parsed.widgets.filter((p) => canUseWidget(role, p.id)) };

  // Render only the widgets that are actually placed. Hidden widgets are
  // never instantiated, so they do no database work. Each widget streams
  // behind its own Suspense boundary so the shell paints immediately.
  const nodes: Partial<Record<WidgetId, ReactNode>> = {};
  for (const placement of layout.widgets) {
    const Widget = WIDGET_COMPONENTS[placement.id];
    nodes[placement.id] = (
      <Suspense fallback={<WidgetSkeleton tall={TALL_WIDGETS.has(placement.id)} />}>
        <Widget />
      </Suspense>
    );
  }

  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <div className="flex items-center gap-4" aria-busy="true">
            <div className="h-14 w-14 animate-pulse rounded-full bg-slate-200/80" />
            <div className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200/80" />
              <div className="h-7 w-56 animate-pulse rounded bg-slate-200/80" />
            </div>
          </div>
        }
      >
        <WelcomeHeader />
      </Suspense>
      <DashboardGrid
        initial={layout.widgets}
        nodes={nodes}
        allowedIds={widgetIdsForRole(role)}
      />
    </div>
  );
}
