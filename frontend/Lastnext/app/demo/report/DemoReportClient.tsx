"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  Wrench,
} from "lucide-react";

import { PriorityBadge } from "@/app/components/PriorityBadge";
import { StatusBadge } from "@/app/components/StatusBadge";
import { Button } from "@/app/components/ui/button";
import { useDemoLanguage } from "../DemoLanguageProvider";
import { categoryLabel, displayDate } from "../types";

type DemoStatus = "pending" | "in_progress" | "waiting_sparepart" | "completed" | "cancelled";
type DemoPriority = "low" | "medium" | "high" | "critical";
type DemoJob = {
  id: string;
  title: string;
  room: string;
  technician: string;
  status: DemoStatus;
  priority: DemoPriority;
  category?: string;
  updated: string;
  images?: Array<{ id: number | string; image_type: "before" | "after"; image_url: string }>;
};
type DemoInventory = { item_id: string; name: string; quantity: number; status: string };
type DemoMaintenance = { pm_id: string; pmtitle: string; status: string; scheduled_date: string; quality_score: number | null };
type DemoSnapshot = {
  property: { property_id: string; name: string };
  jobs: DemoJob[];
  inventory: DemoInventory[];
  maintenance: DemoMaintenance[];
  reset_interval_minutes: number;
};

const statusLabels: Record<DemoStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  waiting_sparepart: "Waiting Spare Part",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusLabelsThai: Record<DemoStatus, string> = {
  pending: "รอดำเนินการ",
  in_progress: "กำลังดำเนินการ",
  waiting_sparepart: "รออะไหล่",
  completed: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};

const priorityLabels: Record<DemoPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const statusColors: Record<DemoStatus, string> = {
  pending: "bg-amber-500",
  in_progress: "bg-blue-500",
  waiting_sparepart: "bg-violet-500",
  completed: "bg-emerald-500",
  cancelled: "bg-slate-400",
};

