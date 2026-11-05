"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ImagePlus, Loader2, MessageSquare, Play, Send, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { PriorityBadge } from "@/app/components/PriorityBadge";
import { StatusBadge } from "@/app/components/StatusBadge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useDemo } from "../../DemoProvider";
import { compressDemoImage } from "../../image";
import { categoryLabel, displayDate } from "../../types";

export default function DemoJobDetailClient() {
  const { jobId } = useParams<{ jobId: string }>();
  const { snapshot, loading, updateStatus, addComment } = useDemo();
  const job = snapshot?.jobs.find((item) => item.id === jobId);
  const [comment, setComment] = useState("");
  const [afterImage, setAfterImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const beforeImages = useMemo(() => job?.images.filter((image) => image.image_type === "before") || [], [job]);
  const afterImages = useMemo(() => job?.images.filter((image) => image.image_type === "after") || [], [job]);

  if (loading && !job) return <div className="flex items-center gap-2 rounded-xl border bg-white p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading job detail…</div>;
  if (!job) return <div className="rounded-xl border bg-white p-10 text-center"><h1 className="text-xl font-semibold">Job not found</h1><Button className="mt-5" asChild><Link href="/demo/jobs/">Back to Jobs</Link></Button></div>;

  const transition = job.status === "pending" ? "in_progress" : job.status === "in_progress" ? "completed" : null;
  const changeStatus = async () => { if (!transition) return; setBusy(true); setError(""); try { const evidence = transition === "completed" && afterImage ? await compressDemoImage(afterImage) : null; await updateStatus(job.id, transition, evidence); setAfterImage(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update job"); } finally { setBusy(false); } };
  const submitComment = async (event: React.FormEvent) => { event.preventDefault(); if (comment.trim().length < 2) return; setBusy(true); setError(""); try { await addComment(job.id, comment.trim()); setComment(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add comment"); } finally { setBusy(false); } };

  return <div className="space-y-6">
    <div><Button variant="ghost" size="sm" asChild className="mb-3"><Link href="/demo/jobs/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Jobs</Link></Button><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold text-teal-700">{job.id}</span><StatusBadge status={job.status} /><PriorityBadge priority={job.priority} /></div><h1 className="mt-3 text-2xl font-bold sm:text-3xl">{job.title}</h1><p className="mt-1 text-sm text-slate-500">Created {displayDate(job.created)} · Updated {displayDate(job.updated)}</p></div>{transition ? <Button onClick={() => void changeStatus()} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : transition === "in_progress" ? <Play className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{transition === "in_progress" ? "Start Job" : "Complete Job"}</Button> : null}</div></div>
    {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : null}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6"><section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Job Information</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase text-slate-400">Location</p><p className="mt-1 font-medium">{job.room}</p></div><div><p className="text-xs font-semibold uppercase text-slate-400">Category</p><p className="mt-1 font-medium">{categoryLabel(job.category)}</p></div><div><p className="text-xs font-semibold uppercase text-slate-400">Assigned technician</p><p className="mt-1 font-medium">{job.technician}</p></div><div><p className="text-xs font-semibold uppercase text-slate-400">Job type</p><p className="mt-1 font-medium">{job.is_preventive_maintenance ? "Preventive Maintenance" : job.is_defective ? "Defect / Corrective" : "Work Order"}</p></div>{job.remarks ? <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase text-slate-400">Remarks</p><p className="mt-1 text-sm leading-6">{job.remarks}</p></div> : null}</div></section>
        <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ImagePlus className="h-5 w-5 text-teal-600" /><h2 className="font-semibold">Before / After Evidence</h2></div><div className="mt-5 grid gap-5 md:grid-cols-2"><div><p className="mb-3 text-sm font-semibold">Before ({beforeImages.length})</p><div className="grid gap-3">{beforeImages.map((image) => <div key={image.id} className="relative aspect-video overflow-hidden rounded-xl bg-slate-100"><Image src={image.image_url} alt="Before evidence" fill unoptimized className="object-cover" /></div>)}</div></div><div><p className="mb-3 text-sm font-semibold">After ({afterImages.length})</p><div className="grid gap-3">{afterImages.map((image) => <div key={image.id} className="relative aspect-video overflow-hidden rounded-xl bg-slate-100"><Image src={image.image_url} alt="After evidence" fill unoptimized className="object-cover" /></div>)}{afterImages.length === 0 ? <div className="grid aspect-video place-items-center rounded-xl border border-dashed bg-slate-50 text-sm text-slate-500">No after evidence yet</div> : null}</div></div></div>{job.status === "in_progress" ? <label className="mt-5 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50 p-4 text-sm font-semibold text-teal-800"><ImagePlus className="mr-2 h-5 w-5" />{afterImage ? afterImage.name : "Add optional after evidence before closing"}<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => setAfterImage(event.target.files?.[0] || null)} /></label> : null}</section>
      </div>
      <aside><section className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-blue-600" /><h2 className="font-semibold">Comments</h2></div><div className="mt-5 max-h-[480px] space-y-4 overflow-y-auto">{job.comments.length ? job.comments.map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-2 text-xs"><span className="font-semibold text-slate-700">{item.author}</span><span className="text-slate-400">{displayDate(item.created)}</span></div><p className="mt-2 text-sm leading-5">{item.comment}</p></div>) : <p className="py-6 text-center text-sm text-slate-500">No comments yet</p>}</div><form onSubmit={submitComment} className="mt-5 flex gap-2"><Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment…" maxLength={500} /><Button type="submit" size="icon" disabled={busy || comment.trim().length < 2}><Send className="h-4 w-4" /></Button></form></section><section className="mt-4 rounded-xl bg-slate-900 p-5 text-white"><Wrench className="h-6 w-6 text-teal-300" /><h2 className="mt-3 font-semibold">Production-style workflow</h2><p className="mt-2 text-sm text-slate-300">ทดลองเปิดงาน เริ่มงาน แนบหลักฐานหลังซ่อม ปิดงาน และบันทึก Comment โดยไม่ต้อง Login</p></section></aside>
    </div>
  </div>;
}
