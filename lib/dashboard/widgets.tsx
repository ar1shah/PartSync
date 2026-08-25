import type { ComponentType } from "react";
import { ConsumedTodayWidget } from "@/components/dashboard/ConsumedTodayWidget";
import { YesterdayReportWidget } from "@/components/dashboard/YesterdayReportWidget";
import { PartsInRepairWidget } from "@/components/dashboard/PartsInRepairWidget";
import { NotificationsPanel } from "@/components/dashboard/NotificationsPanel";
import { QuickFormLinks } from "@/components/dashboard/QuickFormLinks";
import { TopConsumersWidget } from "@/components/dashboard/TopConsumersWidget";
import { UsageByLineWidget } from "@/components/dashboard/UsageByLineWidget";
import { PmTypeBreakdownWidget } from "@/components/dashboard/PmTypeBreakdownWidget";
import { WeeklyOverviewChart } from "@/components/dashboard/WeeklyOverviewChart";
import { LowStockWidget } from "@/components/dashboard/LowStockWidget";
import { OpenRequestsWidget } from "@/components/dashboard/OpenRequestsWidget";
import { UrgentRequestsWidget } from "@/components/dashboard/UrgentRequestsWidget";
import { AwaitingDeliveryWidget } from "@/components/dashboard/AwaitingDeliveryWidget";
import { ExpenseStatusWidget } from "@/components/dashboard/ExpenseStatusWidget";
import { MachineAreaWidget } from "@/components/dashboard/MachineAreaWidget";
import { OverdueRepairsWidget } from "@/components/dashboard/OverdueRepairsWidget";
import { InventoryTotalsWidget } from "@/components/dashboard/InventoryTotalsWidget";
import { RecentActivityWidget } from "@/components/dashboard/RecentActivityWidget";
import type { WidgetId } from "./catalog";

/**
 * Server-side registry mapping each widget id to its (async server)
 * component. Kept separate from ./catalog.tsx so the client-side edit UI can
 * import labels/icons without pulling these server components into the bundle.
 */
export const WIDGET_COMPONENTS: Record<WidgetId, ComponentType> = {
  consumed_today: ConsumedTodayWidget,
  yesterday_report: YesterdayReportWidget,
  parts_in_repair: PartsInRepairWidget,
  notifications: NotificationsPanel,
  quick_form_links: QuickFormLinks,
  top_consumers: TopConsumersWidget,
  usage_by_line: UsageByLineWidget,
  pm_type_breakdown: PmTypeBreakdownWidget,
  weekly_overview: WeeklyOverviewChart,
  low_stock: LowStockWidget,
  open_requests: OpenRequestsWidget,
  urgent_requests: UrgentRequestsWidget,
  awaiting_delivery: AwaitingDeliveryWidget,
  expense_status: ExpenseStatusWidget,
  machine_area: MachineAreaWidget,
  overdue_repairs: OverdueRepairsWidget,
  inventory_totals: InventoryTotalsWidget,
  recent_activity: RecentActivityWidget,
};
