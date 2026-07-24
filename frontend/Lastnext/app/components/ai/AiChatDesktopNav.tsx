"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Package2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import User from "@/app/dashboard/user";
import { appSignOut } from "@/app/lib/logout";
import { dashboardNavigationItems } from "@/app/lib/navigation";
import { cn } from "@/app/lib/utils/cn";

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AiChatDesktopNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden desktop:flex desktop:w-[244px] desktop:flex-col desktop:border-r desktop:border-[var(--pcms-border)] desktop:bg-card/92 desktop:shadow-[var(--pcms-shadow-soft)] desktop:backdrop-blur-xl">
      <div className="flex h-16 items-center border-b border-[var(--pcms-border)] px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 group focus-visible:outline-none"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pcms-primary)] text-white shadow-[var(--pcms-shadow-soft)]">
            <Package2 className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold text-[var(--pcms-text)] transition-colors group-hover:text-[var(--pcms-primary-strong)]">
            HotelCare Pro
          </span>
        </Link>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-2 py-4"
        aria-label="AI chat desktop navigation"
      >
        <div className="grid gap-1">
          {dashboardNavigationItems.map((item) => {
            const isActive = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ease-out",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30",
                  isActive
                    ? "bg-[var(--pcms-primary)] text-white shadow-[var(--pcms-button-shadow)]"
                    : "text-[var(--pcms-text-muted)] hover:bg-[var(--pcms-surface-soft)] hover:text-[var(--pcms-text)]",
                )}
              >
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-[var(--pcms-primary)]"
                  />
                ) : null}
                <span
                  className={cn(
                    "grid h-7 w-7 flex-none place-items-center rounded-lg transition-colors",
                    isActive
                      ? "bg-card/15 text-white"
                      : "bg-transparent text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto border-t border-border p-4">
        <User />
        <Button
          variant="outline"
          className="mt-4 h-10 w-full justify-start gap-2 border-red-200 bg-red-50 text-sm text-red-700 hover:bg-red-100"
          onClick={() => appSignOut({ callbackUrl: "/auth/login" })}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
