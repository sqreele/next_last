"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PriorityBadge } from "@/app/components/PriorityBadge";
import { StatusBadge } from "@/app/components/StatusBadge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useDemo } from "../DemoProvider";
import { categoryLabel, displayDate, statusLabels, type DemoPriority, type DemoStatus } from "../types";

export default function DemoJobsClient({ mode = "all" }: { mode?: "all" | "mine" }) {
  const { snapshot, loading } = useDemo();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | DemoStatus>("all");
  const [priority, setPriority] = useState<"all" | DemoPriority>("all");
  const [room, setRoom] = useState("all");
  const [category, setCategory] = useState("all");
  const sourceJobs = useMemo(() => mode === "mine" ? (snapshot?.jobs || []).filter((job) => job.id.startsWith("DWEB")) : snapshot?.jobs || [], [mode, snapshot]);
  const jobs = useMemo(() => { const q = search.trim().toLowerCase(); return sourceJobs.filter((job) => (status === "all" || job.status === status) && (priority === "all" || job.priority === priority) && (room === "all" || job.room === room) && (category === "all" || job.category === category) && (!q || `${job.id} ${job.title} ${job.room} ${job.technician} ${job.category}`.toLowerCase().includes(q))); }, [sourceJobs, status, priority, room, category, search]);
  const statuses: Array<"all" | DemoStatus> = ["all", "pending", "in_progress", "waiting_sparepart", "completed", "cancelled"];
  return <div className="space-y-6">
    <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-semibold text-teal-700">Jobs workspace</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">{mode === "mine" ? "My Jobs" : "Maintenance Jobs"}</h1><p className="mt-1 text-sm text-slate-600">{mode === "mine" ? "งานที่สร้างผ่าน Public Demo ในรอบปัจจุบัน" : `${sourceJobs.length} jobs at ${snapshot?.property.name || "Demo Property"}`}</p></div><Button asChild><Link href="/demo/create-job/"><Plus className="mr-2 h-4 w-4" />Create Job</Link></Button></section>
    <section className="rounded-xl border bg-white p-4 shadow-sm"><div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_repeat(3,180px)]"><div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, description, room or technician…" className="h-11 pl-9" /></div><select value={priority} onChange={(event) => setPriority(event.target.value as "all" | DemoPriority)} className="h-11 rounded-lg border bg-white px-3 text-sm"><option value="all">All priorities</option>{["low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={room} onChange={(event) => setRoom(event.target.value)} className="h-11 rounded-lg border bg-white px-3 text-sm"><option value="all">All rooms / areas</option>{[...new Set(sourceJobs.map((job) => job.room))].sort().map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 rounded-lg border bg-white px-3 text-sm"><option value="all">All categories</option>{snapshot?.categories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></div><div className="mt-4 flex gap-2 overflow-x-auto">{statuses.map((value) => <button type="button" key={value} onClick={() => setStatus(value)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${status === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{value === "all" ? "All Jobs" : statusLabels[value]} <span className="opacity-70">({sourceJobs.filter((job) => value === "all" || job.status === value).length})</span></button>)}</div></section>
    {loading ? <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">Loading jobs…</p> : null}
    {!loading && jobs.length === 0 ? <section className="rounded-xl border border-dashed bg-white p-12 text-center"><h2 className="font-semibold">{mode === "mine" ? "ยังไม่มีงานที่สร้างใน Demo รอบนี้" : "No jobs match these filters"}</h2><p className="mt-2 text-sm text-slate-500">{mode === "mine" ? "สร้างงานใหม่แล้วระบบจะพามาที่หน้านี้เหมือน Production" : "Try adjusting the search or filters."}</p>{mode === "mine" ? <Button className="mt-5" asChild><Link href="/demo/create-job/">Create your first job</Link></Button> : null}</section> : <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{jobs.map((job) => <Link key={job.id} href={`/demo/jobs/${job.id}/`} className="group overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="relative aspect-[16/8] bg-slate-100"><Image src={job.images[0]?.image_url} alt="" fill unoptimized className="object-cover transition group-hover:scale-[1.02]" /><span className="absolute bottom-2 left-2 rounded bg-slate-950/75 px-2 py-1 text-[10px] font-semibold text-white">BEFORE</span></div><div className="p-4"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-teal-700">{job.id}</span><StatusBadge status={job.status} size="sm" /><PriorityBadge priority={job.priority} size="sm" /></div><h2 className="mt-3 font-semibold">{job.title}</h2><p className="mt-2 text-sm text-slate-500">{job.room} · {categoryLabel(job.category)}</p><div className="mt-4 flex justify-between border-t pt-3 text-xs text-slate-500"><span>{job.technician}</span><span>{displayDate(job.updated)}</span></div></div></Link>)}</section>}
  </div>;
}
