"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, ImagePlus, Loader2, MapPin, Plus, Tag, X } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useDemo } from "../DemoProvider";
import { compressDemoImage, validateDemoImage } from "../image";
import { categoryLabel, floorOf, type DemoPriority, type DemoStatus } from "../types";

type FormState = {
  title: string; status: DemoStatus; priority: DemoPriority; locationType: "room" | "area";
  floor: string; room: string; area: string; category: string; remarks: string;
  isDefective: boolean; isPm: boolean; beforeImage: File | null; afterImage: File | null;
};

const initial: FormState = { title: "", status: "pending", priority: "medium", locationType: "room", floor: "", room: "", area: "", category: "", remarks: "", isDefective: true, isPm: false, beforeImage: null, afterImage: null };

function EvidencePicker({ label, file, required, onChange }: { label: string; file: File | null; required?: boolean; onChange: (file: File | null) => void }) {
  const preview = file ? URL.createObjectURL(file) : "";
  return <div className="space-y-2"><p className="text-sm font-semibold">{label}{required ? <span className="text-rose-600"> *</span> : null}</p>{file ? <div className="relative aspect-video overflow-hidden rounded-xl border bg-slate-100"><Image src={preview} alt="Evidence preview" fill unoptimized className="object-cover" onLoad={() => URL.revokeObjectURL(preview)} /><button type="button" onClick={() => onChange(null)} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white text-rose-700 shadow"><X className="h-4 w-4" /></button></div> : <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50/50 p-4 text-center text-sm font-semibold text-teal-800 hover:bg-teal-50"><ImagePlus className="mb-2 h-7 w-7" />Choose photo or use camera<span className="mt-1 text-xs font-normal text-slate-500">JPEG, PNG, WebP · compressed automatically</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => onChange(event.target.files?.[0] || null)} /></label>}</div>;
}

