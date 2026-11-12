"use client";
import { DEFAULT_APP_TIME_ZONE } from '@/app/lib/date-time.mjs';


import Link from "next/link";
import { useState } from "react";
import { Search, Wrench } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { StatusBadge } from "@/app/components/StatusBadge";
import { PriorityBadge } from "@/app/components/PriorityBadge";
import MachineDetails from "./MachineDetails";
import { useDemo } from "./DemoProvider";
import { useDemoLanguage } from "./DemoLanguageProvider";
import { categoryLabel, displayDate } from "./types";

export default function DemoMachineDashboard() {
  const appTimeZone = DEFAULT_APP_TIME_ZONE;
  const { snapshot, loading } = useDemo();
  const { language, text } = useDemoLanguage();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const machines = snapshot?.machines ?? [];
  const jobs = snapshot?.jobs ?? [];
  const plans = snapshot?.maintenance ?? [];
  const statusNames: Record<string, string> = {
    active: text("พร้อมใช้งาน", "Active"), maintenance: text("กำลังบำรุงรักษา", "Under maintenance"),
    repair: text("กำลังซ่อม", "Under repair"), inactive: text("หยุดใช้งาน", "Inactive"), retired: text("ปลดระวาง", "Retired"),
  };
  const frequencyNames: Record<string, string> = {
    weekly: text("รายสัปดาห์", "Weekly"), monthly: text("รายเดือน", "Monthly"), annual: text("รายปี", "Yearly"),
  };
  const visible = machines.filter((machine) => (status === "all" || machine.status === status) &&
    [machine.machine_id, machine.name, machine.brand, machine.category, machine.location, machine.asset_tag]
      .some((value) => value?.toLowerCase().includes(query.trim().toLowerCase())));
  const selected = machines.find((machine) => machine.machine_id === selectedId);
  const history = jobs.filter((job) => job.machine?.machine_id === selectedId);
  const maintenance = plans.filter((plan) => plan.machine_ids?.includes(selectedId));
  const openMachineJobs = jobs.filter((job) => job.machine && !["completed", "cancelled"].includes(job.status));
  const overdue = plans.filter((plan) => plan.machine_ids?.length && !["completed", "cancelled"].includes(plan.status) && new Date(plan.scheduled_date).getTime() < Date.now());

  return <section id="machines" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Wrench className="h-5 w-5 text-teal-600" />{text("ภาพรวมเครื่องจักร", "Machine Dashboard")}</h2><p className="mt-1 text-sm text-slate-500">{text("สถานะทรัพย์สิน ประวัติซ่อม และแผนบำรุงรักษาที่เกี่ยวข้อง", "Asset status, repair history and related maintenance plans")}</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      [text("เครื่องจักรทั้งหมด", "Total machines"), machines.length],
      [text("พร้อมใช้งาน", "Active machines"), machines.filter((machine) => machine.status === "active").length],
      [text("งานเครื่องจักรที่เปิดอยู่", "Open machine jobs"), openMachineJobs.length],
      [text("แผน PM เกินกำหนด", "Overdue PM plans"), overdue.length],
    ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{loading ? "—" : value}</p></div>)}</div>
    <div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><span className="sr-only">{text("ค้นหาเครื่องจักร", "Search machines")}</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("ค้นหาชื่อ รหัส ยี่ห้อ หรือตำแหน่ง…", "Search name, ID, brand or location…")} className="pl-9" /></label><select aria-label={text("สถานะเครื่องจักร", "Machine status")} value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-lg border bg-white px-3 text-sm"><option value="all">{text("ทุกสถานะ", "All statuses")}</option>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {loading ? <p role="status" className="p-4 text-sm text-slate-500">{text("กำลังโหลดเครื่องจักร…", "Loading machines…")}</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map((machine) => {
      const open = openMachineJobs.filter((job) => job.machine?.machine_id === machine.machine_id).length;
      return <button key={machine.machine_id} type="button" aria-expanded={selectedId === machine.machine_id} aria-controls="demo-machine-details" onClick={() => setSelectedId(machine.machine_id)} className={`rounded-xl border p-4 text-left transition hover:border-teal-400 ${selectedId === machine.machine_id ? "border-teal-500 bg-teal-50" : "border-slate-200"}`}>
        <p className="font-mono text-xs font-semibold text-teal-700">{machine.machine_id}</p><h3 className="mt-1 font-semibold">{machine.name}</h3><p className="mt-1 text-xs text-slate-500">{machine.category} · {machine.location}</p><div className="mt-3 flex flex-wrap justify-between gap-2 text-xs"><span className={machine.status === "active" ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>{statusNames[machine.status] || machine.status}</span><span>{open} {text("งานเปิด", "open jobs")}</span></div><p className="mt-3 text-xs font-semibold text-teal-700">{text("ดูรายละเอียดและประวัติ →", "View details & history →")}</p>
      </button>;
    })}</div>}
    {!loading && !visible.length && <p className="p-6 text-center text-sm text-slate-500">{text("ไม่พบเครื่องจักรตามเงื่อนไข", "No machines match your filters")}</p>}
    <div id="demo-machine-details">{selected && <div className="space-y-5 border-t pt-5">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{selected.name}</h3><button type="button" onClick={() => setSelectedId("")} className="min-h-10 px-3 text-sm font-semibold text-teal-700">{text("ปิดรายละเอียด", "Close details")}</button></div>
      <MachineDetails machine={selected} />
      <div className="grid gap-5 lg:grid-cols-2"><div><h4 className="mb-3 font-semibold">{text("ประวัติงานเครื่องจักร", "Machine work history")} ({history.length})</h4><div className="space-y-3">{history.map((job) => <Link key={job.id} href={`/demo/jobs/${encodeURIComponent(job.id)}/`} className="block rounded-xl border p-4 hover:border-teal-400"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={job.status} size="sm" /><PriorityBadge priority={job.priority} size="sm" /></div><p className="mt-2 text-sm font-semibold">{job.title}</p><p className="mt-1 text-xs text-slate-500">{categoryLabel(job.category, language)} · {job.technician}</p><p className="mt-2 text-xs text-slate-500">{displayDate(job.created, language, appTimeZone)}</p></Link>)}{!history.length && <p className="text-sm text-slate-500">{text("ยังไม่มีประวัติงาน", "No work history yet")}</p>}</div></div>
        <div><h4 className="mb-3 font-semibold">{text("แผนบำรุงรักษาที่เกี่ยวข้อง", "Related maintenance plans")}</h4><div className="space-y-3">{maintenance.map((plan) => <article key={plan.pm_id} className="rounded-xl border p-4"><p className="text-sm font-semibold">{plan.pmtitle.replace("[DEMO] ", "")}</p><div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={plan.status} size="sm" /><span className="text-xs text-slate-500">{frequencyNames[plan.frequency || ""] || plan.frequency}</span></div><p className="mt-2 text-xs text-slate-500">{text("กำหนด", "Scheduled")} {displayDate(plan.scheduled_date, language, appTimeZone)}</p><p className="mt-1 text-xs text-slate-500">{plan.assigned_to} · {plan.estimated_duration ?? "—"} {text("นาที", "minutes")}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{plan.procedure}</p>{!["completed", "cancelled"].includes(plan.status) && new Date(plan.scheduled_date).getTime() < Date.now() && <p className="mt-2 text-xs font-semibold text-rose-700">{text("เกินกำหนด", "Overdue")}</p>}</article>)}{!maintenance.length && <p className="text-sm text-slate-500">{text("ยังไม่มีแผน PM ที่เชื่อมโยง", "No linked PM plans yet")}</p>}</div></div>
      </div>
    </div>}</div>
  </section>;
}
