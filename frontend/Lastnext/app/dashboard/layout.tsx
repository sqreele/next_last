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
import { PageTransition } from "@/app/components/ui/page-transition";
import { PullToRefresh } from "@/app/components/ui/pull-to-refresh";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/app/components/ui/sheet";
import { dashboardNavigationItems } from "@/app/lib/navigation";
import { useScrollDirection } from "@/app/lib/hooks/useScrollDirection";
import { NotificationBell } from "@/app/components/notifications/NotificationBell";
import { ThemeToggle } from "@/app/components/theme/ThemeToggle";
import { LocaleToggle } from "@/app/components/i18n/LocaleToggle";

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const mainRef = React.useRef<HTMLElement | null>(null);
  const { direction, isAtTop } = useScrollDirection({
    threshold: 8,
    topOffset: 16,
    targetRef: mainRef,
  });
  const headerHidden = direction === "down" && !isAtTop;

  const handleRefresh = React.useCallback(async () => {
    router.refresh();
    await new Promise((resolve) => setTimeout(resolve, 650));
  }, [router]);

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
        <MobileHeader hidden={headerHidden} />

        {/* Desktop Header - Hidden on mobile, shown on tablet+ */}
        <DesktopHeader sidebarCollapsed={isSidebarCollapsed} />

        {/* Main Content */}
        <main
          ref={mainRef}
          className="
            flex-1 overflow-auto
            p-3 mobile:p-4 tablet:p-5 desktop:p-7
            pb-32 mobile:pb-36 tablet:pb-8 desktop:pb-8
            transition-all duration-200
            scroll-smooth
            touch-pan-y
          "
        >
          <PullToRefresh
            onRefresh={handleRefresh}
            scrollTargetRef={mainRef}
            className="
              mx-auto w-full
              max-w-[430px] mobile:max-w-full tablet:max-w-7xl desktop:max-w-[96rem]
            "
          >
            <PageTransition className="space-y-4 mobile:space-y-5 tablet:space-y-6">
              {children}
            </PageTransition>
          </PullToRefresh>
        </main>

        {/* Mobile Bottom Navigation */}
        <BottomNav hidden={headerHidden} />
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
          "h-16 px-4 border-b flex items-center border-slate-200/80",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2.5 group focus-visible:outline-none",
            collapsed && "justify-center",
          )}
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/25 transition-transform group-hover:scale-105">
            <Package2 className="h-5 w-5" />
          </span>
          {!collapsed && (
            <span className="font-extrabold text-lg tracking-tight text-slate-900 group-hover:text-blue-700 transition-colors">
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
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200 ease-out",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30",
                  collapsed ? "justify-center" : "",
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
                title={collapsed ? item.name : undefined}
              >
                {isActive && !collapsed && (
                  <span
                    aria-hidden="true"
                    className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-blue-600"
                  />
                )}
                <span
                  className={cn(
                    "grid h-7 w-7 flex-none place-items-center rounded-lg transition-colors",
                    isActive
                      ? "bg-white/15 text-white"
                      : "bg-transparent text-slate-500 group-hover:text-slate-800",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                {!collapsed && <span className="truncate">{item.name}</span>}
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

function MobileHeader({ hidden = false }: { hidden?: boolean }) {
  return (
    <header
      id="mobile-app-header"
      className={cn(
        "lg:hidden sticky top-0 z-[70] border-b border-slate-200 shadow-sm bg-white/95 backdrop-blur-md",
        "transition-transform duration-200 ease-out will-change-transform",
        hidden ? "-translate-y-full" : "translate-y-0",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Row 1: nav, logo, actions */}
      <div className="flex items-center justify-between h-14 px-3">
        <div className="flex items-center gap-2">
          <MobileNav />
          <Link href="/dashboard" className="flex items-center gap-1.5">
            <Package2 className="h-5 w-5 text-blue-600" />
            <span className="font-bold text-slate-900 text-sm">PCMS</span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <LocaleToggle />
          <ThemeToggle />
          <NotificationBell />
          <MobileSearch />
        </div>
      </div>

      {/* Row 2: property selector + breadcrumb in one compact row */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-1.5 overflow-x-auto scrollbar-none">
        <div className="shrink-0">
          <HeaderPropertyList />
        </div>
        <span className="text-slate-300 shrink-0">|</span>
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
        <LocaleToggle />
        <ThemeToggle />
        <NotificationBell variant="full" />
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          className={cn(
            "relative h-11 w-11 rounded-xl border border-slate-300 bg-white text-slate-900",
            "shadow-sm transition-all duration-150 ease-out",
            "hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300",
            "active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          )}
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(88vw,20rem)] max-w-sm border-r border-slate-200 bg-white p-0 [&>button]:right-3 [&>button]:top-3 [&>button]:h-9 [&>button]:w-9 [&>button]:rounded-lg [&>button]:bg-slate-100 [&>button]:opacity-100 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:text-slate-900 [&>button]:hover:bg-slate-200 [&>button>svg]:h-5 [&>button>svg]:w-5"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 bg-white px-5 py-5">
            <Link
              href="/dashboard"
              className="flex items-center gap-3"
              onClick={() => setOpen(false)}
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
                <Package2 className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-lg font-bold leading-tight text-slate-900">
                  PCMS
                </span>
                <span className="block text-xs font-semibold text-slate-600">
                  Hotel maintenance operations
                </span>
              </span>
            </Link>
          </div>

          <div className="border-b border-slate-200 bg-white p-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <User />
            </div>
          </div>

          <nav
            className="flex-1 space-y-1 overflow-y-auto px-3 py-4 bg-white"
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
                    "group flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition-colors duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    isActive
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                      : "text-slate-800 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-9 w-9 flex-none place-items-center rounded-lg transition-colors",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-700 group-hover:bg-blue-100 group-hover:text-blue-700",
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {isActive && (
                    <span
                      className="h-2 w-2 rounded-full bg-white"
                      aria-hidden="true"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <Button
              variant="outline"
              className="w-full justify-center gap-2 border-red-300 bg-red-50 text-sm font-bold text-red-700 hover:border-red-400 hover:bg-red-100 hover:text-red-800"
              onClick={() => {
                setOpen(false);
                appSignOut({ callbackUrl: "/auth/login" });
              }}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
