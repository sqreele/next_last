"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { appSignOut } from "@/app/lib/logout";
import {
  Package2,
  PanelLeft,
  Search,
  Menu,
  X,
  LogOut,
  Bell,
  ChevronDown,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/app/components/ui/breadcrumb";
import { Button } from "@/app/components/ui/button";
import HeaderPropertyList from "@/app/components/jobs/HeaderPropertyList";
import User from "@/app/dashboard/user";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/lib/utils/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { MobileNav as BottomNav } from "@/app/components/ui/mobile-nav";
import { dashboardNavigationItems } from "@/app/lib/navigation";

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  return (
    <div className="pcms-app-shell flex min-h-screen-safe w-full text-[var(--pcms-text)] overscroll-none">
      {/* Desktop Navigation - Hidden on mobile and tablet */}
      <DesktopNav
        collapsed={isSidebarCollapsed}
        toggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile Header - Hidden on desktop */}
        <MobileHeader />

        {/* Desktop Header - Hidden on mobile, shown on tablet+ */}
        <DesktopHeader sidebarCollapsed={isSidebarCollapsed} />

        {/* Main Content */}
        <main
          className="
            flex-1 overflow-auto
            p-3 mobile:p-4 tablet:p-5 desktop:p-7
            pb-32 mobile:pb-36 tablet:pb-8 desktop:pb-8
            transition-all duration-200
            scroll-smooth
            touch-pan-y
          "
        >
          <div
            className="
              mx-auto w-full 
              max-w-[430px] mobile:max-w-full tablet:max-w-7xl desktop:max-w-[96rem]
              space-y-4 mobile:space-y-5 tablet:space-y-6
            "
          >
            {children}
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}

function DesktopNav({
  collapsed,
  toggleCollapse,
}: {
  collapsed: boolean;
  toggleCollapse: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden desktop:flex flex-col border-r transition-all duration-300 bg-white/85 backdrop-blur-xl border-[var(--pcms-border)] shadow-[var(--pcms-shadow-sm)] relative z-30",
        collapsed ? "w-[80px]" : "w-[240px] tablet:w-[220px]",
      )}
    >
      <div
        className={cn(
          "p-4 border-b flex items-center border-gray-200",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 group",
            collapsed && "justify-center",
          )}
        >
          <Package2 className="h-6 w-6 text-blue-600 group-hover:text-blue-700 transition-colors" />
          {!collapsed && (
            <span className="font-semibold text-lg text-gray-800 group-hover:text-blue-700 transition-colors">
              PCMS
            </span>
          )}
        </Link>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="h-8 w-8 hover:bg-gray-100"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto py-4">
        <nav className="grid gap-1 px-2">
          {dashboardNavigationItems.map((item) => {
            const isActive = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-in-out",
                  collapsed ? "justify-center" : "",
                  isActive
                    ? "bg-[var(--pcms-accent-gradient)] text-white shadow-[var(--pcms-button-shadow)] font-extrabold"
                    : "text-slate-600 hover:bg-white/80 hover:text-[var(--pcms-primary-strong)]",
                )}
                title={collapsed ? item.name : undefined}
              >
                <item.icon
                  className={cn("h-5 w-5", collapsed ? "flex-shrink-0" : "")}
                />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto p-4 border-t border-gray-200">
        {!collapsed ? (
          <>
            <User />
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-sm h-10 bg-white text-red-500 border-gray-300 hover:bg-red-50 mt-4"
              onClick={() => appSignOut({ callbackUrl: "/auth/login" })}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="icon"
            className="w-full h-10 bg-white text-red-500 border-gray-300 hover:bg-red-50"
            onClick={() => appSignOut({ callbackUrl: "/auth/login" })}
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="w-full h-10 mt-4 hover:bg-gray-100"
            title="Expand Sidebar"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </Button>
        )}
      </div>
    </aside>
  );
}

