"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, Home, Menu, Plus, RotateCcw, UserRound } from "lucide-react";

import { Logo } from "@/app/components/branding/Logo";
import { Button } from "@/app/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/app/components/ui/sheet";
import { cn } from "@/app/lib/utils/cn";
import { useDemo } from "./DemoProvider";

const navigation = [
  { href: "/demo/", label: "Dashboard", icon: Home, exact: true },
  { href: "/demo/jobs/", label: "All Jobs", icon: ClipboardList },
  { href: "/demo/my-jobs/", label: "My Jobs", icon: UserRound },
  { href: "/demo/create-job/", label: "Create Job", icon: Plus },
  { href: "/demo/report/", label: "Reports", icon: BarChart3 },
];

function DemoNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={cn("space-y-1", mobile && "pt-3")} aria-label="Demo navigation">
      {navigation.map((item) => {
        const active = item.exact ? pathname === "/demo" || pathname === "/demo/" : pathname.startsWith(item.href.replace(/\/$/, ""));
        const Icon = item.icon;
        return <Link key={item.href} href={item.href} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition", active ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}><Icon className="h-5 w-5" />{item.label}</Link>;
      })}
    </nav>
  );
}

export default function DemoShell({ children }: { children: React.ReactNode }) {
  const { snapshot, loading, reset } = useDemo();
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white p-4 print:hidden lg:block">
        <Link href="/" className="mb-6 flex h-12 items-center"><Logo variant="horizontal" markClassName="size-9" /></Link>
        <div className="mb-5 rounded-xl border border-teal-100 bg-teal-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-teal-700">Public Demo</p><p className="mt-1 truncate text-sm font-semibold">{snapshot?.property.name || "StayMaint Demo Hotel"}</p><p className="mt-1 text-xs text-slate-500">Isolated sandbox database</p></div>
        <DemoNav />
        <div className="absolute bottom-4 left-4 right-4"><Button variant="outline" className="w-full" onClick={() => void reset()} disabled={loading}><RotateCcw className="mr-2 h-4 w-4" />Reset Demo</Button><p className="mt-2 text-center text-[11px] text-slate-400">Auto reset every 30 minutes</p></div>
      </aside>
      <div className="min-w-0 flex-1 print:pl-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur print:hidden sm:px-6">
          <div className="flex items-center gap-3 lg:hidden"><Sheet><SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="h-5 w-5" /><span className="sr-only">Open demo navigation</span></Button></SheetTrigger><SheetContent side="left" className="w-72"><Logo variant="horizontal" markClassName="size-8" /><DemoNav mobile /></SheetContent></Sheet><span className="font-semibold">StayMaint Demo</span></div>
          <div className="hidden lg:block"><p className="text-xs text-slate-500">Active Property</p><p className="text-sm font-semibold">{snapshot?.property.name || "Loading property…"}</p></div>
          <div className="flex items-center gap-2"><span className="hidden rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 sm:inline">Sandbox · No login</span><Button size="sm" asChild><Link href="/auth/register">Start Free Trial</Link></Button></div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 pb-24 print:max-w-none print:p-0 sm:p-6 lg:p-8">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white p-1 print:hidden lg:hidden" aria-label="Demo mobile navigation">{navigation.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium text-slate-600"><Icon className="h-5 w-5" />{item.label.replace(" Job", "")}</Link>; })}</nav>
      </div>
    </div>
  );
}
