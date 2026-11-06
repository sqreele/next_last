"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/app/components/ui/sheet";
import { useDemoLanguage } from "./DemoLanguageProvider";

export type ActiveDemoFilter = { key: string; label: string; value: string; remove: () => void };

export function DemoFilterSelect({ label, value, onChange, options, allLabel, active = value !== "all" }: {
  label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; allLabel?: string; active?: boolean;
}) {
  return <label className="block min-w-0 space-y-2"><span className="block text-sm font-semibold text-slate-700">{label}</span><span className="relative block"><select value={value} onChange={(event) => onChange(event.target.value)} className={`h-12 w-full min-w-0 appearance-none rounded-xl border py-2 pl-3 pr-10 text-base outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:text-sm ${active ? "border-teal-500 bg-teal-50 font-semibold text-teal-900" : "border-slate-300 bg-white text-slate-700"}`}>
    {allLabel && <option value="all">{allLabel}</option>}{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select><ChevronDown className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-slate-500" aria-hidden="true" /></span></label>;
}

export default function DemoFilters({ children, active, clear, count, total, loading, context }: {
  children: ReactNode; active: ActiveDemoFilter[]; clear: () => void; count: number; total: number; loading: boolean; context?: string;
}) {
  const { text } = useDemoLanguage();
  const [open, setOpen] = useState(false);
  const results = loading ? text("กำลังโหลด…", "Loading…") : text(`พบ ${count} จาก ${total} งาน`, `${count} of ${total} jobs`);
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3 md:hidden"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button type="button" variant="outline" className={`h-12 flex-1 justify-between rounded-xl px-4 ${active.length ? "border-teal-500 bg-teal-50 text-teal-900" : "border-slate-300"}`}><span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />{text("ตัวกรองงาน", "Filter jobs")}</span><span className="rounded-full bg-teal-700 px-2.5 py-0.5 text-xs font-bold text-white">{active.length || text("ทั้งหมด", "All")}</span></Button></SheetTrigger>
      <SheetContent side="bottom" className="flex max-h-[90dvh] flex-col rounded-t-2xl bg-white p-0 text-slate-950">
        <SheetHeader className="shrink-0 border-b px-5 pb-4 pt-5 text-left"><SheetTitle className="flex items-center gap-2 pr-10 text-lg"><SlidersHorizontal className="h-5 w-5 text-teal-700" />{text("ค้นหาและกรองงาน", "Filter maintenance jobs")}</SheetTitle><SheetDescription>{text("เลือกเงื่อนไขด้านล่าง ตัวกรองมีผลทันที", "Choose filters below. Results update immediately.")}</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        <div className="shrink-0 space-y-3 border-t bg-white px-5 pt-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}><p className="text-center text-sm font-semibold text-slate-600">{results}</p><div className="grid grid-cols-[auto_1fr] gap-3"><Button type="button" variant="outline" onClick={clear} className="h-12">{text("ล้างทั้งหมด", "Clear all")}</Button><Button type="button" onClick={() => setOpen(false)} className="h-12 bg-teal-700 hover:bg-teal-800">{text("ดูรายการงาน", "View jobs")}</Button></div></div>
      </SheetContent>
    </Sheet>{active.length > 0 && <button type="button" onClick={clear} className="min-h-12 shrink-0 px-2 text-sm font-semibold text-teal-800 underline underline-offset-4">{text("ล้าง", "Reset")}</button>}</div>
    <div className="hidden space-y-3 md:block"><div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-semibold text-slate-700"><SlidersHorizontal className="h-4 w-4" />{text("ตัวกรองงาน", "Job filters")}</p>{active.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={clear}>{text("ล้างทั้งหมด", "Clear all")}</Button>}</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div></div>
    {active.length > 0 && <div className="flex flex-wrap gap-2" aria-label={text("ตัวกรองที่เลือก", "Active filters")}>{active.map((filter) => <button type="button" key={filter.key} onClick={filter.remove} aria-label={text(`ล้าง ${filter.label}: ${filter.value}`, `Remove ${filter.label}: ${filter.value}`)} className="flex min-h-11 max-w-full items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-left text-xs text-teal-900"><span className="min-w-0 break-words"><span className="font-semibold">{filter.label}:</span> {filter.value}</span><X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></button>)}</div>}
    <p role="status" className="text-sm font-medium text-slate-600">{results}{context && <span className="ml-2 font-normal text-slate-500">· {context}</span>}</p>
  </div>;
}
