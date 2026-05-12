"use client";

import React from "react";
import { Button } from "./button";
import { Search, Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavigationItems } from "@/app/lib/navigation";

interface MobileNavProps {
  className?: string;
}

const navigationItems = primaryNavigationItems.filter((item) =>
  ["Dashboard", "Maintenance Jobs", "Create Job", "Reports"].includes(
    item.name,
  ),
);

export function MobileNav({ className }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={`fixed left-3 right-3 z-50 rounded-[2rem] border border-[var(--pcms-border)] bg-white/92 shadow-[var(--pcms-shadow)] backdrop-blur-xl md:hidden ${className || ""}`}
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around gap-1 px-2 py-2">
        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex-1 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/45"
            >
              <div
                className={`
                  flex flex-col items-center gap-1 px-2 py-2.5
                  rounded-2xl transition-all duration-200 ease-in-out active:scale-95
                  touch-manipulation relative min-h-[56px] justify-center
                  ${
                    isActive
                      ? "bg-[var(--pcms-accent-gradient)] text-white shadow-[var(--pcms-button-shadow)]"
                      : "text-slate-500 hover:bg-[var(--pcms-primary-soft)] hover:text-[var(--pcms-primary-strong)] active:bg-[var(--pcms-primary-soft)]"
                  }
                `}
                aria-label={`Navigate to ${item.name}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  className={`h-6 w-6 transition-all duration-200 ${isActive ? "text-white" : "text-slate-500"}`}
                  aria-hidden={true}
                />
                <span className={`text-[10px] font-semibold leading-tight ${isActive ? "text-white" : "text-slate-500"}`}>
                  {item.shortName}
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

  // Get page title based on current path
  const getPageTitle = () => {
    if (pathname.includes("/my-jobs") || pathname.includes("/myJobs"))
      return "My Jobs";
    if (pathname.includes("/chartdashboard")) return "Analytics";
    if (pathname.includes("/jobs-report")) return "Jobs Report";
    if (pathname.includes("/create-job") || pathname.includes("/createJob"))
      return "Create Job";
    if (pathname.includes("/profile")) return "Profile";
    if (pathname.includes("/preventive-maintenance")) return "Maintenance";
    return "Dashboard";
  };

  return (
    <header
      className={`sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm tablet:hidden safe-area-inset ${className || ""}`}
      role="banner"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="p-2 min-h-touch-target min-w-touch-target touch-manipulation hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Search"
          >
            <Search className="w-5 h-5 text-gray-600" aria-hidden={true} />
          </Button>
        </div>

        <h1 className="text-lg font-semibold text-blue-700 text-balance truncate max-w-48">
          {getPageTitle()}
        </h1>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="p-2 relative min-h-touch-target min-w-touch-target touch-manipulation hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-gray-600" aria-hidden={true} />
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