export default function DemoCreateJobClient() {
  const router = useRouter();
  const { snapshot, loading, createJob } = useDemo();
  const [form, setForm] = useState<FormState>(initial);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const floors = useMemo(() => [...new Set((snapshot?.rooms || []).filter((room) => room !== "1900").map(floorOf))].sort(), [snapshot]);
  const roomOptions = (snapshot?.rooms || []).filter((room) => room !== "1900" && (!form.floor || floorOf(room) === form.floor));
  const categoryOptions = (snapshot?.categories || []).filter((category) => categoryLabel(category).toLowerCase().includes(categoryQuery.toLowerCase()));
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    const imageError = validateDemoImage(form.beforeImage); if (imageError) { setError(imageError); return; }
    if (!form.title.trim() || !form.category || (form.locationType === "room" ? !form.room : !form.area)) { setError("กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบ"); return; }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("title", form.title.trim()); body.set("status", form.status); body.set("priority", form.priority); body.set("category", form.category); body.set("remarks", form.remarks.trim());
      body.set(form.locationType, form.locationType === "room" ? form.room : form.area);
      body.set("is_defective", String(form.isDefective)); body.set("is_preventive_maintenance", String(form.isPm));
      body.set("before_image", await compressDemoImage(form.beforeImage!));
      if (form.status === "completed" && form.afterImage) body.set("after_image", await compressDemoImage(form.afterImage));
      const job = await createJob(body);
      router.push(`/demo/my-jobs/?created=${encodeURIComponent(job.id)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create job"); }
    finally { setSubmitting(false); }
  };

  const completion = [Boolean(form.title.trim()), Boolean(form.locationType === "room" ? form.room : form.area), Boolean(form.category), Boolean(form.beforeImage)].filter(Boolean).length;
  return <form onSubmit={submit} className="space-y-6">
    <section><p className="text-sm font-semibold text-teal-700">Maintenance Jobs</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Create maintenance job</h1><p className="mt-1 text-sm text-slate-600">Fill in all 4 steps: Status & Priority, Location, Job Details, then Evidence.</p></section>
    {error ? <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div> : null}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-5 flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><ClipboardList className="h-5 w-5" /></span><div><h2 className="font-semibold">1. Job Information</h2><p className="text-sm text-slate-500">Describe the issue and choose how the team should handle it.</p></div></div><label className="block space-y-2 text-sm font-semibold">Job Description *<textarea value={form.title} onChange={(event) => update("title", event.target.value)} className="min-h-28 w-full rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" placeholder="Describe the maintenance job in detail…" maxLength={160} /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-semibold">Status<select value={form.status} onChange={(event) => update("status", event.target.value as DemoStatus)} className="h-11 w-full rounded-lg border bg-white px-3 font-normal"><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select></label><label className="space-y-2 text-sm font-semibold">Priority<select value={form.priority} onChange={(event) => update("priority", event.target.value as DemoPriority)} className="h-11 w-full rounded-lg border bg-white px-3 font-normal"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label></div></section>
        <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-5 flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><MapPin className="h-5 w-5" /></span><div><h2 className="font-semibold">2. Location</h2><p className="text-sm text-slate-500">Choose either a room or an area within the active property.</p></div></div><div className="mb-4 grid grid-cols-2 gap-2">{(["room", "area"] as const).map((value) => <button key={value} type="button" onClick={() => update("locationType", value)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${form.locationType === value ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200"}`}>{value === "room" ? "Floor & Room" : "Area / Zone"}</button>)}</div>{form.locationType === "room" ? <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-semibold">Floor *<select value={form.floor} onChange={(event) => { update("floor", event.target.value); update("room", ""); }} className="h-11 w-full rounded-lg border bg-white px-3 font-normal"><option value="">Select floor</option>{floors.map((floor) => <option key={floor} value={floor}>Floor {floor}</option>)}</select></label><label className="space-y-2 text-sm font-semibold">Room Number *<select value={form.room} onChange={(event) => update("room", event.target.value)} className="h-11 w-full rounded-lg border bg-white px-3 font-normal" disabled={!form.floor}><option value="">Select room</option>{roomOptions.map((room) => <option key={room} value={room}>{room}</option>)}</select></label></div> : <label className="block space-y-2 text-sm font-semibold">Area / Zone *<select value={form.area} onChange={(event) => update("area", event.target.value)} className="h-11 w-full rounded-lg border bg-white px-3 font-normal"><option value="">Select area</option>{snapshot?.areas.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>}</section>
        <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-5 flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Tag className="h-5 w-5" /></span><div><h2 className="font-semibold">3. Category & Additional Details</h2><p className="text-sm text-slate-500">Choose one maintenance category and add instructions.</p></div></div><Input value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Search categories…" /><div className="mt-3 flex flex-wrap gap-2">{categoryOptions.map((category) => <button type="button" key={category} onClick={() => update("category", category)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${form.category === category ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 hover:bg-violet-50"}`}>{categoryLabel(category)}</button>)}</div><label className="mt-5 block space-y-2 text-sm font-semibold">Remarks<textarea value={form.remarks} onChange={(event) => update("remarks", event.target.value)} className="min-h-24 w-full rounded-lg border p-3 font-normal" placeholder="Additional remarks or special instructions…" maxLength={1000} /></label><div className="mt-4 flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.isDefective} onChange={(event) => update("isDefective", event.target.checked)} />Defect / corrective job</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.isPm} onChange={(event) => update("isPm", event.target.checked)} />Preventive Maintenance</label></div></section>
        <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-5 flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ImagePlus className="h-5 w-5" /></span><div><h2 className="font-semibold">4. Evidence</h2><p className="text-sm text-slate-500">Take photos or choose images before submitting.</p></div></div><div className="grid gap-5 md:grid-cols-2"><EvidencePicker label="Before Photo / Evidence" file={form.beforeImage} required onChange={(file) => update("beforeImage", file)} />{form.status === "completed" ? <EvidencePicker label="After Photo / Evidence" file={form.afterImage} onChange={(file) => update("afterImage", file)} /> : <div className="grid min-h-32 place-items-center rounded-xl border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-500">After evidence becomes available when Status is Completed.</div>}</div></section>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start"><section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Maintenance job summary</h2><p className="mt-1 text-sm text-slate-500">Review before creating the job.</p><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Property</span><span className="max-w-44 text-right font-medium">{snapshot?.property.name || "—"}</span></div><div className="flex justify-between"><span className="text-slate-500">Location</span><span className="font-medium">{form.locationType === "room" ? form.room || "—" : form.area || "—"}</span></div><div className="flex justify-between"><span className="text-slate-500">Category</span><span className="font-medium">{form.category ? categoryLabel(form.category) : "—"}</span></div><div className="flex justify-between"><span className="text-slate-500">Assigned to</span><span className="font-medium">Demo technician</span></div><div className="flex justify-between"><span className="text-slate-500">Before photos</span><span className="font-medium">{form.beforeImage ? 1 : 0}</span></div></div></section><section className="rounded-xl border bg-slate-900 p-5 text-white"><div className="mb-3 flex justify-between text-sm"><span>Progress</span><span>{completion}/4 steps</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${completion * 25}%` }} /></div><Button type="submit" className="mt-5 w-full" disabled={submitting || loading}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create maintenance job</Button>{completion === 4 ? <p className="mt-3 flex items-center justify-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Ready to create</p> : null}</section></aside>
    </div>
  </form>;
}
