"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  BarChart3,
  BedDouble,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  FileBarChart,
  Loader2,
  ImagePlus,
  Plus,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
  X,
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
  category?: string;
  updated: string;
  images?: Array<{ id: number | string; image_type: "before" | "after"; image_url: string }>;
};

type DemoInventory = { item_id: string; name: string; quantity: number; status: string };
type DemoMaintenance = { pm_id: string; pmtitle: string; status: string; scheduled_date: string; quality_score: number | null };
type DemoSnapshot = {
  jobs: DemoJob[];
  rooms: string[];
  categories: string[];
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

async function compressDemoImage(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("ไม่สามารถเตรียมรูปภาพได้");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("ไม่สามารถบีบอัดรูปภาพได้")),
        "image/jpeg",
        0.82,
      );
    });
    return new File([blob], "demo-evidence.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

function sampleImage(jobId: string) {
  const number = ([...jobId].reduce((total, character) => total + character.charCodeAt(0), 0) % 4) + 1;
  return `/demo/evidence/maintenance-${number}.svg`;
}

function categoryLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("air-condition")) return "เครื่องปรับอากาศ";
  if (normalized.includes("barth") || normalized.includes("bath")) return "ห้องน้ำ";
  if (normalized.includes("door")) return "ประตู";
  if (normalized.includes("internet")) return "อินเทอร์เน็ต / ทีวี";
  if (normalized.includes("ligth") || normalized.includes("light")) return "แสงสว่าง";
  if (normalized.includes("wall") || normalized.includes("paint")) return "ผนัง / งานสี";
  if (normalized.includes("water leask")) return "น้ำรั่ว";
  if (normalized.includes("hot water")) return "น้ำร้อน / น้ำเย็น";
  if (normalized.startsWith("pm")) return "Preventive Maintenance";
  if (normalized.includes("orther") || normalized.includes("other")) return "อาการอื่นๆ";
  return value;
}

