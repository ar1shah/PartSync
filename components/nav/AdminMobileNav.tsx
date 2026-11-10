"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";
import {
  getActiveNavLabel,
  isNavItemActive,
  navSectionsForRole,
} from "@/components/nav/admin-nav-config";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";

/**
 * Mobile-only header + slide-out drawer mirroring AdminSidebar's links.
 * Hidden at lg+ where the desktop sidebar takes over.
 */
export function AdminMobileNav({ unreadCount, role }: { unreadCount: number; role: AppRole }) {
  const pathname = usePathname();
  const sections = navSectionsForRole(role);
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <header
        className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <Link href="/admin" className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-blue-700" />
          <span className="text-sm font-semibold text-slate-900">
            {getActiveNavLabel(pathname)}
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="admin-mobile-drawer"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50"
          onClick={() => setOpen(false)}
        >
          <div
            id="admin-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="fixed inset-y-0 left-0 flex w-[min(280px,85vw)] flex-col bg-white shadow-xl"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <div className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-blue-700" />
                <span className="text-sm font-semibold text-slate-900">SKAPS Admin</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {ROLE_LABELS[role]}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {sections.map((section, index) => (
                <div key={section.label} className={cn(index > 0 && "mt-5")}>
                  <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isNavItemActive(item, pathname);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                            active
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="flex-1">{item.label}</span>
                          {item.href === "/admin/notifications" && unreadCount > 0 && (
                            <span className="rounded-full bg-blue-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div
              className="border-t border-slate-200 p-3"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