function MobileHeader() {
  return (
    <header
      id="mobile-app-header"
      className="lg:hidden sticky top-0 z-[70] border-b shadow-[var(--pcms-shadow-sm)] bg-white/90 backdrop-blur-xl border-[var(--pcms-border)]"
    >
      {/* Row 1: nav, logo, actions */}
      <div className="flex items-center justify-between h-14 px-3">
        <div className="flex items-center gap-2">
          <MobileNav />
          <Link href="/dashboard" className="flex items-center gap-1.5">
            <Package2 className="h-5 w-5 text-blue-600" />
            <span className="font-bold text-gray-800 text-sm">PCMS</span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 touch-manipulation"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </Button>
          <MobileSearch />
        </div>
      </div>

      {/* Row 2: property selector + breadcrumb in one compact row */}
      <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-1.5 overflow-x-auto scrollbar-none">
        <div className="shrink-0">
          <HeaderPropertyList />
        </div>
        <span className="text-gray-300 shrink-0">|</span>
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
          <MobileBreadcrumb />
        </div>
      </div>
    </header>
  );
}

function DesktopHeader({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  return (
    <header className="hidden lg:flex sticky top-0 z-50 h-16 items-center border-b bg-white/80 backdrop-blur-xl px-6 shadow-[var(--pcms-shadow-sm)] border-[var(--pcms-border)]">
      <div className="flex items-center flex-1 gap-4">
        <DashboardBreadcrumb />
      </div>
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 relative"
              title="Notifications"
              aria-label="Open notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-72 bg-white border-gray-200"
          >
            <DropdownMenuItem className="flex flex-col items-start hover:bg-gray-100">
              <span className="font-semibold">No new notifications</span>
              <span className="text-xs text-gray-500">
                Job updates will appear here.
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SearchInput />
        <HeaderPropertyList />
      </div>
    </header>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="mobile-navigation-drawer"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "relative z-[70] h-11 w-11 rounded-2xl border border-white/70 bg-white/75 text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,.10)] backdrop-blur-xl",
          "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white hover:text-[var(--pcms-primary-strong)] hover:shadow-[0_12px_26px_rgba(15,23,42,.14)]",
          "active:translate-y-0 active:scale-95 active:bg-[var(--pcms-primary-soft)]",
          "focus-visible:ring-4 focus-visible:ring-cyan-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
          open &&
            "bg-[var(--pcms-primary-soft)] text-[var(--pcms-primary-strong)] ring-1 ring-[var(--pcms-border-strong)]",
        )}
      >
        <Menu
          className={cn(
            "absolute h-5 w-5 transition-all duration-200 ease-out",
            open
              ? "rotate-90 scale-75 opacity-0"
              : "rotate-0 scale-100 opacity-100",
          )}
          aria-hidden="true"
        />
        <X
          className={cn(
            "absolute h-5 w-5 transition-all duration-200 ease-out",
            open
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-75 opacity-0",
          )}
          aria-hidden="true"
        />
      </Button>

      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        id="mobile-navigation-drawer"
        aria-label="Primary navigation"
        className={cn(
          "fixed bottom-0 left-0 top-[6.75rem] z-[60] flex w-[min(88vw,22rem)] max-w-sm flex-col overflow-hidden border-r border-white/70 bg-white/95 shadow-[0_24px_70px_rgba(15,23,42,.24)] backdrop-blur-2xl lg:hidden",
          "transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-[var(--pcms-border)] bg-gradient-to-br from-white via-sky-50 to-cyan-50 px-5 py-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
            onClick={() => setOpen(false)}
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--pcms-accent-gradient)] text-white shadow-[var(--pcms-button-shadow)]">
              <Package2 className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-black leading-tight text-[var(--pcms-text)]">
                PCMS
              </span>
              <span className="block text-xs font-bold text-[var(--pcms-text-muted)]">
                Hotel maintenance operations
              </span>
            </span>
          </Link>
        </div>

        <div className="border-b border-[var(--pcms-border)] bg-white/75 p-4">
          <div className="rounded-2xl border border-[var(--pcms-border)] bg-[var(--pcms-surface-soft)] p-3 shadow-sm">
            <User />
          </div>
        </div>

        <nav
          className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
          aria-label="Mobile menu links"
        >
          {dashboardNavigationItems.map((item) => {
            const isActive = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex min-h-12 items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-extrabold transition-all duration-200 ease-out",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/45",
                  isActive
                    ? "bg-[var(--pcms-accent-gradient)] text-white shadow-[var(--pcms-button-shadow)]"
                    : "text-slate-600 hover:bg-[var(--pcms-primary-soft)] hover:text-[var(--pcms-primary-strong)] active:scale-[.98]",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 flex-none place-items-center rounded-xl transition-colors",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-white text-slate-500 shadow-sm group-hover:text-[var(--pcms-primary-strong)]",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {isActive && (
                  <span
                    className="h-2 w-2 rounded-full bg-white/90"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--pcms-border)] bg-white/90 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <Button
            variant="outline"
            className="w-full justify-center gap-2 border-red-200 bg-red-50 text-sm font-extrabold text-red-600 hover:border-red-300 hover:bg-red-100 hover:text-red-700"
            onClick={() => {
              setOpen(false);
              appSignOut({ callbackUrl: "/auth/login" });
            }}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>
    </>
  );
}

function SearchInput() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function searchAction(formData: FormData) {
    const value = formData.get("q");

    // Don't trigger search for empty queries
    if (!value || (typeof value === "string" && value.trim() === "")) return;

    // Make sure we're passing a string to URLSearchParams
    const searchValue = typeof value === "string" ? value : String(value);
    const params = new URLSearchParams({ q: searchValue });

    startTransition(() => {
      // Navigate to the search page
      router.push(`/dashboard/search?${params.toString()}`);
    });
  }

  return (
    <form action={searchAction} className="w-full max-w-xs relative">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
      <Input
        name="q"
        type="search"
        placeholder="Search jobs, properties, rooms..."
        className="w-full pl-9 h-10 text-sm rounded-full bg-[var(--pcms-surface-soft)] border-[var(--pcms-border)] focus:ring-2 focus:ring-cyan-300"
      />
      {isPending && (
        <div className="absolute right-3 top-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        </div>
      )}
    </form>
  );
}

function MobileSearch() {
  const [isOpen, setIsOpen] = React.useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function searchAction(formData: FormData) {
    const value = formData.get("q");

    // Check if value is a string before using trim
    if (!value || (typeof value === "string" && value.trim() === "")) return;

    // Make sure we're passing a string
    const searchValue = typeof value === "string" ? value : String(value);
    const params = new URLSearchParams({ q: searchValue });

    startTransition(() => {
      router.push(`/dashboard/search?${params.toString()}`);
      setIsOpen(false);
    });
  }

  return (
    <>
      {!isOpen ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setIsOpen(true)}
        >
          <Search className="h-5 w-5 text-gray-600" />
          <span className="sr-only">Search</span>
        </Button>
      ) : (
        <div className="fixed inset-0 z-50 p-4 flex flex-col bg-white/95">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsOpen(false)}
            >
              <PanelLeft className="h-5 w-5 text-gray-600" />
            </Button>
            <span className="font-medium text-gray-800">Search</span>
          </div>

          <form action={searchAction} className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
            <Input
              name="q"
              type="search"
              placeholder="Search jobs, properties, rooms..."
              autoFocus
              className="w-full pl-9 h-10 text-sm rounded-full bg-[var(--pcms-surface-soft)] border-[var(--pcms-border)] focus:ring-2 focus:ring-cyan-300"
            />
            {isPending && (
              <div className="absolute right-3 top-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              </div>
            )}
          </form>
        </div>
      )}
    </>
  );
}

