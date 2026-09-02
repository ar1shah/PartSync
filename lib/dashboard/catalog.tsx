import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DollarSign,
  GitBranch,
  History,
  Layers,
  MapPin,
  PieChart,
  Send,
  Truck,
  TrendingUp,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Client-safe dashboard metadata: widget ids, human labels, the default
 * layout, and layout parsing/validation. This module must NOT import any
 * server components so it can be pulled into the client-side DashboardGrid
 * (the edit-mode picker needs labels + icons). The server components
 * themselves live in ./widgets.tsx.
 */

export type WidgetId =
  | "consumed_today"
  | "yesterday_report"
  | "parts_in_repair"
  | "notifications"
  | "quick_form_links"
  | "top_consumers"
  | "usage_by_line"
  | "pm_type_breakdown"
  | "weekly_overview"
  | "low_stock"
  | "open_requests"
  | "urgent_requests"
  | "awaiting_delivery"
  | "expense_status"
  | "machine_area"
  | "overdue_repairs"
  | "inventory_totals"
  | "recent_activity";

export type WidgetSpan = 1 | 2 | 3;

export interface WidgetPlacement {
  id: WidgetId;
  span: WidgetSpan;
}

export interface DashboardLayout {
  widgets: WidgetPlacement[];
}

interface WidgetMeta {
  label: string;
  description: string;
  icon: ReactNode;
  defaultSpan: WidgetSpan;
}

export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  consumed_today: {
    label: "Parts consumed today",
    description: "Count and total quantity of today's used-form submissions.",
    icon: <ClipboardCheck className="h-4 w-4" />,
    defaultSpan: 1,
  },
  yesterday_report: {
    label: "Yesterday report",
    description: "Yesterday vs today used-form submission counts.",
    icon: <CalendarClock className="h-4 w-4" />,
    defaultSpan: 1,
  },
  parts_in_repair: {
    label: "Parts in repair",
    description: "Items currently out for external repair.",
    icon: <Wrench className="h-4 w-4" />,
    defaultSpan: 1,
  },
  notifications: {
    label: "Notifications",
    description: "Your latest alerts.",
    icon: <Bell className="h-4 w-4" />,
    defaultSpan: 2,
  },
  quick_form_links: {
    label: "Quick form links",
    description: "Shortcuts to the Google forms the team submits.",
    icon: <Send className="h-4 w-4" />,
    defaultSpan: 1,
  },
  top_consumers: {
    label: "Top consumers",
    description: "Highest-usage parts over the last 30 days.",
    icon: <TrendingUp className="h-4 w-4" />,
    defaultSpan: 1,
  },
  usage_by_line: {
    label: "Usage by line",
    description: "Used-form submissions grouped by line.",
    icon: <GitBranch className="h-4 w-4" />,
    defaultSpan: 1,
  },
  pm_type_breakdown: {
    label: "PM type breakdown",
    description: "Daily vs weekly vs emergency usage.",
    icon: <PieChart className="h-4 w-4" />,
    defaultSpan: 1,
  },
  weekly_overview: {
    label: "Weekly overview",
    description: "Submission counts for the last 7 days.",
    icon: <TrendingUp className="h-4 w-4" />,
    defaultSpan: 3,
  },
  low_stock: {
    label: "Out of stock",
    description: "Parts with quantity at zero in SKAPS Spare Parts Inventory.",
    icon: <AlertTriangle className="h-4 w-4" />,
    defaultSpan: 1,
  },
  open_requests: {
    label: "Open requests",
    description: "Parts requests still waiting to be actioned.",
    icon: <ClipboardList className="h-4 w-4" />,
    defaultSpan: 1,
  },
  urgent_requests: {
    label: "Urgent requests",
    description: "Open requests flagged with an urgency.",
    icon: <AlertTriangle className="h-4 w-4" />,
    defaultSpan: 1,
  },
  awaiting_delivery: {
    label: "Awaiting delivery",
    description: "Requests marked ordered or in transit.",
    icon: <Truck className="h-4 w-4" />,
    defaultSpan: 1,
  },
  expense_status: {
    label: "Expense status",
    description: "Expense breakdown of submissions, last 30 days.",
    icon: <DollarSign className="h-4 w-4" />,
    defaultSpan: 1,
  },
  machine_area: {
    label: "Usage by machine area",
    description: "Used-form submissions grouped by machine area.",
    icon: <MapPin className="h-4 w-4" />,
    defaultSpan: 1,
  },
  overdue_repairs: {
    label: "Overdue repairs",
    description: "Repairs past their expected return date.",
    icon: <Clock className="h-4 w-4" />,
    defaultSpan: 1,
  },
  inventory_totals: {
    label: "Inventory totals",
    description: "Part count, total quantity on hand, multi-location parts.",
    icon: <Layers className="h-4 w-4" />,
    defaultSpan: 1,
  },
  recent_activity: {
    label: "Recent activity",
    description: "Latest actions from the audit log.",
    icon: <History className="h-4 w-4" />,
    defaultSpan: 2,
  },
};

export const WIDGET_IDS = Object.keys(WIDGET_META) as WidgetId[];

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && value in WIDGET_META;
}

export function normalizeSpan(value: unknown): WidgetSpan {
  return value === 1 || value === 2 || value === 3 ? value : 1;
}

/**
 * The default arrangement reproduces the original hardcoded dashboard so an
 * admin who never customizes sees exactly what they saw before.
 */
export const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    { id: "consumed_today", span: 1 },
    { id: "yesterday_report", span: 1 },
    { id: "parts_in_repair", span: 1 },
    { id: "notifications", span: 2 },
    { id: "quick_form_links", span: 1 },
    { id: "top_consumers", span: 1 },
    { id: "usage_by_line", span: 1 },
    { id: "pm_type_breakdown", span: 1 },
    { id: "weekly_overview", span: 3 },
  ],
};

/**
 * Turns whatever JSON is stored in user_preferences.dashboard_layout into a
 * safe DashboardLayout: unknown ids are dropped, spans are clamped, and a
 * null/invalid value falls back to the default. Missing widgets stay missing
 * (hidden) on purpose -- that's how show/hide is persisted.
 */
export function parseDashboardLayout(raw: unknown): DashboardLayout {
  if (!raw || typeof raw !== "object" || !("widgets" in raw)) {
    return DEFAULT_LAYOUT;
  }
  const widgets = (raw as { widgets: unknown }).widgets;
  if (!Array.isArray(widgets)) return DEFAULT_LAYOUT;

  const seen = new Set<WidgetId>();
  const cleaned: WidgetPlacement[] = [];
  for (const entry of widgets) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    if (!isWidgetId(id) || seen.has(id)) continue;
    seen.add(id);
    cleaned.push({ id, span: normalizeSpan((entry as { span?: unknown }).span) });
  }

  return cleaned.length > 0 ? { widgets: cleaned } : DEFAULT_LAYOUT;
}
