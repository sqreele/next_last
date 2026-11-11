"use client";

import { ChevronRight, FolderOpen } from "lucide-react";
import type { MachineCategoryGroup } from "@/app/lib/machine-categories";

interface Props {
  categories: MachineCategoryGroup[];
  summaries: ReadonlyMap<string, { openJobs: number }>;
  onSelect: (category: { key: string; label: string | null }) => void;
  text: (th: string, en: string) => string;
}

export function MachineCategoryPicker({ categories, summaries, onSelect, text }: Props) {
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">
      {text("เลือกหมวดหมู่เพื่อดูเครื่องจักร จำนวนที่แสดงตรงกับตัวกรองปัจจุบัน", "Choose a category to view machines. Counts reflect the current filters.")}
    </p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => {
        const active = category.machines.filter((machine) => machine.status === "active").length;
        const openJobs = category.machines.reduce((total, machine) => total + (summaries.get(machine.machine_id)?.openJobs ?? 0), 0);
        return <button key={category.key} type="button"
          onClick={() => onSelect({ key: category.key, label: category.label })}
          className="min-h-36 min-w-0 rounded-xl border border-border p-4 text-left transition-colors hover:border-teal-400 hover:bg-teal-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-start justify-between gap-3">
            <FolderOpen className="h-6 w-6 shrink-0 text-teal-600" aria-hidden />
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </div>
          <h3 className="mt-3 break-words font-semibold">{category.label || text("ไม่ระบุหมวดหมู่", "Uncategorized")}</h3>
          <p className="mt-1 text-sm font-semibold text-teal-700">{category.machines.length} {text("เครื่อง", "machines")}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {text("พร้อมใช้งาน", "Active")}: {active} · {text("งานเปิด", "Open jobs")}: {openJobs}
          </p>
        </button>;
      })}
    </div>
  </div>;
}