const priorityColors: Record<DemoPriority, string> = {
  low: "bg-slate-400",
  medium: "bg-sky-500",
  high: "bg-orange-500",
  critical: "bg-rose-500",
};

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function DistributionBars({
  rows,
}: {
  rows: Array<{ label: string; value: number; color: string }>;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 text-sm">
          <span className="truncate text-slate-600">{row.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${row.color}`} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
          <span className="text-right font-semibold tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function DemoReportClient() {
  const { language, text } = useDemoLanguage();
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/demo/", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || text("ไม่สามารถโหลดรายงาน Demo ได้", "Unable to load demo report"));
      setSnapshot(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text("ไม่สามารถโหลดรายงาน Demo ได้", "Unable to load demo report"));
    } finally {
      setLoading(false);
    }
  }, [text]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const report = useMemo(() => {
    const jobs = snapshot?.jobs ?? [];
    const countStatus = (status: DemoStatus) => jobs.filter((job) => job.status === status).length;
    const byRoom = new Map<string, number>();
    jobs.forEach((job) => byRoom.set(job.room, (byRoom.get(job.room) ?? 0) + 1));
    return {
      total: jobs.length,
      open: jobs.filter((job) => ["pending", "in_progress", "waiting_sparepart"].includes(job.status)).length,
      completed: countStatus("completed"),
      urgent: jobs.filter((job) => ["high", "critical"].includes(job.priority) && job.status !== "completed").length,
      statusRows: (Object.keys(statusLabels) as DemoStatus[]).map((status) => ({
        label: language === "th" ? statusLabelsThai[status] : statusLabels[status], value: countStatus(status), color: statusColors[status],
      })),
      priorityRows: (Object.keys(priorityLabels) as DemoPriority[]).map((priority) => ({
        label: priorityLabels[priority],
        value: jobs.filter((job) => job.priority === priority).length,
        color: priorityColors[priority],
      })),
      roomRows: [...byRoom.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6)
        .map(([label, value]) => ({ label, value, color: "bg-teal-500" })),
      categoryRows: [...new Set(jobs.map((job) => job.category).filter((value): value is string => Boolean(value)))]
        .map((category) => ({
          label: categoryLabel(category, language),
          value: jobs.filter((job) => job.category === category).length,
          color: "bg-indigo-500",
        }))
        .sort((left, right) => right.value - left.value),
    };
  }, [language, snapshot]);

  const exportCsv = () => {
    if (!snapshot) return;
    const header = language === "th" ? ["รหัสงาน", "รายละเอียด", "ห้อง/พื้นที่", "หมวดหมู่", "ช่าง", "สถานะ", "ความสำคัญ", "อัปเดต"] : ["Job ID", "Title", "Room/Area", "Category", "Technician", "Status", "Priority", "Updated"];
    const rows = snapshot.jobs.map((job) => [
      job.id, job.title, job.room, job.category || "", job.technician, language === "th" ? statusLabelsThai[job.status] : statusLabels[job.status], priorityLabels[job.priority], displayDate(job.updated, language),
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `staymaint-demo-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-slate-950">
        <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold text-teal-700">{text("ข้อมูลสด · ฐานข้อมูล Demo แยก", "Live data · Isolated Demo Database")}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{text("รายงานงานซ่อม Demo", "Maintenance Demo Report")}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {snapshot?.property.name ?? "StayMaint Demo Hotel - Chinatown"} · {text("อัปเดต ณ", "Updated at")} {new Date().toLocaleString(language === "th" ? "th-TH" : "en-GB")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 print:hidden sm:flex sm:flex-wrap">
            <Button variant="outline" onClick={() => void loadReport()} disabled={loading} className="h-11">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{text("รีเฟรช", "Refresh")}
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!snapshot} className="h-11">
              <Download className="mr-2 h-4 w-4" />{text("ส่งออก CSV", "Export CSV")}
            </Button>
            <Button onClick={() => window.print()} disabled={!snapshot} className="col-span-2 h-11 sm:col-span-1">
              <Printer className="mr-2 h-4 w-4" />{text("พิมพ์ / PDF", "Print / PDF")}
            </Button>
          </div>
        </section>

        {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: text("งานทั้งหมด", "Total Jobs"), value: report.total, icon: Wrench, tone: "bg-blue-50 text-blue-700" },
            { label: text("งานที่เปิดอยู่", "Open Jobs"), value: report.open, icon: Clock3, tone: "bg-amber-50 text-amber-700" },
            { label: text("เสร็จแล้ว", "Completed"), value: report.completed, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
            { label: text("ด่วน / วิกฤตที่ยังเปิด", "Open High / Critical"), value: report.urgent, icon: AlertTriangle, tone: "bg-rose-50 text-rose-700" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:rounded-2xl sm:p-5">
              <div className="flex items-center justify-between gap-2 sm:block"><div className={`inline-flex rounded-xl p-2 sm:mb-4 sm:p-2.5 ${tone}`}><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></div><p className="text-2xl font-bold tabular-nums sm:text-3xl">{loading ? "—" : value}</p></div>
              <p className="mt-2 text-xs leading-tight text-slate-600 sm:mt-0 sm:text-sm">{label}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
            <h2 className="mb-5 font-semibold">{text("งานตามสถานะ", "Jobs by Status")}</h2>
            <DistributionBars rows={report.statusRows} />
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
            <h2 className="mb-5 font-semibold">{text("งานตามความสำคัญ", "Jobs by Priority")}</h2>
            <DistributionBars rows={report.priorityRows} />
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
            <h2 className="mb-5 font-semibold">{text("พื้นที่ที่มีงานสูงสุด", "Top Job Locations")}</h2>
            <DistributionBars rows={report.roomRows} />
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
            <h2 className="mb-5 font-semibold">{text("งานตามหมวดหมู่", "Jobs by Category")}</h2>
            <DistributionBars rows={report.categoryRows} />
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Wrench className="h-5 w-5 text-teal-600" /><h2 className="font-semibold">{text("การบำรุงรักษาเชิงป้องกัน", "Preventive Maintenance")}</h2></div>
            <div className="space-y-3">
              {snapshot?.maintenance.map((item) => (
                <div key={item.pm_id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <div><p className="font-medium">{item.pmtitle.replace("[DEMO] ", "")}</p><p className="mt-1 text-slate-500">{text("กำหนด", "Scheduled")} {item.scheduled_date}</p></div>
                  <span className="whitespace-nowrap font-semibold capitalize text-teal-700">{item.status.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Boxes className="h-5 w-5 text-blue-600" /><h2 className="font-semibold">{text("สถานะสินค้าคงคลัง", "Inventory Status")}</h2></div>
            <div className="space-y-3">
              {snapshot?.inventory.map((item) => (
                <div key={item.item_id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <span className="font-medium">{item.name.replace("[DEMO] ", "")}</span>
                  <span className={`font-semibold ${item.status === "available" ? "text-emerald-700" : item.status === "low_stock" ? "text-amber-700" : "text-rose-700"}`}>{item.quantity} · {item.status.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
          <div className="border-b border-slate-200 p-5"><h2 className="font-semibold">{text("รายละเอียดใบสั่งงาน", "Work Order Detail")}</h2><p className="text-sm text-slate-500">{text("ข้อมูลล่าสุดจากฐานข้อมูล Demo", "Latest data from the Demo Database")}</p></div>
          <div className="divide-y md:hidden">
            {snapshot?.jobs.map((job) => (
              <Link key={job.id} href={`/demo/jobs/${job.id}/`} className="flex min-h-24 gap-3 p-3.5 active:bg-slate-50">
                {job.images?.[0]?.image_url ? <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"><Image src={job.images[0].image_url} alt="" fill unoptimized className="object-cover" /></div> : <div className="h-20 w-20 shrink-0 rounded-lg bg-slate-100" />}
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold text-teal-700">{job.id}</span><StatusBadge status={job.status} size="sm" /></div><p className="mt-1 line-clamp-2 text-sm font-semibold leading-5">{job.title}</p><div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500"><span className="truncate">{job.room} · {job.category ? categoryLabel(job.category, language) : "—"}</span><PriorityBadge priority={job.priority} size="sm" /></div></div>
              </Link>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>{(language === "th" ? ["รูป", "รหัสงาน", "รายละเอียด", "ห้อง/พื้นที่", "หมวดหมู่", "ผู้รับผิดชอบ", "สถานะ", "ความสำคัญ", "อัปเดต"] : ["Image", "Job ID", "Description", "Room/Area", "Category", "Technician", "Status", "Priority", "Updated"]).map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshot?.jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {job.images?.[0]?.image_url ? <div className="relative h-12 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"><Image src={job.images[0].image_url} alt="" fill unoptimized className="object-cover" /></div> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-teal-700">{job.id}</td>
                    <td className="px-4 py-3 font-medium">{job.title}</td>
                    <td className="px-4 py-3">{job.room}</td>
                    <td className="whitespace-nowrap px-4 py-3">{job.category ? categoryLabel(job.category, language) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{job.technician}</td>
                    <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={job.status} size="sm" /></td>
                    <td className="whitespace-nowrap px-4 py-3"><PriorityBadge priority={job.priority} size="sm" /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{displayDate(job.updated, language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-center text-xs text-slate-500">{text(`รายงานนี้ใช้ข้อมูลทดลองเท่านั้น ข้อมูลจะรีเซ็ตอัตโนมัติทุก ${snapshot?.reset_interval_minutes ?? 30} นาที`, `This report uses demo data only. Data resets automatically every ${snapshot?.reset_interval_minutes ?? 30} minutes.`)}</p>
    </div>
  );
}