export default function DemoClient() {
  const [jobs, setJobs] = useState(INITIAL_JOBS);
  const [rooms, setRooms] = useState(["306", "315", "402", "420", "501", "520", "601", "620"]);
  const [categories, setCategories] = useState<string[]>([]);
  const [inventory, setInventory] = useState<DemoInventory[]>([]);
  const [maintenance, setMaintenance] = useState<DemoMaintenance[]>([]);
  const [serviceState, setServiceState] = useState<"loading" | "connected" | "fallback">("loading");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mutatingJob, setMutatingJob] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("all");
  const [query, setQuery] = useState("");
  const [roomQuery, setRoomQuery] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    room: "",
    priority: "medium" as DemoJob["priority"],
    category: "",
    image: null as File | null,
  });

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const selectImage = (file: File | null) => {
    if (file && (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)) {
      setActionError("กรุณาเลือกรูปภาพขนาดไม่เกิน 20 MB");
      return;
    }
    setActionError("");
    setImagePreview(file ? URL.createObjectURL(file) : "");
    setDraft((current) => ({ ...current, image: file }));
  };

  const applySnapshot = (snapshot: DemoSnapshot) => {
    setJobs(snapshot.jobs);
    setRooms(snapshot.rooms);
    setCategories(snapshot.categories);
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
      const matchesRoom = selectedRoom === null || job.room === selectedRoom;
      const matchesCategory = selectedCategory === null || job.category === selectedCategory;
      const matchesQuery =
        !normalized ||
        `${job.id} ${job.title} ${job.room} ${job.technician}`
          .toLowerCase()
          .includes(normalized);
      return matchesStatus && matchesRoom && matchesCategory && matchesQuery;
    });
  }, [filter, jobs, query, selectedCategory, selectedRoom]);

  const roomOptions = useMemo(() => {
    const labels = new Set([
      ...rooms.filter((room) => room !== "1900"),
      ...jobs.map((job) => job.room).filter(Boolean),
    ]);
    return [...labels]
      .sort((left, right) => left.localeCompare(right, "th", { numeric: true }))
      .map((room) => ({
        room,
        total: jobs.filter((job) => job.room === room).length,
        open: jobs.filter(
          (job) => job.room === room && ["pending", "in_progress", "waiting_sparepart"].includes(job.status),
        ).length,
      }));
  }, [jobs, rooms]);

  const matchingRooms = useMemo(() => {
    const normalized = roomQuery.trim().toLocaleLowerCase("th");
    return roomOptions.filter((item) => !normalized || item.room.toLocaleLowerCase("th").includes(normalized));
  }, [roomOptions, roomQuery]);

  const selectedRoomSummary = selectedRoom
    ? roomOptions.find((item) => item.room === selectedRoom)
    : null;

  const categoryOptions = useMemo(
    () => categories.map((category) => ({
      category,
      total: jobs.filter((job) => job.category === category).length,
    })),
    [categories, jobs],
  );

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
      const body = new FormData();
      body.append("title", draft.title);
      body.append("room", draft.room);
      body.append("priority", draft.priority);
      body.append("category", draft.category);
      if (draft.image) body.append("image", await compressDemoImage(draft.image));
      const response = await fetch("/api/demo/", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Unable to create demo job");
      setJobs((current) => [result, ...current]);
      setSelectedRoom(result.room);
      setRoomQuery(result.room);
      setSelectedCategory(result.category || null);
      selectImage(null);
      setDraft({ title: "", room: "", priority: "medium", category: "", image: null });
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
      setSelectedRoom(null);
      setRoomQuery("");
      setSelectedCategory(null);
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
              <div className="mb-4 rounded-2xl border border-teal-200 bg-teal-50/60 p-3 sm:p-4">
                <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-100 text-teal-700"><BedDouble className="h-5 w-5" /></span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">ค้นหางานตามห้อง</h3>
                      <p className="text-xs text-slate-500">เลือกห้องเพื่อแสดงเฉพาะงานในห้องนั้น</p>
                    </div>
                  </div>
                  {selectedRoomSummary ? (
                    <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-teal-200">
                      <span className="font-semibold text-teal-800">ห้อง/พื้นที่ {selectedRoomSummary.room}</span>
                      <span className="text-slate-500">{selectedRoomSummary.total} งาน · เปิด {selectedRoomSummary.open}</span>
                      <button type="button" onClick={() => { setSelectedRoom(null); setRoomQuery(""); }} className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="แสดงทุกห้อง"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-teal-700" />
                  <Input
                    value={roomQuery}
                    onChange={(event) => {
                      setRoomQuery(event.target.value);
                      if (event.target.value !== selectedRoom) setSelectedRoom(null);
                    }}
                    placeholder="พิมพ์เลขห้องหรือชื่อพื้นที่ เช่น 306, Lobby"
                    className="border-teal-200 bg-white pl-9 pr-10 focus-visible:ring-teal-500"
                    role="combobox"
                    aria-label="ค้นหาห้องเพื่อดูรายการงาน"
                    aria-expanded="true"
                  />
                  {roomQuery ? <button type="button" onClick={() => { setRoomQuery(""); setSelectedRoom(null); }} className="absolute right-2 top-1.5 grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100" aria-label="ล้างคำค้นหาห้อง"><X className="h-3.5 w-3.5" /></button> : null}
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="รายการห้อง">
                  <button
                    type="button"
                    onClick={() => { setSelectedRoom(null); setRoomQuery(""); }}
                    className={`whitespace-nowrap rounded-xl border px-3 py-2 text-left text-xs transition ${selectedRoom === null ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300"}`}
                  >
                    <span className="block font-semibold">ทุกห้อง</span>
                    <span className={selectedRoom === null ? "text-teal-50" : "text-slate-400"}>{jobs.length} งาน</span>
                  </button>
                  {matchingRooms.map((item) => (
                    <button
                      key={item.room}
                      type="button"
                      role="option"
                      aria-selected={selectedRoom === item.room}
                      onClick={() => { setSelectedRoom(item.room); setRoomQuery(item.room); }}
                      className={`min-w-24 whitespace-nowrap rounded-xl border px-3 py-2 text-left text-xs transition ${selectedRoom === item.room ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"}`}
                    >
                      <span className="block font-semibold">{item.room}</span>
                      <span className={selectedRoom === item.room ? "text-teal-50" : "text-slate-400"}>{item.total} งาน · เปิด {item.open}</span>
                    </button>
                  ))}
                  {matchingRooms.length === 0 ? <p className="py-3 text-xs text-slate-500">ไม่พบห้องที่ค้นหา</p> : null}
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
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1" aria-label="กรองงานตามหมวดหมู่">
                <span className="whitespace-nowrap text-xs font-semibold text-slate-500">Category:</span>
                <button type="button" onClick={() => setSelectedCategory(null)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${selectedCategory === null ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}>ทั้งหมด</button>
                {categoryOptions.map((item) => (
                  <button
                    key={item.category}
                    type="button"
                    onClick={() => setSelectedCategory(item.category)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${selectedCategory === item.category ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"}`}
                  >
                    {categoryLabel(item.category)} <span className="opacity-70">({item.total})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {visibleJobs.map((job) => (
                <article key={job.id} className="p-4 transition hover:bg-slate-50 sm:p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:w-28">
                      <Image
                        src={job.images?.[0]?.image_url || sampleImage(job.id)}
                        alt={`รูปก่อนดำเนินงาน ${job.title}`}
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="(max-width: 639px) 100vw, 112px"
                      />
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-slate-950/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">BEFORE</span>
                    </div>
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-teal-700">{job.id}</span>
                        <StatusBadge status={job.status} size="sm" />
                        <PriorityBadge priority={job.priority} size="sm" />
                        {job.category ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{categoryLabel(job.category)}</span> : null}
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
              {visibleJobs.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">{selectedRoom ? `ห้อง/พื้นที่ ${selectedRoom} ไม่มีงานที่ตรงกับตัวกรอง` : "ไม่พบงานที่ตรงกับตัวกรอง"}</p> : null}
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
              <label className="block space-y-1.5 text-sm font-medium">
                Category
                <select
                  required
                  value={draft.category}
                  onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">เลือกหมวดหมู่งาน</option>
                  {categories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
                </select>
              </label>
              <p className="text-sm text-slate-500">ระบบ Demo จะมอบหมายงานให้ช่างตัวอย่างโดยอัตโนมัติ</p>
              <div className="space-y-2">
                <p className="text-sm font-medium">รูปก่อนดำเนินงาน</p>
                {imagePreview ? (
                  <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <Image src={imagePreview} alt="ตัวอย่างรูปงาน" fill unoptimized className="object-cover" />
                    <button type="button" onClick={() => selectImage(null)} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-rose-700 shadow" aria-label="ลบรูปภาพ"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50/50 p-4 text-center text-sm font-medium text-teal-800 hover:bg-teal-50">
                    <ImagePlus className="mb-2 h-6 w-6" />
                    เลือกรูปภาพหรือถ่ายภาพ
                    <span className="mt-1 text-xs font-normal text-slate-500">JPEG, PNG หรือ WebP · ระบบจะบีบอัดก่อนอัปโหลด</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => selectImage(event.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
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
