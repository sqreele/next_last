"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, History, Search } from "lucide-react";
import { useDemo } from "../DemoProvider";
import { useDemoLanguage } from "../DemoLanguageProvider";
import { categoryLabel, displayDate } from "../types";
import { StatusBadge } from "@/app/components/StatusBadge";
import { PriorityBadge } from "@/app/components/PriorityBadge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

export default function DemoRoomsClient() {
  const { snapshot, loading, error, refresh } = useDemo();
  const { language, text } = useDemoLanguage();
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const selected = params.get("room") || "";
  const rooms = snapshot?.rooms ?? [];
  const roomJobs = (snapshot?.jobs ?? []).filter((job) => job.room === selected).sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  const history = roomJobs.filter((job) => kind === "all" || (kind === "pm" ? job.is_preventive_maintenance : !job.is_preventive_maintenance));
  const open = roomJobs.filter((job) => !["completed", "cancelled"].includes(job.status)).length;
  return <div className="space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-widest text-teal-700">{text("ข้อมูลห้องพัก", "Room workspace")}</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">{text("ห้องพักและประวัติงาน", "Rooms & maintenance history")}</h1><p className="mt-2 text-sm text-slate-500">{text("เลือกห้องเพื่อดูงานซ่อม งาน PMM รูปหลักฐาน และงานที่ยังเปิดอยู่", "Choose a room to review repairs, PMM jobs, evidence and open work.")}</p></header>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<Button variant="outline" onClick={() => void refresh()} className="ml-3">{text("ลองใหม่", "Retry")}</Button></div>}
    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className="min-w-0 space-y-3"><label className="relative block"><span className="sr-only">{text("ค้นหาห้อง", "Search rooms")}</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("ค้นหาหมายเลขห้อง…", "Search room number…")} className="h-11 bg-white pl-9" /></label>
        {loading ? <p role="status" className="p-5 text-sm text-slate-500">{text("กำลังโหลดห้อง…", "Loading rooms…")}</p> : <div className="grid max-h-[32rem] grid-cols-2 gap-3 overflow-y-auto xl:grid-cols-1">{rooms.filter((room) => room.includes(query.trim())).map((room) => {
          const jobs = (snapshot?.jobs ?? []).filter((job) => job.room === room);
          const pending = jobs.filter((job) => !["completed", "cancelled"].includes(job.status)).length;
          return <Link key={room} href={`/demo/rooms/?room=${encodeURIComponent(room)}`} aria-current={selected === room ? "page" : undefined} className={`rounded-xl border p-4 transition ${selected === room ? "border-teal-500 bg-teal-50 ring-1 ring-teal-500" : "border-slate-200 bg-white hover:border-teal-300"}`}><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-teal-700" /><span className="font-bold">{text("ห้อง", "Room")} {room}</span></div><p className="mt-2 text-xs text-slate-500">{text(`${jobs.length} งาน · เปิดอยู่ ${pending}`, `${jobs.length} jobs · ${pending} open`)}</p><span className="mt-2 inline-block text-xs font-semibold text-teal-700">{text("ดูประวัติ →", "View history →")}</span></Link>;
        })}</div>}
        {!loading && !rooms.some((room) => room.includes(query.trim())) && <p className="p-5 text-sm text-slate-500">{text("ไม่พบห้อง", "No rooms found")}</p>}
      </section>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {!selected ? <div className="grid min-h-80 place-items-center text-center"><div><History className="mx-auto mb-3 h-10 w-10 text-teal-600" /><h2 className="font-semibold">{text("เลือกห้องเพื่อดูประวัติงาน", "Select a room to view its history")}</h2><p className="mt-2 text-sm text-slate-500">{text("รวมงานซ่อมและงานบำรุงรักษาไว้ในที่เดียว", "Repairs and preventive work in one place")}</p></div></div> : !loading && !rooms.includes(selected) ? <p className="p-6 text-slate-500">{text("ไม่พบห้องนี้ใน Demo", "This room is not in the Demo property")}</p> : <>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-teal-700">{text("ประวัติห้อง", "Room history")}</p><h2 className="mt-1 text-2xl font-bold">{text("ห้อง", "Room")} {selected}</h2></div><Button variant="outline" onClick={() => router.push("/demo/rooms/")}>{text("ล้างห้องที่เลือก", "Clear selection")}</Button></div>
          <div className="my-5 grid grid-cols-3 gap-2">{[[text("ทั้งหมด", "Total"), roomJobs.length], [text("งานเปิด", "Open"), open], [text("งาน PMM", "PMM jobs"), roomJobs.filter((job) => job.is_preventive_maintenance).length]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>)}</div>
          <label className="mb-5 block text-sm font-medium">{text("ประเภทงาน", "Work type")}<select value={kind} onChange={(event) => setKind(event.target.value)} className="ml-3 h-11 rounded-lg border bg-white px-3"><option value="all">{text("ทุกงาน", "All jobs")}</option><option value="pm">{text("งาน PMM / PM", "PMM / PM jobs")}</option><option value="repair">{text("งานซ่อมทั่วไป", "Corrective jobs")}</option></select></label>
          <div className="space-y-3">{history.map((job) => <Link key={job.id} href={`/demo/jobs/${encodeURIComponent(job.id)}/`} className="block rounded-xl border border-slate-200 p-4 hover:border-teal-300 hover:bg-teal-50/40"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-teal-700">{job.id}</span><StatusBadge status={job.status} size="sm" /><PriorityBadge priority={job.priority} size="sm" /></div><h3 className="mt-2 font-semibold">{job.title}</h3><p className="mt-1 text-xs text-slate-500">{categoryLabel(job.category, language)} · {job.technician}</p><p className="mt-2 text-xs text-slate-500">{text("สร้างเมื่อ", "Created")} {displayDate(job.created, language)}</p>{job.completed && <p className="mt-1 text-xs text-teal-700">{text("เสร็จเมื่อ", "Completed")} {displayDate(job.completed, language)}</p>}<span className="mt-3 inline-block text-xs font-semibold text-teal-700">{text(`ดูงานและรูปหลักฐาน (${job.images.length}) →`, `View job & evidence (${job.images.length}) →`)}</span></Link>)}</div>
          {!loading && !history.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">{text("ยังไม่มีประวัติงานตามประเภทที่เลือก", "No job history for the selected work type")}</p>}
          <p className="mt-5 text-xs text-slate-400">{text("แสดงประวัติจากข้อมูล Demo ปัจจุบัน ข้อมูลรีเซ็ตทุก 45 นาที", "History uses the current Demo dataset, which resets every 45 minutes.")}</p>
        </>}
      </section>
    </div>
  </div>;
}
