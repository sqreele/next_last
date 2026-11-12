"use client";
import { formatAppDate } from '@/app/lib/date-time.mjs';
import { useAppTimeZone } from '@/app/lib/hooks/useAppTimeZone';


import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, Wrench } from "lucide-react";
import { MachineCategoryPicker } from "./MachineCategoryPicker";
import { groupMachinesByCategory } from "@/app/lib/machine-categories";
import { Input } from "@/app/components/ui/input";
import { StatusBadge } from "@/app/components/StatusBadge";
import { PriorityBadge } from "@/app/components/PriorityBadge";
import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import { buildMachineSummaries } from "@/app/lib/machine-dashboard-summary";
import apiClient from "@/app/lib/api-client";
import MachineService, { type Machine as ServiceMachine } from "@/app/lib/MachineService";

interface Machine extends ServiceMachine {
  brand?: string;
  category?: string;
  location?: string;
  serial_number?: string;
  asset_tag?: string;
  installation_date?: string;
  warranty_end_date?: string;
}
interface MachineJob {
  job_id: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
  technician_name?: string;
  machine?: { machine_id: string } | null;
}
interface Maintenance {
  pm_id: string;
  pmtitle: string;
  machines?: { machine_id: string }[];
  status: string;
  scheduled_date: string;
  completed_date?: string | null;
  frequency?: string;
  assigned_to_name?: string;
  estimated_duration?: number;
  procedure?: string;
}

// Follow pagination through the same authenticated endpoint and preserve property scope.
async function loadAll<T>(endpoint: string, propertyId: string, signal: AbortSignal): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  while (true) {
    const { data } = await apiClient.get<T[] | { results: T[]; next?: string | null }>(endpoint, {
      params: { property_id: propertyId, page_size: 200, page }, signal,
    });
    rows.push(...(Array.isArray(data) ? data : data.results));
    if (Array.isArray(data) || !data.next) return rows;
    page += 1;
  }
}


