"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useDemoLanguage } from "./DemoLanguageProvider";
import { validateDemoImage } from "./image";

export default function EvidencePicker({ label, files, required, max = 5, disabled, onChange }: {
  label: string; files: File[]; required?: boolean; max?: number; disabled?: boolean; onChange: (files: File[]) => void;
}) {
  const { language, text } = useDemoLanguage();
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  const add = (selected: FileList | null) => {
    if (!selected) return;
    const incoming = Array.from(selected);
    if (files.length + incoming.length > max) { setError(text(`เลือกได้อีก ${Math.max(0, max - files.length)} รูป (รวมก่อน/หลังไม่เกิน 5 รูป)`, `Choose up to ${Math.max(0, max - files.length)} more photos (5 total before/after).`)); return; }
    for (const file of incoming) {
      const reason = validateDemoImage(file, language);
      if (reason) { setError(reason); return; }
    }
    setError(""); onChange([...files, ...incoming]);
  };
  return <div className="space-y-3"><div className="flex justify-between gap-2 text-sm font-semibold"><span>{label}{required && <span className="text-rose-600"> *</span>}</span><span className="shrink-0 text-teal-700">{files.length}/{max}</span></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{files.map((file, index) => <figure key={`${file.name}-${file.lastModified}-${index}`} className="min-w-0"><div className="relative aspect-square overflow-hidden rounded-xl border bg-slate-50">{previews[index] && <Image src={previews[index]} alt={text(`ตัวอย่างรูปที่ ${index + 1}`, `Photo ${index + 1} preview`)} fill unoptimized className="object-contain" />}<button type="button" disabled={disabled} onClick={() => { setError(""); onChange(files.filter((_, i) => i !== index)); }} aria-label={text(`ลบรูปที่ ${index + 1}`, `Remove photo ${index + 1}`)} className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-rose-700 shadow"><X className="h-4 w-4" /></button><span className="absolute bottom-1 left-1 rounded bg-slate-900/75 px-2 py-1 text-xs text-white">{index + 1}</span></div><figcaption className="mt-1 truncate text-xs text-slate-500">{file.name}</figcaption></figure>)}</div>
    <label className={`flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm font-semibold ${disabled || files.length >= max ? "cursor-not-allowed bg-slate-50 text-slate-400" : "cursor-pointer border-teal-300 bg-teal-50/50 text-teal-800 hover:bg-teal-50"}`}><ImagePlus className="mb-2 h-6 w-6" />{text("เพิ่มรูป / เลือกหลายรูป", "Add photos / select multiple")}<span className="mt-1 text-xs font-normal">JPEG, PNG, WebP · {text("บีบอัดอัตโนมัติ", "Auto-compressed")}</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled || files.length >= max} className="sr-only" onChange={(event) => { add(event.target.files); event.target.value = ""; }} /></label>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}
