"use client";

import React from "react";
import { Button } from "./button";
import { Search, Bell, Grid2X2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  mobilePrimaryNavigation,
  mobileSecondaryNavigation,
} from "@/app/design-system/navigation-config";
import { cn } from "@/app/lib/utils/cn";
import { triggerHaptic } from "@/app/lib/hooks/useHaptic";
import { useT } from "@/app/lib/i18n/LocaleProvider";
import type { DictKey } from "@/app/lib/i18n/dictionary";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

// Map nav item canonical names -> dictionary keys. Anything not in this map
// keeps the existing English literal via the fallback in useT().
const NAV_I18N: Record<string, DictKey> = {
  Dashboard: "nav.dashboard",
  Overview: "nav.dashboard",
  "Maintenance Jobs": "nav.jobs",
  "Work Orders": "nav.jobs",
  "My Jobs": "nav.myJobs",
  "Create Job": "nav.createJob",
  Inventory: "nav.inventory",
  Reports: "nav.reports",
  Rooms: "nav.rooms",
  Areas: "nav.areas",
  Machines: "nav.machines",
};

interface MobileNavProps {
  className?: string;
  hidden?: boolean;
}

export function MobileNav({ className, hidden = false }: MobileNavProps) {
  const pathname = usePathname();
  const t = useT();
  const [moreOpen, setMoreOpen] = React.useState(false);

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background md:hidden",
        "transition-transform duration-200 ease-out will-change-transform",
        hidden ? "translate-y-full" : "translate-y-0",
        className,
      )}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around gap-1 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
        {mobilePrimaryNavigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => triggerHaptic("selection")}
              className={cn(
                "flex-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                item.name === "Create Job" && "order-none",
              )}
              aria-current={isActive ? "page" : undefined}
              aria-label={`Navigate to ${item.name}`}
            >
              <div
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 transition-colors touch-manipulation sm:px-2",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted",
                  item.name === "Create Job" &&
                    "bg-primary text-primary-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6 transition-colors",
                    isActive || item.name === "Create Job"
                      ? "text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                  aria-hidden={true}
                />
                <span
                  className={cn(
                    "text-xs font-semibold leading-none",
                    isActive || item.name === "Create Job"
                      ? "text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {NAV_I18N[item.name] ? t(NAV_I18N[item.name]) : item.shortName}
                </span>
              </div>
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
              aria-label="Open more navigation"
            >
              <Grid2X2 className="h-6 w-6" aria-hidden="true" />
              <span className="text-xs font-semibold leading-none">More</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[80dvh] rounded-t-2xl border-border bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <SheetHeader className="text-left">
              <SheetTitle>More tools</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-2 gap-2 overflow-y-auto">
              {mobileSecondaryNavigation.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm font-medium",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
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
    if (pathname.includes("/machines")) return t("nav.machines");
    if (pathname.includes("/preventive-maintenance")) return t("nav.preventiveMaintenance");
    return t("nav.dashboard");
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border bg-background tablet:hidden safe-area-inset",
        className,
      )}
      role="banner"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-touch-target min-w-touch-target p-2 touch-manipulation"
            aria-label="Search"
          >
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden={true} />
          </Button>
        </div>

        <h1 className="max-w-48 truncate text-balance text-lg font-semibold text-foreground">
          {getPageTitle()}
        </h1>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="relative min-h-touch-target min-w-touch-target p-2 touch-manipulation"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-muted-foreground" aria-hidden={true} />
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
