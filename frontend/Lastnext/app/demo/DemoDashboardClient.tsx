"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle2, Clock3, Loader2, Plus, Wrench } from "lucide-react";

import { PriorityBadge } from "@/app/components/PriorityBadge";
import { StatusBadge } from "@/app/components/StatusBadge";
import { Button } from "@/app/components/ui/button";
import { useDemo } from "./DemoProvider";
import { categoryLabel, displayDate } from "./types";

export default function DemoDashboardClient() {
  const { snapshot, loading, error, refresh } = useDemo();
  const jobs = snapshot?.jobs || [];
  const cards = [
    { label: "Open Jobs", value: jobs.filter((job) => ["pending", "in_progress", "waiting_sparepart"].includes(job.status)).length, icon: Clock3, tone: "bg-amber-50 text-amber-700" },
    { label: "In Progress", value: jobs.filter((job) => job.status === "in_progress").length, icon: Wrench, tone: "bg-blue-50 text-blue-700" },
    { label: "Completed", value: jobs.filter((job) => job.status === "completed").length, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
    { label: "High / Critical", value: jobs.filter((job) => ["high", "critical"].includes(job.priority) && job.status !== "completed").length, icon: AlertTriangle, tone: "bg-rose-50 text-rose-700" },
  ];
  return <div className="space-y-6">
    <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-semibold text-teal-700">Maintenance workspace</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Dashboard</h1><p className="mt-1 text-sm text-slate-600">ภาพรวมงานซ่อมบำรุงของ {snapshot?.property.name || "Demo Property"}</p></div><Button asChild><Link href="/demo/create-job/"><Plus className="mr-2 h-4 w-4" />Create Job</Link></Button></section>
    {loading ? <div className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading dashboard data…</div> : null}
    {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void refresh()} className="font-semibold underline">Try again</button></div> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, tone }) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><span className={`mb-5 inline-flex rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></span><p className="text-3xl font-bold tabular-nums">{value}</p><p className="text-sm text-slate-500">{label}</p></article>)}</section>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-semibold">Recent Maintenance Jobs</h2><p className="text-sm text-slate-500">งานล่าสุดของ Property ที่เลือก</p></div><Button variant="outline" size="sm" asChild><Link href="/demo/jobs/">View All</Link></Button></div><div className="divide-y">{jobs.slice(0, 6).map((job) => <Link key={job.id} href={`/demo/jobs/${job.id}/`} className="flex gap-4 p-4 transition hover:bg-slate-50"><div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"><Image src={job.images[0]?.image_url} alt="" fill unoptimized className="object-cover" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><span className="font-mono text-xs font-semibold text-teal-700">{job.id}</span><StatusBadge status={job.status} size="sm" /><PriorityBadge priority={job.priority} size="sm" /></div><p className="mt-1 truncate font-semibold">{job.title}</p><p className="mt-1 text-xs text-slate-500">{job.room} · {categoryLabel(job.category)} · {displayDate(job.updated)}</p></div></Link>)}</div></article>
      <aside className="space-y-4"><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Wrench className="h-5 w-5 text-teal-600" /><h2 className="font-semibold">Preventive Maintenance</h2></div><div className="space-y-3">{snapshot?.maintenance.map((item) => <div key={item.pm_id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{item.pmtitle.replace("[DEMO] ", "")}</p><p className="mt-1 capitalize text-slate-500">{item.status.replaceAll("_", " ")}</p></div>)}</div></article><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Boxes className="h-5 w-5 text-blue-600" /><h2 className="font-semibold">Inventory Alerts</h2></div><div className="space-y-3">{snapshot?.inventory.filter((item) => item.status !== "available").map((item) => <div key={item.item_id} className="flex justify-between gap-3 text-sm"><span>{item.name.replace("[DEMO] ", "")}</span><span className="font-semibold text-rose-700">{item.quantity} left</span></div>)}</div></article></aside>
    </section>
  </div>;
}
