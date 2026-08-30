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
import {
  getActiveNavigationItem,
  isNavigationItemActive,
} from "@/app/lib/navigation-active.mjs";
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
  const hasActiveSecondaryItem = Boolean(
    getActiveNavigationItem(pathname, mobileSecondaryNavigation),
  );

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 shadow-[0_-4px_18px_rgba(15,23,42,0.08)] backdrop-blur-xl md:hidden",
        "transition-transform duration-200 ease-out will-change-transform",
        hidden ? "translate-y-full" : "translate-y-0",
        className,
      )}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around gap-0.5 px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
        {mobilePrimaryNavigation.map((item) => {
          const isActive = isNavigationItemActive(
            pathname,
            item,
            mobilePrimaryNavigation,
          );
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => triggerHaptic("selection")}
              className={cn(
                "min-w-0 flex-1 rounded-xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                item.name === "Create Job" && "order-none",
              )}
              aria-current={isActive ? "page" : undefined}
              aria-label={`Navigate to ${item.name}`}
            >
              <div
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-colors touch-manipulation sm:px-2",
                  isActive
                    ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground active:bg-muted",
                  item.name === "Create Job" &&
                    !isActive &&
                    "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6 transition-colors",
                    isActive
                      ? "text-primary"
                      : item.name === "Create Job"
                        ? "text-primary"
                        : "text-muted-foreground",
                  )}
                  aria-hidden={true}
                />
                <span
                  className={cn(
                    "max-w-full truncate text-[11px] font-semibold leading-none sm:text-xs",
                    isActive
                      ? "text-primary"
                      : item.name === "Create Job"
                        ? "text-primary"
                        : "text-muted-foreground",
                  )}
                >
                  {NAV_I18N[item.name] ? t(NAV_I18N[item.name]) : item.shortName}
                </span>
                {isActive ? (
                  <span
                    className="absolute bottom-0.5 h-1 w-4 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-muted-foreground transition-colors",
                "hover:bg-muted/70 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                hasActiveSecondaryItem &&
                  "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
              )}
              aria-label={
                hasActiveSecondaryItem
                  ? "Open more navigation; current page is in this menu"
                  : "Open more navigation"
              }
            >
              <Grid2X2 className="h-6 w-6" aria-hidden="true" />
              <span className="text-xs font-semibold leading-none">More</span>
              {hasActiveSecondaryItem ? (
                <span
                  className="absolute bottom-0.5 h-1 w-4 rounded-full bg-primary"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] rounded-t-2xl border-border bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
          >
            <SheetHeader className="border-b border-border pb-3 text-left">
              <SheetTitle className="text-lg font-semibold">More tools</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-2 gap-2 overflow-y-auto pb-1">
              {mobileSecondaryNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = isNavigationItemActive(
                  pathname,
                  item,
                  mobileSecondaryNavigation,
                );
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-16 min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isActive
                        ? "border-primary/30 bg-primary/10 font-semibold text-primary ring-1 ring-inset ring-primary/20"
                        : "border-border bg-card text-foreground hover:bg-muted/70",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words leading-5">{item.name}</span>
                    {isActive ? (
                      <span
                        className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    ) : null}
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
