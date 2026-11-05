"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, Home, Menu, Plus, RotateCcw, UserRound } from "lucide-react";

import { Logo } from "@/app/components/branding/Logo";
import { Button } from "@/app/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/app/components/ui/sheet";
import { cn } from "@/app/lib/utils/cn";
import { useDemo } from "./DemoProvider";
import { useDemoLanguage } from "./DemoLanguageProvider";

const navigation = [
  { href: "/demo/", en: "Dashboard", th: "ภาพรวม", icon: Home, exact: true },
  { href: "/demo/jobs/", en: "All Jobs", th: "งานทั้งหมด", icon: ClipboardList },
  { href: "/demo/my-jobs/", en: "My Jobs", th: "งานของฉัน", icon: UserRound },
  { href: "/demo/create-job/", en: "Create Job", th: "สร้างงาน", icon: Plus },
  { href: "/demo/report/", en: "Reports", th: "รายงาน", icon: BarChart3 },
];

function DemoNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const { language } = useDemoLanguage();
  return (
    <nav className={cn("space-y-1", mobile && "pt-3")} aria-label="Demo navigation">
      {navigation.map((item) => {
        const active = item.exact ? pathname === "/demo" || pathname === "/demo/" : pathname.startsWith(item.href.replace(/\/$/, ""));
        const Icon = item.icon;
        const link = <Link href={item.href} className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition", active ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}><Icon className="h-5 w-5" />{language === "th" ? item.th : item.en}</Link>;
        return mobile ? <SheetClose asChild key={item.href}>{link}</SheetClose> : <div key={item.href}>{link}</div>;
      })}
    </nav>
  );
}

export default function DemoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { snapshot, loading, reset } = useDemo();
  const { language, setLanguage, text } = useDemoLanguage();
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white p-4 print:hidden lg:block">
        <Link href="/" className="mb-6 flex h-12 items-center"><Logo variant="horizontal" markClassName="size-9" /></Link>
        <div className="mb-5 rounded-xl border border-teal-100 bg-teal-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-teal-700">Public Demo</p><p className="mt-1 truncate text-sm font-semibold">{snapshot?.property.name || "StayMaint Demo Hotel"}</p><p className="mt-1 text-xs text-slate-500">{text("ฐานข้อมูลทดลองแยกจากระบบจริง", "Isolated sandbox database")}</p></div>
        <DemoNav />
        <div className="absolute bottom-4 left-4 right-4"><Button variant="outline" className="w-full" onClick={() => void reset()} disabled={loading}><RotateCcw className="mr-2 h-4 w-4" />{text("รีเซ็ต Demo", "Reset Demo")}</Button><p className="mt-2 text-center text-[11px] text-slate-400">{text("รีเซ็ตอัตโนมัติทุก 30 นาที", "Auto reset every 30 minutes")}</p></div>
      </aside>
      <div className="min-w-0 flex-1 print:pl-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur print:hidden sm:px-6">
          <div className="flex min-w-0 items-center gap-2 lg:hidden"><Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0"><Menu className="h-5 w-5" /><span className="sr-only">{text("เปิดเมนู Demo", "Open demo navigation")}</span></Button></SheetTrigger><SheetContent side="left" className="w-[min(84vw,320px)] px-4"><Logo variant="horizontal" markClassName="size-8" /><div className="mt-5 rounded-xl bg-teal-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-teal-700">Public Demo</p><p className="mt-1 truncate text-sm font-semibold">{snapshot?.property.name || "StayMaint Demo Hotel"}</p></div><DemoNav mobile /></SheetContent></Sheet><div className="min-w-0"><p className="truncate text-sm font-semibold leading-tight">StayMaint Demo</p><p className="truncate text-[11px] text-slate-500 sm:hidden">Chinatown · Sandbox</p></div></div>
          <div className="hidden lg:block"><p className="text-xs text-slate-500">{text("ที่พักที่กำลังใช้งาน", "Active Property")}</p><p className="text-sm font-semibold">{snapshot?.property.name || text("กำลังโหลด…", "Loading property…")}</p></div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2"><div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label={text("เลือกภาษา", "Select language")}><button type="button" onClick={() => setLanguage("th")} aria-pressed={language === "th"} className={cn("min-h-9 rounded-md px-2 text-xs font-bold transition", language === "th" ? "bg-white text-teal-700 shadow-sm" : "text-slate-500")}>TH</button><button type="button" onClick={() => setLanguage("en")} aria-pressed={language === "en"} className={cn("min-h-9 rounded-md px-2 text-xs font-bold transition", language === "en" ? "bg-white text-teal-700 shadow-sm" : "text-slate-500")}>EN</button></div><span className="hidden rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 md:inline">{text("Sandbox · ไม่ต้องล็อกอิน", "Sandbox · No login")}</span><Button size="sm" asChild className="hidden h-10 px-3 text-xs sm:inline-flex sm:px-4 sm:text-sm"><Link href="/auth/register">{text("ทดลองใช้ฟรี", "Start Free Trial")}</Link></Button></div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-3 pb-28 pt-4 print:max-w-none print:p-0 sm:p-6 lg:p-8">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur print:hidden lg:hidden" style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }} aria-label="Demo mobile navigation">{navigation.map((item) => { const Icon = item.icon; const active = item.exact ? pathname === "/demo" || pathname === "/demo/" : pathname.startsWith(item.href.replace(/\/$/, "")); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold transition", active ? "text-teal-700" : "text-slate-500")}><Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} /><span className="max-w-full truncate">{language === "th" ? item.th : item.en.replace(" Job", "")}</span>{active ? <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-teal-600" /> : null}</Link>; })}</nav>
      </div>
    </div>
  );
}
