"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  FileBarChart,
  Loader2,
  Plus,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Logo } from "@/app/components/branding/Logo";
import { PriorityBadge } from "@/app/components/PriorityBadge";
import { StatusBadge } from "@/app/components/StatusBadge";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";

type DemoStatus =
  | "pending"
  | "in_progress"
  | "waiting_sparepart"
  | "completed"
  | "cancelled";

type DemoJob = {
  id: string;
  title: string;
  room: string;
  technician: string;
  status: DemoStatus;
  priority: "low" | "medium" | "high" | "critical";
  updated: string;
};

type DemoInventory = { item_id: string; name: string; quantity: number; status: string };
type DemoMaintenance = { pm_id: string; pmtitle: string; status: string; scheduled_date: string; quality_score: number | null };
type DemoSnapshot = {
  jobs: DemoJob[];
  rooms: string[];
  inventory: DemoInventory[];
  maintenance: DemoMaintenance[];
};

const INITIAL_JOBS: DemoJob[] = [
  { id: "DEMO-CT-0001", title: "น้ำรั่วจากฝ้าในห้องพัก", room: "306", technician: "Somchai", status: "pending", priority: "critical", updated: "5 นาทีที่แล้ว" },
  { id: "DEMO-CT-0002", title: "เครื่องปรับอากาศไม่เย็น", room: "402", technician: "Narin", status: "pending", priority: "high", updated: "18 นาทีที่แล้ว" },
  { id: "DEMO-CT-0003", title: "ไฟบริเวณ Lobby กะพริบ", room: "Lobby", technician: "Somchai", status: "pending", priority: "medium", updated: "32 นาทีที่แล้ว" },
  { id: "DEMO-CT-0004", title: "คอยล์เย็นมีเสียงดังผิดปกติ", room: "501", technician: "Narin", status: "in_progress", priority: "high", updated: "1 ชั่วโมงที่แล้ว" },
  { id: "DEMO-CT-0005", title: "กลอนประตูห้องพักฝืด", room: "315", technician: "Krit", status: "in_progress", priority: "medium", updated: "2 ชั่วโมงที่แล้ว" },
  { id: "DEMO-CT-0006", title: "น้ำร้อนไม่สม่ำเสมอ", room: "520", technician: "Somchai", status: "waiting_sparepart", priority: "high", updated: "เมื่อวาน" },
  { id: "DEMO-CT-0007", title: "โทรทัศน์รับสัญญาณไม่ได้", room: "601", technician: "Krit", status: "completed", priority: "medium", updated: "2 วันที่แล้ว" },
  { id: "DEMO-CT-0008", title: "ชักโครกกดน้ำไม่ลง", room: "620", technician: "Narin", status: "completed", priority: "high", updated: "3 วันที่แล้ว" },
  { id: "DEMO-CT-0009", title: "ผนังมีรอยถลอก", room: "420", technician: "Somchai", status: "completed", priority: "low", updated: "1 สัปดาห์ที่แล้ว" },
  { id: "DEMO-CT-0010", title: "ล้างฟิลเตอร์เครื่องปรับอากาศ", room: "306", technician: "Krit", status: "completed", priority: "medium", updated: "2 สัปดาห์ที่แล้ว" },
  { id: "DEMO-CT-0011", title: "เปลี่ยนหลอดไฟทางเดินชั้น 2", room: "ชั้น 2", technician: "Somchai", status: "completed", priority: "medium", updated: "3 สัปดาห์ที่แล้ว" },
  { id: "DEMO-CT-0012", title: "รายการแจ้งซ้ำสำหรับทดสอบ Workflow", room: "402", technician: "Narin", status: "cancelled", priority: "low", updated: "1 เดือนที่แล้ว" },
];

const filters: Array<{ value: "all" | DemoStatus; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "pending", label: "รอดำเนินการ" },
  { value: "in_progress", label: "กำลังดำเนินการ" },
  { value: "waiting_sparepart", label: "รออะไหล่" },
  { value: "completed", label: "เสร็จแล้ว" },
];

