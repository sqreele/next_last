"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle2, Clock3, Loader2, Plus, Wrench } from "lucide-react";

import { PriorityBadge } from "@/app/components/PriorityBadge";
import { StatusBadge } from "@/app/components/StatusBadge";
import { Button } from "@/app/components/ui/button";
import { useDemo } from "./DemoProvider";
import { useDemoLanguage } from "./DemoLanguageProvider";
import { categoryLabel, displayDate } from "./types";
import DemoMachineDashboard from "./DemoMachineDashboard";

export default function DemoDashboardClient() {
  const { snapshot, loading, error, refresh } = useDemo();
  const { language, text } = useDemoLanguage();
  const jobs = snapshot?.jobs || [];
  const cards = [
    { label: text("งานที่เปิดอยู่", "Open Jobs"), value: jobs.filter((job) => ["pending", "in_progress", "waiting_sparepart"].includes(job.status)).length, icon: Clock3, tone: "bg-amber-50 text-amber-700" },
    { label: text("กำลังดำเนินการ", "In Progress"), value: jobs.filter((job) => job.status === "in_progress").length, icon: Wrench, tone: "bg-blue-50 text-blue-700" },
    { label: text("เสร็จแล้ว", "Completed"), value: jobs.filter((job) => job.status === "completed").length, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
    { label: text("ด่วน / วิกฤต", "High / Critical"), value: jobs.filter((job) => ["high", "critical"].includes(job.priority) && job.status !== "completed").length, icon: AlertTriangle, tone: "bg-rose-50 text-rose-700" },
  ];
  return <div className="space-y-6">
    <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700 sm:text-sm sm:normal-case sm:tracking-normal">{text("พื้นที่งานซ่อมบำรุง", "Maintenance workspace")}</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">{text("ภาพรวม", "Dashboard")}</h1><p className="mt-1 text-sm text-slate-600">{text("ภาพรวมงานซ่อมบำรุงของ", "Maintenance overview for")} {snapshot?.property.name || "Demo Property"}</p></div><Button asChild className="hidden md:inline-flex"><Link href="/demo/create-job/"><Plus className="mr-2 h-4 w-4" />{text("สร้างงาน", "Create Job")}</Link></Button></section>
    {loading ? <div className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />{text("กำลังโหลดข้อมูลภาพรวม…", "Loading dashboard data…")}</div> : null}
    {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void refresh()} className="font-semibold underline">{text("ลองอีกครั้ง", "Try again")}</button></div> : null}
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, tone }) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-2 sm:block"><span className={`inline-flex rounded-xl p-2 sm:mb-5 sm:p-2.5 ${tone}`}><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></span><p className="text-2xl font-bold tabular-nums sm:text-3xl">{value}</p></div><p className="mt-2 text-xs leading-tight text-slate-500 sm:mt-0 sm:text-sm">{label}</p></article>)}</section>
    <DemoMachineDashboard />
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b p-4 sm:p-5"><div className="min-w-0"><h2 className="font-semibold">{text("งานซ่อมล่าสุด", "Recent Maintenance Jobs")}</h2><p className="truncate text-xs text-slate-500 sm:text-sm">{text("งานล่าสุดของที่พักที่เลือก", "Latest jobs for the selected property")}</p></div><Button variant="outline" size="sm" asChild className="shrink-0"><Link href="/demo/jobs/">{text("ดูทั้งหมด", "View All")}</Link></Button></div><div className="divide-y">{jobs.slice(0, 6).map((job) => <Link key={job.id} href={`/demo/jobs/${job.id}/`} className="flex gap-3 p-3 transition active:bg-slate-100 hover:bg-slate-50 sm:gap-4 sm:p-4"><div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:w-20"><Image src={job.images[0]?.image_url} alt="" fill unoptimized className="object-cover" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 overflow-hidden"><span className="shrink-0 font-mono text-xs font-semibold text-teal-700">{job.id}</span><StatusBadge status={job.status} size="sm" /><span className="hidden sm:inline-flex"><PriorityBadge priority={job.priority} size="sm" /></span></div><p className="mt-1 truncate text-sm font-semibold sm:text-base">{job.title}</p><p className="mt-1 truncate text-xs text-slate-500">{job.room} · {categoryLabel(job.category, language)} · {displayDate(job.updated, language)}</p></div></Link>)}</div></article>
      <aside className="space-y-4"><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Wrench className="h-5 w-5 text-teal-600" /><h2 className="font-semibold">{text("การบำรุงรักษาเชิงป้องกัน", "Preventive Maintenance")}</h2></div><div className="space-y-3">{snapshot?.maintenance.map((item) => <div key={item.pm_id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{item.pmtitle.replace("[DEMO] ", "")}</p><p className="mt-1 capitalize text-slate-500">{item.status.replaceAll("_", " ")}</p></div>)}</div></article><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Boxes className="h-5 w-5 text-blue-600" /><h2 className="font-semibold">{text("แจ้งเตือนสินค้าคงคลัง", "Inventory Alerts")}</h2></div><div className="space-y-3">{snapshot?.inventory.filter((item) => item.status !== "available").map((item) => <div key={item.item_id} className="flex justify-between gap-3 text-sm"><span>{item.name.replace("[DEMO] ", "")}</span><span className="font-semibold text-rose-700">{item.quantity} {text("คงเหลือ", "left")}</span></div>)}</div></article></aside>
    </section>
  </div>;
}
