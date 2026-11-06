"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PriorityBadge } from "@/app/components/PriorityBadge";
import { StatusBadge } from "@/app/components/StatusBadge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import DemoFilters, { DemoFilterSelect } from "../DemoFilters";
import { useDemo } from "../DemoProvider";
import { useDemoLanguage } from "../DemoLanguageProvider";
import { categoryLabel, displayDate, statusLabels, statusLabelsThai, type DemoPriority, type DemoStatus } from "../types";

export default function DemoJobsClient({ mode = "all" }: { mode?: "all" | "mine" }) {
  const { snapshot, loading } = useDemo();
  const { language, text } = useDemoLanguage();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | DemoStatus>("all");
  const [priority, setPriority] = useState<"all" | DemoPriority>("all");
  const [room, setRoom] = useState("all");
  const [category, setCategory] = useState("all");
  const sourceJobs = useMemo(() => mode === "mine" ? (snapshot?.jobs || []).filter((job) => job.id.startsWith("DWEB")) : snapshot?.jobs || [], [mode, snapshot]);
  const baseJobs = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sourceJobs.filter((job) => (priority === "all" || job.priority === priority)
      && (room === "all" || job.room === room) && (category === "all" || job.category === category)
      && terms.every((term) => `${job.id} ${job.title} ${job.room} ${job.technician} ${job.category} ${categoryLabel(job.category, language)}`.toLowerCase().includes(term)));
  }, [sourceJobs, priority, room, category, search, language]);
  const jobs = useMemo(() => baseJobs.filter((job) => status === "all" || job.status === status), [baseJobs, status]);
  const priorityLabels = language === "th" ? { low: "ต่ำ", medium: "ปานกลาง", high: "สูง", critical: "วิกฤต" } : { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
  const clearFilters = () => { setSearch(""); setStatus("all"); setPriority("all"); setRoom("all"); setCategory("all"); };
  const activeFilters = [
    ...(search.trim() ? [{ key: "search", label: text("ค้นหา", "Search"), value: search.trim(), remove: () => setSearch("") }] : []),
    ...(status !== "all" ? [{ key: "status", label: text("สถานะ", "Status"), value: language === "th" ? statusLabelsThai[status] : statusLabels[status], remove: () => setStatus("all") }] : []),
    ...(priority !== "all" ? [{ key: "priority", label: text("ความสำคัญ", "Priority"), value: priorityLabels[priority], remove: () => setPriority("all") }] : []),
    ...(room !== "all" ? [{ key: "room", label: text("ห้อง / พื้นที่", "Room / Area"), value: room, remove: () => setRoom("all") }] : []),
    ...(category !== "all" ? [{ key: "category", label: text("หมวดหมู่", "Category"), value: categoryLabel(category, language), remove: () => setCategory("all") }] : []),
  ];
  const statuses: Array<"all" | DemoStatus> = ["all", "pending", "in_progress", "waiting_sparepart", "completed", "cancelled"];
  return <div className="space-y-6">
    <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700 sm:text-sm sm:normal-case sm:tracking-normal">{text("พื้นที่จัดการงาน", "Jobs workspace")}</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">{mode === "mine" ? text("งานของฉัน", "My Jobs") : text("งานซ่อมบำรุง", "Maintenance Jobs")}</h1><p className="mt-1 text-sm text-slate-600">{mode === "mine" ? text("งานที่สร้างผ่าน Public Demo ในรอบปัจจุบัน", "Jobs created in the current Public Demo session") : text(`${sourceJobs.length} งานที่ ${snapshot?.property.name || "Demo Property"}`, `${sourceJobs.length} jobs at ${snapshot?.property.name || "Demo Property"}`)}</p></div><Button asChild className="hidden md:inline-flex"><Link href="/demo/create-job/"><Plus className="mr-2 h-4 w-4" />{text("สร้างงาน", "Create Job")}</Link></Button></section>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <label className="block space-y-2"><span className="text-sm font-semibold text-slate-700">{text("ค้นหางาน", "Search jobs")}</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-400" /><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text("รหัสงาน รายละเอียด ห้อง หรือช่าง…", "Job ID, description, room or technician…")} className="h-12 rounded-xl pl-9 text-base sm:text-sm" /></span></label>
      <DemoFilters active={activeFilters} clear={clearFilters} count={jobs.length} total={sourceJobs.length} loading={loading}>
        <DemoFilterSelect label={text("ความสำคัญ", "Priority")} value={priority} onChange={(value) => setPriority(value as "all" | DemoPriority)} allLabel={text("ทุกระดับความสำคัญ", "All priorities")} options={Object.entries(priorityLabels)} />
        <DemoFilterSelect label={text("ห้อง / พื้นที่ / เครื่องจักร", "Room / Area / Machine")} value={room} onChange={setRoom} allLabel={text("ทุกห้อง / พื้นที่", "All rooms / areas")} options={[...new Set(sourceJobs.map((job) => job.room))].sort().map((value) => [value, value])} />
        <DemoFilterSelect label={text("หมวดหมู่งาน", "Job category")} value={category} onChange={setCategory} allLabel={text("ทุกหมวดหมู่", "All categories")} options={[...new Set([...(snapshot?.categories ?? []), ...sourceJobs.map((job) => job.category)])].sort().map((value) => [value, categoryLabel(value, language)])} />
      </DemoFilters>
      <div className="space-y-2 border-t border-slate-100 pt-4"><p className="text-sm font-semibold text-slate-700">{text("สถานะงาน", "Job status")}</p><div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label={text("กรองสถานะงาน", "Filter job status")}>{statuses.map((value) => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)} className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold sm:justify-center ${status === value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><span>{value === "all" ? text("งานทั้งหมด", "All Jobs") : language === "th" ? statusLabelsThai[value] : statusLabels[value]}</span><span className={`rounded-md px-1.5 py-0.5 tabular-nums ${status === value ? "bg-white/20" : "bg-slate-100"}`}>{baseJobs.filter((job) => value === "all" || job.status === value).length}</span></button>)}</div></div>
    </section>
    {loading ? <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">{text("กำลังโหลดงาน…", "Loading jobs…")}</p> : null}
    {!loading && jobs.length === 0 ? <section className="rounded-xl border border-dashed bg-white px-5 py-10 text-center sm:p-12"><h2 className="font-semibold">{(mode === "mine" && sourceJobs.length === 0) ? text("ยังไม่มีงานที่สร้างใน Demo รอบนี้", "No jobs created in this Demo session yet") : text("ไม่พบงานตามตัวกรอง", "No jobs match these filters")}</h2><p className="mt-2 text-sm text-slate-500">{(mode === "mine" && sourceJobs.length === 0) ? text("สร้างงานใหม่แล้วระบบจะพามาที่หน้านี้เหมือน Production", "Create a job and the system will bring you here, just like Production") : text("ลองปรับคำค้นหาหรือตัวกรอง", "Try adjusting the search or filters.")}</p>{activeFilters.length > 0 && <Button type="button" variant="outline" className="mt-4 h-11" onClick={clearFilters}>{text("ล้างตัวกรองเพื่อดูทุกงาน", "Clear filters to see all jobs")}</Button>}{(mode === "mine" && sourceJobs.length === 0) ? <Button className="mt-5 h-11" asChild><Link href="/demo/create-job/">{text("สร้างงานแรก", "Create your first job")}</Link></Button> : null}</section> : <section className="grid gap-3 md:grid-cols-2 md:gap-4 2xl:grid-cols-3">{jobs.map((job) => <Link key={job.id} href={`/demo/jobs/${job.id}/`} className="group overflow-hidden rounded-xl border bg-white shadow-sm transition active:bg-slate-50 hover:-translate-y-0.5 hover:shadow-md"><div className="relative aspect-[16/7] bg-slate-100 sm:aspect-[16/8]"><Image src={job.images[0]?.image_url} alt="" fill unoptimized className="object-cover transition group-hover:scale-[1.02]" /><span className="absolute bottom-2 left-2 rounded bg-slate-950/75 px-2 py-1 text-[10px] font-semibold text-white">{text("ก่อนซ่อม", "BEFORE")}</span></div><div className="p-3.5 sm:p-4"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-teal-700">{job.id}</span><StatusBadge status={job.status} size="sm" /><PriorityBadge priority={job.priority} size="sm" /></div><h2 className="mt-2.5 line-clamp-2 font-semibold sm:mt-3">{job.title}</h2><p className="mt-2 text-sm text-slate-500">{job.room} · {categoryLabel(job.category, language)}</p><div className="mt-3 flex justify-between gap-3 border-t pt-3 text-xs text-slate-500 sm:mt-4"><span className="truncate">{job.technician}</span><span className="shrink-0">{displayDate(job.updated, language)}</span></div></div></Link>)}</section>}
  </div>;
}
