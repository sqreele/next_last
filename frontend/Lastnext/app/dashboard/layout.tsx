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
import { MobileNav as BottomNav } from "@/app/components/ui/mobile-nav";
import { PageTransition } from "@/app/components/ui/page-transition";
import { PullToRefresh } from "@/app/components/ui/pull-to-refresh";
import { Sheet, SheetContent, SheetTrigger } from "@/app/components/ui/sheet";
import { navigationGroups } from "@/app/design-system/navigation-config";
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
    <div className="pcms-app-shell flex min-h-screen-safe w-full bg-[var(--pcms-app-bg)] text-[var(--pcms-text)] overscroll-none">
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
        <DesktopHeader />

        {/* Main Content */}
        <main
          ref={mainRef}
          className="
            flex-1 overflow-auto
            p-0
            pb-24 tablet:pb-0 desktop:pb-0
            transition-all duration-200
            scroll-smooth
            touch-pan-y
          "
        >
          <PullToRefresh
            onRefresh={handleRefresh}
            scrollTargetRef={mainRef}
            className="
              mx-0 w-full max-w-none
            "
          >
            <PageTransition className="w-full min-w-0">
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
        "hidden desktop:flex flex-col border-r transition-all duration-300 bg-card/92 backdrop-blur-xl border-[var(--pcms-border)] shadow-[var(--pcms-shadow-soft)] relative z-30",
        collapsed ? "w-[76px]" : "w-[244px] tablet:w-[224px]",
      )}
    >
      <div
        className={cn(
          "h-16 px-4 border-b flex items-center border-[var(--pcms-border)]",
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
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pcms-primary)] text-white shadow-[var(--pcms-shadow-soft)]">
            <Package2 className="h-5 w-5" />
          </span>
          {!collapsed && (
            <span className="text-lg font-bold text-[var(--pcms-text)] transition-colors group-hover:text-[var(--pcms-primary-strong)]">
              HotelCare Pro
            </span>
          )}
        </Link>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="h-8 w-8 hover:bg-[var(--pcms-surface-soft)]"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto py-4">
        <nav className="grid gap-5 px-2" aria-label="Primary navigation">
          {navigationGroups.map((group) => (
            <div key={group.label}>
              {!collapsed ? (
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              ) : null}
              <div className="grid gap-1">
                {group.items.map((item) => {
                  const isActive = isNavItemActive(pathname, item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ease-out",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        collapsed ? "justify-center" : "",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-soft"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      title={collapsed ? item.name : undefined}
                    >
                      {isActive && !collapsed && (
                        <span
                          aria-hidden="true"
                          className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary"
                        />
                      )}
                      <span
                        className={cn(
                          "grid h-7 w-7 flex-none place-items-center rounded-lg transition-colors",
                          isActive
                            ? "bg-primary-foreground/15 text-primary-foreground"
                            : "bg-transparent text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px]" />
                      </span>
                      {!collapsed && (
                        <span className="truncate">{item.name}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
      <div className="mt-auto p-4 border-t border-border">
        {!collapsed ? (
          <>
            <User />
            <Button
              variant="outline"
              className="mt-4 h-10 w-full justify-start gap-2 border-red-200 bg-red-50 text-sm text-red-700 hover:bg-red-100"
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
            className="h-10 w-full border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
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
            className="mt-4 h-10 w-full hover:bg-[var(--pcms-surface-soft)]"
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
        "lg:hidden sticky top-0 z-[70] border-b border-[var(--pcms-border)] bg-card/94 shadow-[var(--pcms-shadow-soft)] backdrop-blur-xl",
        "transition-transform duration-200 ease-out will-change-transform",
        hidden ? "-translate-y-full" : "translate-y-0",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Row 1: nav, logo, actions */}
      <div className="flex h-14 items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <MobileNav />
          <Link href="/dashboard" className="flex items-center gap-1.5">
            <Package2 className="h-5 w-5 text-[var(--pcms-primary)]" />
            <span className="text-sm font-bold text-[var(--pcms-text)]">
              HotelCare Pro
            </span>
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
      <div className="flex items-center gap-2 overflow-x-auto border-t border-[var(--pcms-border)] px-3 py-1.5 scrollbar-none">
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

function DesktopHeader() {
  return (
    <header className="hidden lg:flex sticky top-0 z-50 h-16 items-center border-b border-[var(--pcms-border)] bg-card/90 px-6 shadow-[var(--pcms-shadow-soft)] backdrop-blur-xl">
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
            "relative h-11 w-11 rounded-xl border border-border bg-card text-foreground",
            "shadow-soft transition-all duration-150 ease-out",
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
        className="w-[min(88vw,20rem)] max-w-sm border-r border-border bg-card p-0 [&>button]:right-3 [&>button]:top-3 [&>button]:h-9 [&>button]:w-9 [&>button]:rounded-lg [&>button]:bg-muted [&>button]:opacity-100 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:text-foreground [&>button]:hover:bg-slate-200 [&>button>svg]:h-5 [&>button>svg]:w-5"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border bg-card px-5 py-5">
            <Link
              href="/dashboard"
              className="flex items-center gap-3"
              onClick={() => setOpen(false)}
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white shadow-soft shadow-blue-600/30">
                <Package2 className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-lg font-bold leading-tight text-foreground">
                  HotelCare Pro
                </span>
                <span className="block text-xs font-semibold text-muted-foreground">
                  Hotel maintenance operations
                </span>
              </span>
            </Link>
          </div>

          <div className="border-b border-border bg-card p-4">
            <div className="rounded-xl border border-border bg-muted p-3">
              <User />
            </div>
          </div>

          <nav
            className="flex-1 space-y-1 overflow-y-auto px-3 py-4 bg-card"
            aria-label="Mobile menu links"
          >
            {navigationGroups
              .flatMap((group) => group.items)
              .map((item) => {
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
                        ? "bg-blue-600 text-white shadow-soft shadow-blue-600/30"
                        : "text-foreground hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 flex-none place-items-center rounded-lg transition-colors",
                        isActive
                          ? "bg-card/20 text-white"
                          : "bg-muted text-muted-foreground group-hover:bg-blue-100 group-hover:text-blue-700",
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {isActive && (
                      <span
                        className="h-2 w-2 rounded-full bg-card"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                );
              })}
          </nav>

          <div className="border-t border-border bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
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
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        name="q"
        type="search"
        placeholder="Search jobs, properties, rooms..."
        className="w-full pl-9 h-10 text-sm rounded-full bg-[var(--pcms-surface-soft)] border-[var(--pcms-border)] focus:ring-2 focus:ring-cyan-300"
      />
      {isPending && (
        <div className="absolute right-3 top-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-blue-600" />
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
          <Search className="h-5 w-5 text-muted-foreground" />
          <span className="sr-only">Search</span>
        </Button>
      ) : (
        <div className="fixed inset-0 z-50 p-4 flex flex-col bg-card/95">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsOpen(false)}
            >
              <PanelLeft className="h-5 w-5 text-muted-foreground" />
            </Button>
            <span className="font-medium text-foreground">Search</span>
          </div>

          <form action={searchAction} className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              name="q"
              type="search"
              placeholder="Search jobs, properties, rooms..."
              autoFocus
              className="w-full pl-9 h-10 text-sm rounded-full bg-[var(--pcms-surface-soft)] border-[var(--pcms-border)] focus:ring-2 focus:ring-cyan-300"
            />
            {isPending && (
              <div className="absolute right-3 top-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-blue-600" />
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
            className="text-sm text-muted-foreground hover:text-foreground"
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
                  <BreadcrumbPage className="text-sm font-semibold text-foreground">
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={href}
                    className="text-sm text-muted-foreground hover:text-foreground"
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
      <Link href="/dashboard" className="text-muted-foreground">
        Dashboard
      </Link>
      {paths.slice(1).map((path, index) => {
        const href = `/${paths.slice(0, index + 2).join("/")}`;
        const isLast = index === paths.slice(1).length - 1;
        const label = path.charAt(0).toUpperCase() + path.slice(1);

        return (
          <React.Fragment key={href}>
            <span className="mx-1.5 text-muted-foreground">/</span>
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link href={href} className="text-muted-foreground">
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
