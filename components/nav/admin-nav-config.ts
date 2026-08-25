import {
  Bell,
  BoxIcon,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  History,
  LayoutDashboard,
  ScrollText,
  Settings,
  Truck,
  Wrench,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

export const adminNavSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/reports/yesterday", label: "Yesterday report", icon: CalendarClock },
      { href: "/admin/audit", label: "Activity log", icon: ScrollText },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/used", label: "Parts used", icon: ClipboardCheck },
      { href: "/admin/requests", label: "Parts requests", icon: ClipboardList },
      { href: "/admin/inventory", label: "Inventory", icon: BoxIcon },
      { href: "/admin/repair", label: "Parts in repair", icon: Wrench },
    ],
  },
  {
    label: "Logistics",
    items: [
      { href: "/admin/delivered", label: "Delivered / In transit", icon: Truck },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/admin/changelog", label: "Changelog", icon: History },
    ],
  },
];

export function isNavItemActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** Resolves the current page's nav label for use in the mobile header. */
export function getActiveNavLabel(pathname: string): string {
  for (const section of adminNavSections) {
    for (const item of section.items) {
      if (isNavItemActive(item, pathname)) {
        return item.label;
      }
    }
  }
  return "SKAPS Admin";
}
