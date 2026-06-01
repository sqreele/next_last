"use client";

import React from "react";
import { Button } from "./button";
import { Search, Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavigationItems } from "@/app/lib/navigation";
import { cn } from "@/app/lib/utils/cn";
import { triggerHaptic } from "@/app/lib/hooks/useHaptic";
import { useT } from "@/app/lib/i18n/LocaleProvider";
import type { DictKey } from "@/app/lib/i18n/dictionary";

// Map nav item canonical names -> dictionary keys. Anything not in this map
// keeps the existing English literal via the fallback in useT().
const NAV_I18N: Record<string, DictKey> = {
  Dashboard: "nav.dashboard",
  "Maintenance Jobs": "nav.jobs",
  "My Jobs": "nav.myJobs",
  "Create Job": "nav.createJob",
  Inventory: "nav.inventory",
  Reports: "nav.reports",
  Rooms: "nav.rooms",
  Areas: "nav.areas",
};

interface MobileNavProps {
  className?: string;
  hidden?: boolean;
}

const navigationItems = primaryNavigationItems.filter((item) =>
  ["Dashboard", "Maintenance Jobs", "Create Job", "Inventory", "Reports"].includes(
    item.name,
  ),
);

export function MobileNav({ className, hidden = false }: MobileNavProps) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      className={cn(
        "fixed left-2 right-2 z-50 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(15,23,42,0.10)] sm:left-3 sm:right-3 md:hidden",
        "transition-transform duration-200 ease-out will-change-transform",
        hidden ? "translate-y-[calc(100%+1rem)]" : "translate-y-0",
        className,
      )}
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around gap-1 px-1.5 py-1.5 sm:px-2">
        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => triggerHaptic("selection")}
              className="flex-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              aria-current={isActive ? "page" : undefined}
              aria-label={`Navigate to ${item.name}`}
            >
              <div
                className={cn(
                  "flex flex-col items-center gap-1 px-1.5 py-2 rounded-xl transition-all duration-150 ease-out active:scale-95 touch-manipulation min-h-[56px] justify-center sm:px-2",
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "text-slate-700 hover:bg-slate-100 active:bg-slate-100",
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6 transition-colors",
                    isActive ? "text-white" : "text-slate-700",
                  )}
                  aria-hidden={true}
                />
                <span
                  className={cn(
                    "text-[11px] font-bold leading-tight",
                    isActive ? "text-white" : "text-slate-700",
                  )}
                >
                  {NAV_I18N[item.name] ? t(NAV_I18N[item.name]) : item.shortName}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileTopBar({ className }: MobileNavProps) {
  const pathname = usePathname();
  const t = useT();

  // Get page title based on current path
  const getPageTitle = () => {
    if (pathname.includes("/my-jobs") || pathname.includes("/myJobs"))
      return t("nav.myJobs");
    if (pathname.includes("/chartdashboard")) return "Analytics";
    if (pathname.includes("/jobs-report")) return t("nav.reports");
    if (pathname.includes("/create-job") || pathname.includes("/createJob"))
      return t("nav.createJob");
    if (pathname.includes("/profile")) return t("nav.profile");
    if (pathname.includes("/preventive-maintenance")) return t("nav.preventiveMaintenance");
    return t("nav.dashboard");
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm tablet:hidden safe-area-inset",
        className,
      )}
      role="banner"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="p-2 min-h-touch-target min-w-touch-target touch-manipulation hover:bg-slate-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Search"
          >
            <Search className="w-5 h-5 text-slate-700" aria-hidden={true} />
          </Button>
        </div>

        <h1 className="text-lg font-bold text-slate-900 text-balance truncate max-w-48">
          {getPageTitle()}
        </h1>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="p-2 relative min-h-touch-target min-w-touch-target touch-manipulation hover:bg-slate-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-slate-700" aria-hidden={true} />
            <span
              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full animate-pulse"
              aria-label="You have new notifications"
            />
          </Button>
        </div>
      </div>

      {/* Safe area spacer */}
      <div className="h-safe-top" />
    </header>
  );
}
