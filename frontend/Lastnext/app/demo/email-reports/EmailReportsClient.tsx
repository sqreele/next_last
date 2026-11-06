"use client";

import { useEffect, useState } from "react";
import { Download, Mail, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useDemoLanguage } from "../DemoLanguageProvider";

type Preview = { html: string; template: string; date: string; technicians: string[]; technician: string; job_count: number; preview_only: boolean };

export default function EmailReportsClient() {
  const { text } = useDemoLanguage();
  const [kind, setKind] = useState("daily");
  const [date, setDate] = useState("");
  const [technician, setTechnician] = useState("");
  const [mobile, setMobile] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const templates = [
    { key: "daily", title: text("สรุปรายวัน", "Daily summary"), description: text("งานที่สร้างในวันที่เลือก พร้อมยอดสะสมรายเดือน", "Jobs created on the selected date and monthly totals") },
    { key: "pending", title: text("งานที่ต้องติดตาม", "Pending jobs"), description: text("งานรอดำเนินการ กำลังซ่อม และรออะไหล่", "Pending, in-progress and waiting-for-parts jobs") },
    { key: "property", title: text("รายงานของที่พัก", "Property summary"), description: text("ภาพรวมงานของโรงแรม พร้อมห้องและหมวดหมู่", "Property workload, room totals and categories") },
    { key: "technician", title: text("งานของแต่ละคน", "Technician jobs"), description: text("งานของผู้รับผิดชอบที่เลือก", "Jobs for the selected assignee") },
  ];
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setPreview(null);
    const query = new URLSearchParams({ kind });
    if (date) query.set("date", date);
    if (kind === "technician" && technician) query.set("technician", technician);
    fetch(`/api/demo/email-preview/?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.detail || `HTTP ${response.status}`); return result as Preview; })
      .then((result) => { if (!controller.signal.aborted) setPreview(result); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load preview"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, date, technician, revision]);

  const download = () => {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([preview.html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `staymaint-demo-${kind}-${preview.date}.html`; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Email Reports</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">{text("ตัวอย่างอีเมลรายงาน", "Email report templates")}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">{text("ใช้ template เดียวกับอีเมลจริง โดยแสดงข้อมูลจากฐานข้อมูล Demo แยกเท่านั้น", "Uses the actual email templates with data exclusively from the isolated Demo database.")}</p></div><Button variant="outline" onClick={() => setRevision((value) => value + 1)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{text("รีเฟรช", "Refresh")}</Button></header>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{text("Preview สำหรับนำเสนอเท่านั้น ไม่มีการส่งอีเมลจริง เนื้อหา template ใช้ภาษาตามระบบส่งอีเมลปัจจุบัน", "Presentation preview only. No emails are sent. Template content retains the current production email language.")}</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{templates.map((template) => <button key={template.key} type="button" aria-pressed={kind === template.key} onClick={() => setKind(template.key)} className={`rounded-xl border p-4 text-left transition ${kind === template.key ? "border-teal-500 bg-teal-50 ring-1 ring-teal-500" : "border-slate-200 bg-white hover:border-teal-300"}`}><Mail className="mb-3 h-5 w-5 text-teal-700" /><span className="block font-semibold">{template.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{template.description}</span></button>)}</div>
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b p-4 sm:p-5"><div className="flex flex-wrap gap-4"><label className="text-xs font-semibold text-slate-500">{text("วันที่รายงาน (เวลาไทย)", "Report date (Bangkok)")}<input type="date" value={date || preview?.date || ""} onChange={(event) => setDate(event.target.value)} className="mt-2 block h-11 rounded-lg border bg-white px-3 text-sm text-slate-900" /></label>{kind === "technician" && <label className="text-xs font-semibold text-slate-500">{text("ผู้รับผิดชอบ", "Assignee")}<select value={technician || preview?.technician || ""} onChange={(event) => setTechnician(event.target.value)} disabled={loading} className="mt-2 block h-11 max-w-full rounded-lg border bg-white px-3 text-sm text-slate-900"><option value="">{text("เลือกผู้รับผิดชอบ", "Choose assignee")}</option>{preview?.technicians.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}</div><div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" aria-label={text("ตัวอย่าง Desktop", "Desktop preview")} aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label={text("ตัวอย่างโทรศัพท์", "Mobile preview")} aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone className="h-4 w-4" /></Button><Button variant="outline" onClick={download} disabled={loading || !preview}><Download className="mr-2 h-4 w-4" />HTML</Button></div></div>
      {preview && <div className="flex flex-wrap justify-between gap-2 border-b bg-slate-50 px-5 py-3 text-xs text-slate-500"><span>{text("แหล่ง template", "Template source")}: {preview.template}</span><span>{preview.job_count} {text("งานในรายงาน", "jobs in report")} · Demo</span></div>}
      {error ? <div role="alert" className="m-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}<Button variant="outline" className="ml-3" onClick={() => setRevision((value) => value + 1)}>{text("ลองใหม่", "Retry")}</Button></div> : loading ? <p role="status" className="p-12 text-center text-sm text-slate-500">{text("กำลังสร้างตัวอย่างอีเมล…", "Rendering email preview…")}</p> : preview && <div className="overflow-x-auto rounded-b-2xl bg-slate-100 p-2 sm:p-5"><iframe title={text("ตัวอย่างอีเมลจากข้อมูล Demo", "Email preview using Demo data")} sandbox="" srcDoc={preview.html} className="mx-auto block h-[760px] max-w-full rounded-lg border bg-white shadow-sm" style={{ width: mobile ? 390 : 760 }} /></div>}
    </section>
    <p className="text-xs text-slate-500">{text("Daily Summary ใช้วันที่เลือก ส่วนรายงานอื่นใช้ข้อมูล Demo ปัจจุบัน ข้อมูลรีเซ็ตทุก 45 นาที ลิงก์ใน preview ใช้เพื่อแสดงรูปแบบเท่านั้น", "Daily Summary uses the selected date. Other reports use the current Demo dataset, which resets every 45 minutes. Preview links are illustrative only.")}</p>
  </div>;
}
