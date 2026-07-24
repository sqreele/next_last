"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotMessageSquare, Menu, Package2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/app/components/ui/sheet";
import { MobileNav as BottomNav } from "@/app/components/ui/mobile-nav";
import { dashboardNavigationItems } from "@/app/lib/navigation";
import { cn } from "@/app/lib/utils/cn";

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AiChatMobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 shadow-soft backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation menu"
                  className="h-11 w-11 rounded-xl border border-border bg-card text-foreground shadow-soft hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                >
                  <Menu className="h-6 w-6" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[min(88vw,20rem)] border-r border-border bg-card p-0 [&>button]:right-3 [&>button]:top-3"
              >
                <div className="flex h-full flex-col">
                  <div className="border-b border-border px-5 py-5">
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-3"
                      onClick={() => setOpen(false)}
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-700 text-white shadow-soft shadow-cyan-700/30">
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

                  <nav
                    className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
                    aria-label="AI chat mobile menu links"
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
                            "group flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
                            isActive
                              ? "bg-cyan-700 text-white shadow-soft shadow-cyan-700/30"
                              : "text-foreground hover:bg-cyan-50 hover:text-cyan-700 active:bg-cyan-100",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-9 w-9 flex-none place-items-center rounded-lg transition-colors",
                              isActive
                                ? "bg-card/20 text-white"
                                : "bg-muted text-muted-foreground group-hover:bg-cyan-100 group-hover:text-cyan-700",
                            )}
                          >
                            <item.icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {item.name}
                          </span>
                          {isActive ? (
                            <span
                              className="h-2 w-2 rounded-full bg-card"
                              aria-hidden="true"
                            />
                          ) : null}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              </SheetContent>
            </Sheet>

            <Link
              href="/ai-chat"
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-foreground"
            >
              <BotMessageSquare className="h-5 w-5 text-cyan-700" />
              <span className="text-sm font-bold">AI Chat</span>
            </Link>
          </div>
        </div>
      </header>
      <BottomNav />
    </>
  );
}