function displayUpdated(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function DemoClient() {
  const [jobs, setJobs] = useState(INITIAL_JOBS);
  const [rooms, setRooms] = useState(["306", "315", "402", "420", "501", "520", "601", "620"]);
  const [inventory, setInventory] = useState<DemoInventory[]>([]);
  const [maintenance, setMaintenance] = useState<DemoMaintenance[]>([]);
  const [serviceState, setServiceState] = useState<"loading" | "connected" | "fallback">("loading");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mutatingJob, setMutatingJob] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    room: "",
    priority: "medium" as DemoJob["priority"],
  });

  const applySnapshot = (snapshot: DemoSnapshot) => {
    setJobs(snapshot.jobs);
    setRooms(snapshot.rooms);
    setInventory(snapshot.inventory);
    setMaintenance(snapshot.maintenance);
  };

  useEffect(() => {
    let active = true;
    fetch("/api/demo/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Demo service unavailable");
        return response.json() as Promise<DemoSnapshot>;
      })
      .then((snapshot) => {
        if (!active) return;
        applySnapshot(snapshot);
        setServiceState("connected");
      })
      .catch(() => {
        if (active) setServiceState("fallback");
      });
    return () => { active = false; };
  }, []);

  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesStatus = filter === "all" || job.status === filter;
      const matchesQuery =
        !normalized ||
        `${job.id} ${job.title} ${job.room} ${job.technician}`
          .toLowerCase()
          .includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [filter, jobs, query]);

  const counts = useMemo(
    () => ({
      total: jobs.length,
      open: jobs.filter((job) => ["pending", "in_progress", "waiting_sparepart"].includes(job.status)).length,
      completed: jobs.filter((job) => job.status === "completed").length,
      critical: jobs.filter((job) => job.priority === "critical" && job.status !== "completed").length,
    }),
    [jobs],
  );

  const advanceJob = async (id: string) => {
    const currentJob = jobs.find((job) => job.id === id);
    if (!currentJob || serviceState !== "connected") return;
    const status = currentJob.status === "pending" ? "in_progress" : "completed";
    setMutatingJob(id);
    setActionError("");
    try {
      const response = await fetch(`/api/demo/${encodeURIComponent(id)}/`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Unable to update demo job");
      setJobs((current) => current.map((job) => job.id === id ? result : job));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update demo job");
    } finally {
      setMutatingJob(null);
    }
  };

  const createJob = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setActionError("");
    try {
      const response = await fetch("/api/demo/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Unable to create demo job");
      setJobs((current) => [result, ...current]);
      setDraft({ title: "", room: "", priority: "medium" });
      setFilter("all");
      setQuery("");
      setCreateOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to create demo job");
    } finally {
      setSubmitting(false);
    }
  };

  const resetDemo = async () => {
    setSubmitting(true);
    setActionError("");
    try {
      const response = await fetch("/api/demo/reset/", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Unable to reset demo data");
      applySnapshot(result);
      setFilter("all");
      setQuery("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to reset demo data");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="StayMaint home">
              <Logo variant="horizontal" markClassName="size-8" />
            </Link>
            <span className="hidden rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 sm:inline-flex">
              Public Demo
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                กลับหน้าหลัก
              </Link>
            </Button>
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/auth/register">เริ่มใช้งานจริง</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-900">
        <ShieldCheck className="mr-1.5 inline h-4 w-4" />
        นี่คือ Sandbox Demo — บันทึกเฉพาะฐานข้อมูล Demo และรีเซ็ตอัตโนมัติทุก 30 นาที
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-teal-700">
              <Database className="h-4 w-4" />
              StayMaint Demo Hotel - Chinatown
              {serviceState === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {serviceState === "connected" ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Demo DB connected</span> : null}
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Maintenance Operations Demo</h1>
            <p className="mt-1 text-sm text-slate-600">ทดลองค้นหา กรอง และเปลี่ยนสถานะงานได้ทันทีโดยไม่ต้อง Login</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" asChild>
              <Link href="/demo/report/">
                <FileBarChart className="mr-2 h-4 w-4" />
                Demo Report
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)} disabled={serviceState !== "connected"}>
              <Plus className="mr-2 h-4 w-4" />
              Create Job
            </Button>
            <Button variant="outline" onClick={resetDemo} disabled={serviceState !== "connected" || submitting}>
              <RefreshCw className="mr-2 h-4 w-4" />
              รีเซ็ตข้อมูล Demo
            </Button>
          </div>
        </section>

        {serviceState === "fallback" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Demo database ยังไม่พร้อม ขณะนี้แสดงข้อมูลสำรองแบบอ่านอย่างเดียว
          </p>
        ) : null}
        {actionError ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "งานทั้งหมด", value: counts.total, icon: BarChart3, tone: "bg-blue-50 text-blue-700" },
            { label: "งานที่เปิดอยู่", value: counts.open, icon: Clock3, tone: "bg-amber-50 text-amber-700" },
            { label: "เสร็จแล้ว", value: counts.completed, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
            { label: "งานวิกฤต", value: counts.critical, icon: Wrench, tone: "bg-rose-50 text-rose-700" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`mb-4 inline-flex rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div>
              <p className="text-3xl font-bold">{value}</p>
              <p className="text-sm text-slate-600">{label}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-semibold">Work Orders</h2>
                  <p className="text-sm text-slate-500">เลือกงาน Pending แล้วกด “เริ่มงาน” เพื่อทดลอง Workflow</p>
                </div>
                <div className="relative sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเลขงาน ห้อง หรือช่าง" className="pl-9" />
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filters.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${filter === item.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {visibleJobs.map((job) => (
                <article key={job.id} className="p-4 transition hover:bg-slate-50 sm:p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-teal-700">{job.id}</span>
                        <StatusBadge status={job.status} size="sm" />
                        <PriorityBadge priority={job.priority} size="sm" />
                      </div>
                      <h3 className="font-semibold text-slate-900">{job.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">ห้อง/พื้นที่ {job.room} · ผู้รับผิดชอบ {job.technician} · {displayUpdated(job.updated)}</p>
                    </div>
                    {job.status === "pending" || job.status === "in_progress" ? (
                      <Button size="sm" variant={job.status === "pending" ? "default" : "outline"} onClick={() => advanceJob(job.id)} disabled={serviceState !== "connected" || mutatingJob === job.id}>
                        {mutatingJob === job.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                        {job.status === "pending" ? "เริ่มงาน" : "ปิดงาน"}
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
              {visibleJobs.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">ไม่พบงานที่ตรงกับตัวกรอง</p> : null}
            </div>
          </div>

          <aside className="space-y-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><Wrench className="h-5 w-5 text-teal-600" /><h2 className="font-semibold">Preventive Maintenance</h2></div>
              <div className="space-y-3 text-sm">
                {(maintenance.length ? maintenance : [
                  { pm_id: "fallback-1", pmtitle: "PM ล้างฟิลเตอร์แอร์", status: "completed", scheduled_date: "", quality_score: 9 },
                  { pm_id: "fallback-2", pmtitle: "ตรวจชุดคอยล์ร้อน", status: "pending", scheduled_date: "", quality_score: null },
                ]).map((item) => (
                  <div key={item.pm_id} className={`rounded-xl p-3 ${item.status === "completed" ? "bg-emerald-50" : "bg-amber-50"}`}>
                    <p className={`font-medium ${item.status === "completed" ? "text-emerald-900" : "text-amber-900"}`}>{item.pmtitle.replace("[DEMO] ", "")}</p>
                    <p className={`mt-1 capitalize ${item.status === "completed" ? "text-emerald-700" : "text-amber-700"}`}>{item.status.replace("_", " ")}{item.quality_score ? ` · คะแนนคุณภาพ ${item.quality_score}/10` : ""}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><Boxes className="h-5 w-5 text-blue-600" /><h2 className="font-semibold">Inventory</h2></div>
              <div className="space-y-3 text-sm">
                {(inventory.length ? inventory : [
                  { item_id: "fallback-1", name: "ชุดเครื่องมือช่าง", quantity: 8, status: "available" },
                  { item_id: "fallback-2", name: "ฟิลเตอร์แอร์", quantity: 3, status: "low_stock" },
                  { item_id: "fallback-3", name: "หลอดไฟ LED", quantity: 20, status: "available" },
                  { item_id: "fallback-4", name: "ชุด PPE", quantity: 0, status: "out_of_stock" },
                ]).map((item) => (
                  <div key={item.item_id} className="flex justify-between gap-3">
                    <span>{item.name.replace("[DEMO] ", "")}</span>
                    <span className={`font-semibold ${item.status === "available" ? "text-emerald-700" : item.status === "low_stock" ? "text-amber-700" : "text-rose-700"}`}>{item.quantity} {item.status === "available" ? "พร้อมใช้" : item.status === "low_stock" ? "ใกล้หมด" : "หมดสต็อก"}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
              <h2 className="font-semibold">พร้อมใช้กับโรงแรมของคุณ?</h2>
              <p className="mt-2 text-sm text-slate-300">สมัครเพื่อใช้งานระบบจริงพร้อมการแยกข้อมูลตาม Property และสิทธิ์ผู้ใช้</p>
              <Button className="mt-4 w-full" variant="secondary" asChild><Link href="/auth/register">เริ่มทดลองใช้ฟรี</Link></Button>
            </article>
          </aside>
        </section>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={createJob} className="space-y-5">
            <DialogHeader className="text-left">
              <DialogTitle>Create Demo Job</DialogTitle>
              <DialogDescription>
                งานใหม่จะถูกบันทึกในฐานข้อมูล Demo แยก และแสดงใน Dashboard ทันที
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm font-medium">
                รายละเอียดงาน
                <Input
                  required
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="เช่น เครื่องปรับอากาศไม่เย็น"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium">
                  ห้องหรือพื้นที่
                  <select
                    required
                    value={draft.room}
                    onChange={(event) => setDraft((current) => ({ ...current, room: event.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">เลือกห้อง</option>
                    {rooms.filter((room) => room !== "1900").map((room) => <option key={room} value={room}>{room}</option>)}
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm font-medium">
                  Priority
                  <select
                    value={draft.priority}
                    onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as DemoJob["priority"] }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>
              </div>
              <p className="text-sm text-slate-500">ระบบ Demo จะมอบหมายงานให้ช่างตัวอย่างโดยอัตโนมัติ</p>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>ยกเลิก</Button>
              <Button type="submit" disabled={submitting || serviceState !== "connected"}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                สร้างงาน Demo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