export default function MachineDashboard({ propertyId, refreshVersion = 0 }: { propertyId: string; refreshVersion?: number }) {
  const appTimeZone = useAppTimeZone();
  const { locale } = useLocale();
  const text = (th: string, en: string) => locale === "th" ? th : en;
  const displayDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : formatAppDate(value, locale === "th" ? "th-TH-u-ca-gregory" : "en-US", { timeZone: appTimeZone });
  };
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<{ key: string; label: string | null } | null>(null);
  const [snapshot, setSnapshot] = useState<{ machines: Machine[]; jobs: MachineJob[]; maintenance: Maintenance[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setLoading(true);
    setError(false);
    setSelectedId("");
    setSelectedCategory(null);
    setQuery("");
    setStatus("all");
    void Promise.all([
      new MachineService().getMachines(propertyId, controller.signal),
      loadAll<MachineJob>("/api/v1/jobs/dashboard/", propertyId, controller.signal),
      loadAll<Maintenance>("/api/v1/preventive-maintenance/", propertyId, controller.signal),
    ]).then(([machines, jobs, maintenance]) => {
      if (controller.signal.aborted) return;
      if (!machines.success || !machines.data) throw new Error("Unable to load machines");
      setSnapshot({ machines: machines.data, jobs, maintenance });
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [propertyId, refreshVersion, retry]);

  const machines = snapshot?.machines ?? [];
  const jobs = snapshot?.jobs ?? [];
  const plans = snapshot?.maintenance ?? [];
  const statusNames: Record<string, string> = {
    active: text("พร้อมใช้งาน", "Active"), maintenance: text("กำลังบำรุงรักษา", "Under maintenance"),
    repair: text("กำลังซ่อม", "Under repair"), inactive: text("หยุดใช้งาน", "Inactive"), retired: text("ปลดระวาง", "Retired"),
  };
  const frequencyNames: Record<string, string> = {
    weekly: text("รายสัปดาห์", "Weekly"), monthly: text("รายเดือน", "Monthly"), annual: text("รายปี", "Yearly"), yearly: text("รายปี", "Yearly"), quarterly: text("รายไตรมาส", "Quarterly"), daily: text("รายวัน", "Daily"),
  };
  const visible = machines.filter((machine) => (status === "all" || machine.status === status) &&
    [machine.machine_id, machine.name, machine.brand, machine.category, machine.location, machine.asset_tag]
      .some((value) => value?.toLowerCase().includes(query.trim().toLowerCase())));
  const categories = groupMachinesByCategory(visible);
  const categoryMachines = selectedCategory
    ? categories.find((category) => category.key === selectedCategory.key)?.machines ?? []
    : [];
  const selected = categoryMachines.find((machine) => machine.machine_id === selectedId);
  const history = jobs.filter((job) => job.machine?.machine_id === selectedId);
  const maintenance = plans.filter((plan) => plan.machines?.some((machine) => machine.machine_id === selectedId));
  const openMachineJobs = jobs.filter((job) => job.machine && !["completed", "verified", "cancelled"].includes(job.status));
  const summaries = useMemo(() => buildMachineSummaries(
    snapshot?.machines ?? [], snapshot?.jobs ?? [], snapshot?.maintenance ?? [],
  ), [snapshot]);
  const latestJobFor = (machineId: string) => summaries.get(machineId)?.latestJob;
  const lastMaintenanceFor = (machine: Machine) => summaries.get(machine.machine_id)?.lastMaintenance;
  const overdue = plans.filter((plan) => plan.machines?.length && !["completed", "verified", "cancelled"].includes(plan.status) && new Date(plan.scheduled_date).getTime() < Date.now());

  if (error) return <section className="rounded-xl border border-destructive/30 bg-card p-6" role="alert"><h2 className="font-semibold">{text("ภาพรวมเครื่องจักร", "Machine Dashboard")}</h2><p className="mt-2 text-sm">{text("ไม่สามารถโหลดข้อมูลเครื่องจักรได้", "Unable to load machine dashboard data")}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 min-h-10 font-semibold text-teal-700 underline">{text("ลองอีกครั้ง", "Try again")}</button></section>;

  return <section id="machines" className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
    <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Wrench className="h-5 w-5 text-teal-600" />{text("ภาพรวมเครื่องจักร", "Machine Dashboard")}</h2><p className="mt-1 text-sm text-muted-foreground">{text("สถานะทรัพย์สิน ประวัติซ่อม และแผนบำรุงรักษาที่เกี่ยวข้อง", "Asset status, repair history and related maintenance plans")}</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      [text("เครื่องจักรทั้งหมด", "Total machines"), machines.length],
      [text("พร้อมใช้งาน", "Active machines"), machines.filter((machine) => machine.status === "active").length],
      [text("งานเครื่องจักรที่เปิดอยู่", "Open machine jobs"), openMachineJobs.length],
      [text("แผน PM เกินกำหนด", "Overdue PM plans"), overdue.length],
    ].map(([label, value]) => <div key={label} className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{loading ? "—" : value}</p></div>)}</div>
    <div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><span className="sr-only">{text("ค้นหาเครื่องจักร", "Search machines")}</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder={text("ค้นหาชื่อ รหัส ยี่ห้อ หรือตำแหน่ง…", "Search name, ID, brand or location…")} className="pl-9" /></label><select aria-label={text("สถานะเครื่องจักร", "Machine status")} value={status} onChange={(event) => { setStatus(event.target.value); setSelectedId(""); }} className="min-h-10 rounded-lg border bg-card px-3 text-sm"><option value="all">{text("ทุกสถานะ", "All statuses")}</option>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {loading ? <p role="status" className="p-4 text-sm text-muted-foreground">{text("กำลังโหลดเครื่องจักร…", "Loading machines…")}</p> : selectedCategory ? <div id="machine-category-machines" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { setSelectedCategory(null); setSelectedId(""); }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-4 w-4" aria-hidden />{text("หมวดหมู่ทั้งหมด", "All categories")}
        </button>
        <h3 className="font-semibold" aria-live="polite">
          {selectedCategory.label || text("ไม่ระบุหมวดหมู่", "Uncategorized")} · {categoryMachines.length} {text("เครื่อง", "machines")}
        </h3>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{categoryMachines.map((machine) => {
      const open = summaries.get(machine.machine_id)?.openJobs ?? 0;
      const latestJob = latestJobFor(machine.machine_id);
      return <button key={machine.machine_id} type="button" aria-expanded={selectedId === machine.machine_id} aria-controls="machine-dashboard-details" onClick={() => setSelectedId(machine.machine_id)} className={`min-w-0 rounded-xl border p-4 text-left transition [overflow-wrap:anywhere] hover:border-teal-400 ${selectedId === machine.machine_id ? "border-teal-500 bg-teal-500/10" : "border-border"}`}>
        <p className="font-mono text-xs font-semibold text-teal-700">{machine.machine_id}</p><h3 className="mt-1 font-semibold">{machine.name}</h3><p className="mt-1 text-xs text-muted-foreground">{machine.category} · {machine.location}</p><div className="mt-3 flex flex-wrap justify-between gap-2 text-xs"><span className={machine.status === "active" ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>{statusNames[machine.status] || machine.status}</span><span>{open} {text("งานเปิด", "open jobs")}</span></div><dl className="mt-3 space-y-2 border-t pt-3 text-xs">
          <div><dt className="text-muted-foreground">{text("งานเครื่องล่าสุด", "Latest machine job")}</dt><dd className="mt-1 font-medium">{latestJob?.description || "—"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{text("อัปเดตงานล่าสุด", "Last job update")}</dt><dd>{displayDate(latestJob?.updated_at || latestJob?.created_at)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{text("บำรุงรักษาล่าสุด", "Last maintenance")}</dt><dd>{displayDate(lastMaintenanceFor(machine))}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{text("PM ครั้งถัดไป", "Next PM due")}</dt><dd>{displayDate(machine.next_maintenance_date)}</dd></div>
        </dl><p className="mt-3 text-xs font-semibold text-teal-700">{text("ดูรายละเอียดและประวัติ →", "View details & history →")}</p>
      </button>;
    })}</div>
      {!categoryMachines.length && <p className="p-6 text-center text-sm text-muted-foreground">{text("ไม่พบเครื่องจักรในหมวดนี้ตามเงื่อนไข", "No machines in this category match your filters")}</p>}
    </div> : <MachineCategoryPicker categories={categories} summaries={summaries} text={text}
      onSelect={(category) => { setSelectedCategory(category); setSelectedId(""); }} />}
    {!loading && !selectedCategory && !visible.length && <p className="p-6 text-center text-sm text-muted-foreground">{text("ไม่พบเครื่องจักรตามเงื่อนไข", "No machines match your filters")}</p>}
    <div id="machine-dashboard-details">{selected && <div className="space-y-5 border-t pt-5">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{selected.name}</h3><button type="button" onClick={() => setSelectedId("")} className="min-h-10 px-3 text-sm font-semibold text-teal-700">{text("ปิดรายละเอียด", "Close details")}</button></div>
      <div className="rounded-xl border bg-muted/50 p-4"><dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{[
        [text("รหัสเครื่อง", "Machine ID"), selected.machine_id],
        [text("งานเครื่องล่าสุด", "Latest machine job"), latestJobFor(selected.machine_id)?.description],
        [text("อัปเดตงานล่าสุด", "Last job update"), displayDate(latestJobFor(selected.machine_id)?.updated_at || latestJobFor(selected.machine_id)?.created_at)],
        [text("ยี่ห้อ", "Brand"), selected.brand],
        ["Serial Number", selected.serial_number],
        [text("ประเภทเครื่อง", "Equipment category"), selected.category],
        [text("ตำแหน่ง", "Location"), selected.location],
        [text("สถานะเครื่อง", "Equipment status"), statusNames[selected.status] || selected.status],
        [text("บำรุงรักษาล่าสุด", "Last maintenance"), displayDate(lastMaintenanceFor(selected))],
        [text("PM ครั้งถัดไป", "Next PM due"), displayDate(selected.next_maintenance_date)],
        [text("สิ้นสุดประกัน", "Warranty end"), displayDate(selected.warranty_end_date)],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value || "—"}</dd></div>)}</dl><Link href={`/dashboard/machines/${encodeURIComponent(selected.machine_id)}`} className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-teal-700">{text("ดูข้อมูลเครื่องจักรทั้งหมด →", "View full machine details →")}</Link></div>
      <div className="grid gap-5 lg:grid-cols-2"><div><h4 className="mb-3 font-semibold">{text("ประวัติงานเครื่องจักร", "Machine work history")} ({history.length})</h4><div className="space-y-3">{history.map((job) => <Link key={job.job_id} href={`/dashboard/jobs/${encodeURIComponent(job.job_id)}/`} className="block rounded-xl border p-4 hover:border-teal-400"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={job.status} size="sm" /><PriorityBadge priority={job.priority} size="sm" /></div><p className="mt-2 text-sm font-semibold">{job.description}</p><p className="mt-1 text-xs text-muted-foreground">{job.technician_name || "—"}</p><p className="mt-2 text-xs text-muted-foreground">{displayDate(job.created_at)}</p></Link>)}{!history.length && <p className="text-sm text-muted-foreground">{text("ยังไม่มีประวัติงาน", "No work history yet")}</p>}</div></div>
        <div><h4 className="mb-3 font-semibold">{text("แผนบำรุงรักษาที่เกี่ยวข้อง", "Related maintenance plans")}</h4><div className="space-y-3">{maintenance.map((plan) => <article key={plan.pm_id} className="rounded-xl border p-4"><p className="text-sm font-semibold">{plan.pmtitle}</p><div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={plan.status} size="sm" /><span className="text-xs text-muted-foreground">{frequencyNames[plan.frequency || ""] || plan.frequency}</span></div><p className="mt-2 text-xs text-muted-foreground">{text("กำหนด", "Scheduled")} {displayDate(plan.scheduled_date)}</p><p className="mt-1 text-xs text-muted-foreground">{plan.assigned_to_name || "—"} · {plan.estimated_duration ?? "—"} {text("นาที", "minutes")}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{plan.procedure}</p>{!["completed", "verified", "cancelled"].includes(plan.status) && new Date(plan.scheduled_date).getTime() < Date.now() && <p className="mt-2 text-xs font-semibold text-rose-700">{text("เกินกำหนด", "Overdue")}</p>}</article>)}{!maintenance.length && <p className="text-sm text-muted-foreground">{text("ยังไม่มีแผน PM ที่เชื่อมโยง", "No linked PM plans yet")}</p>}</div></div>
      </div>
    </div>}</div>
  </section>;
}
