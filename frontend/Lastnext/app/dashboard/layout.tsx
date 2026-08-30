"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { appSignOut } from "@/app/lib/logout";
import {
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
import {
  navigationGroups,
  navigationItems,
} from "@/app/design-system/navigation-config";
import { isNavigationItemActive } from "@/app/lib/navigation-active.mjs";
import { useScrollDirection } from "@/app/lib/hooks/useScrollDirection";
import { NotificationBell } from "@/app/components/notifications/NotificationBell";
import { ThemeToggle } from "@/app/components/theme/ThemeToggle";
import { LocaleToggle } from "@/app/components/i18n/LocaleToggle";
import { Logo, StayMaintMark } from "@/app/components/branding/Logo";

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
        "relative z-30 hidden min-h-screen-safe shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-soft transition-[width] duration-300 desktop:sticky desktop:top-0 desktop:flex",
        collapsed ? "w-20" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border px-4",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        <Link
          href="/dashboard"
          aria-label="StayMaint dashboard"
          className={cn(
            "group flex min-h-11 items-center gap-2.5 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            collapsed && "justify-center",
          )}
        >
          {collapsed ? (
            <StayMaintMark tone="light" className="h-10 w-10" />
          ) : (
            <Logo
              variant="horizontal"
              tone="light"
              markClassName="size-10"
            />
          )}
        </Link>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="h-10 w-10 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Collapse sidebar"
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="grid gap-6 px-3" aria-label="Primary navigation">
          {navigationGroups.map((group) => (
            <div key={group.label}>
              {!collapsed ? (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
                  {group.label}
                </p>
              ) : null}
              <div className="grid gap-1.5">
                {group.items.map((item) => {
                  const isActive = isNavigationItemActive(
                    pathname,
                    item,
                    navigationItems,
                  );
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        collapsed ? "justify-center" : "",
                        isActive
                          ? "bg-sidebar-accent font-semibold text-sidebar-primary ring-1 ring-inset ring-sidebar-primary/25"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                      )}
                      title={collapsed ? item.name : undefined}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary"
                        />
                      )}
                      <span
                        className={cn(
                          "grid h-7 w-7 flex-none place-items-center rounded-md transition-colors",
                          isActive
                            ? "bg-sidebar-primary/15 text-sidebar-primary"
                            : "bg-transparent text-sidebar-foreground/65 group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
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
      <div className="mt-auto border-t border-sidebar-border bg-sidebar-accent/30 p-3">
        {!collapsed ? (
          <>
            <User darkSurface />
            <Button
              variant="outline"
            className="mt-3 h-11 w-full justify-start gap-2 border-destructive/40 bg-destructive/10 text-sm text-rose-200 hover:bg-destructive/20 hover:text-white"
              onClick={() => appSignOut({ callbackUrl: "/auth/login" })}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Logout
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-full border-destructive/40 bg-destructive/10 text-rose-200 hover:bg-destructive/20 hover:text-white"
            onClick={() => appSignOut({ callbackUrl: "/auth/login" })}
            title="Logout"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="mt-3 h-11 w-full rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title="Expand Sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronDown className="h-4 w-4 rotate-90" aria-hidden="true" />
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
        "sticky top-0 z-[70] border-b border-border bg-card/95 shadow-soft backdrop-blur-xl lg:hidden",
        "transition-transform duration-200 ease-out will-change-transform",
        hidden ? "-translate-y-full" : "translate-y-0",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Row 1: nav, logo, actions */}
      <div className="flex h-14 min-w-0 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <MobileNav />
          <Link
            href="/dashboard"
            aria-label="StayMaint dashboard"
            className="flex min-h-10 min-w-0 items-center gap-1.5 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StayMaintMark className="h-8 w-8" />
            <span className="hidden truncate text-sm font-bold text-foreground xs:inline">
              StayMaint
            </span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 [&_button]:!h-10 [&_button]:!w-10">
          <LocaleToggle />
          <ThemeToggle />
          <NotificationBell />
          <MobileSearch />
        </div>
      </div>

      {/* Row 2: property selector + breadcrumb in one compact row */}
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-t border-border px-3 py-2 scrollbar-none">
        <div className="shrink-0">
          <HeaderPropertyList />
        </div>
        <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
          <MobileBreadcrumb />
        </div>
      </div>
    </header>
  );
}

function DesktopHeader() {
  return (
    <header className="sticky top-0 z-50 hidden h-16 min-w-0 items-center gap-3 border-b border-border bg-card/95 px-4 shadow-soft backdrop-blur-xl lg:flex xl:px-6">
      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
        <DashboardBreadcrumb />
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-1 xl:gap-2">
        <LocaleToggle className="rounded-lg" />
        <ThemeToggle className="rounded-lg" />
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
            "relative h-11 w-11 rounded-xl border border-border bg-background text-foreground",
            "shadow-soft transition-colors duration-150",
            "hover:border-primary/30 hover:bg-primary/10 hover:text-primary",
            "active:scale-95",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(90vw,21rem)] max-w-sm border-r border-border bg-card p-0 [&>button]:right-3 [&>button]:top-3 [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-lg [&>button]:bg-muted [&>button]:text-foreground [&>button]:opacity-100 [&>button]:hover:bg-muted/80 [&>button>svg]:h-5 [&>button>svg]:w-5"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border bg-muted/[0.18] px-5 py-5">
            <Link
              href="/dashboard"
              aria-label="StayMaint dashboard"
              className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setOpen(false)}
            >
              <StayMaintMark className="h-11 w-11" />
              <span>
                <span className="block text-lg font-bold leading-tight text-foreground">
                  StayMaint
                </span>
                <span className="block text-xs font-semibold text-muted-foreground">
                  Hotel maintenance operations
                </span>
              </span>
            </Link>
          </div>

          <div className="border-b border-border bg-card p-4">
            <div className="rounded-xl border border-border bg-muted/40 p-2">
              <User />
            </div>
          </div>

          <nav
            className="flex-1 space-y-1.5 overflow-y-auto bg-card px-3 py-4"
            aria-label="Mobile menu links"
          >
            {navigationGroups
              .flatMap((group) => group.items)
              .map((item) => {
                const isActive = isNavigationItemActive(
                  pathname,
                  item,
                  navigationItems,
                );
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors duration-150",
                      "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isActive
                        ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                        : "text-foreground hover:bg-muted/70 active:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 flex-none place-items-center rounded-lg transition-colors",
                        isActive
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {isActive && (
                      <span
                        className="h-2 w-2 rounded-full bg-primary"
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
              className="h-11 w-full justify-center gap-2 border-destructive/25 bg-destructive/5 text-sm font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setOpen(false);
                appSignOut({ callbackUrl: "/auth/login" });
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
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
    <form action={searchAction} className="relative w-40 xl:w-56 2xl:w-64">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Input
        name="q"
        type="search"
        placeholder="Search jobs, properties, rooms..."
        className="h-10 w-full rounded-lg border-border bg-muted/40 pl-9 text-sm focus-visible:ring-2 focus-visible:ring-ring"
      />
      {isPending && (
        <div className="absolute right-3 top-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
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
          aria-label="Open search"
        >
          <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search</span>
        </Button>
      ) : (
        <div className="fixed inset-0 z-50 flex flex-col bg-card/95 p-4 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsOpen(false)}
              aria-label="Close search"
            >
              <PanelLeft className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </Button>
            <span className="font-medium text-foreground">Search</span>
          </div>

          <form action={searchAction} className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              name="q"
              type="search"
              placeholder="Search jobs, properties, rooms..."
              autoFocus
              className="h-11 w-full rounded-lg border-border bg-muted/40 pl-9 text-sm focus-visible:ring-2 focus-visible:ring-ring"
            />
            {isPending && (
              <div className="absolute right-3 top-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
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
    <Breadcrumb className="min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        <BreadcrumbItem>
          <BreadcrumbLink
            href="/dashboard"
            className="rounded-xs text-sm text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
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
                  <BreadcrumbPage className="max-w-44 truncate text-sm font-semibold text-foreground xl:max-w-64">
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={href}
                    className="max-w-32 truncate rounded-xs text-sm text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
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
      <Link
        href="/dashboard"
        className="rounded-xs text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
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
              <Link
                href={href}
                className="rounded-xs text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