function DashboardBreadcrumb() {
  const pathname = usePathname();
  const paths = pathname.split("/").filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Dashboard
          </BreadcrumbLink>
        </BreadcrumbItem>
        {paths.slice(1).map((path, index) => {
          const href = `/${paths.slice(0, index + 2).join("/")}`;
          const isLast = index === paths.slice(1).length - 1;
          const label = path.charAt(0).toUpperCase() + path.slice(1);

          return (
            <React.Fragment key={href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="text-sm font-semibold text-gray-800">
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={href}
                    className="text-sm text-gray-500 hover:text-gray-800"
                  >
                    {label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function MobileBreadcrumb() {
  const pathname = usePathname();
  const paths = pathname.split("/").filter(Boolean);

  return (
    <div className="flex items-center whitespace-nowrap text-xs overflow-x-auto">
      <Link href="/dashboard" className="text-gray-500">
        Dashboard
      </Link>
      {paths.slice(1).map((path, index) => {
        const href = `/${paths.slice(0, index + 2).join("/")}`;
        const isLast = index === paths.slice(1).length - 1;
        const label = path.charAt(0).toUpperCase() + path.slice(1);

        return (
          <React.Fragment key={href}>
            <span className="mx-1.5 text-gray-400">/</span>
            {isLast ? (
              <span className="font-medium text-gray-800">{label}</span>
            ) : (
              <Link href={href} className="text-gray-500">
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
