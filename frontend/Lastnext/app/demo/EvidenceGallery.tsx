"use client";

import Image from "next/image";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { useDemoLanguage } from "./DemoLanguageProvider";

export default function EvidenceGallery({ images, label }: { images: Array<{ id: number | string; image_url: string }>; label: string }) {
  const { text } = useDemoLanguage();
  return <div><p className="mb-3 flex justify-between text-sm font-semibold"><span>{label}</span><span className="text-teal-700">{images.length} {text("รูป", "photos")}</span></p>
    {images.length ? <div className="grid grid-cols-2 gap-3">{images.map((image, index) => <Dialog key={image.id}><DialogTrigger asChild><button type="button" aria-label={`${label} ${index + 1} — ${text("ขยายรูป", "Enlarge photo")}`} className="group relative aspect-square overflow-hidden rounded-xl border bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600"><Image src={image.image_url} alt={`${label} ${index + 1}`} fill unoptimized className="object-contain transition group-hover:scale-105" /><span className="absolute bottom-2 left-2 rounded bg-slate-900/75 px-2 py-1 text-xs text-white">{index + 1} / {images.length}</span></button></DialogTrigger><DialogContent mobileFullscreen={false} className="max-w-4xl"><DialogTitle>{label} · {index + 1}/{images.length}</DialogTitle><div className="relative h-[65vh] w-full"><Image src={image.image_url} alt={`${label} ${index + 1}`} fill unoptimized sizes="90vw" className="object-contain" /></div></DialogContent></Dialog>)}</div> : <div className="grid min-h-40 place-items-center rounded-xl border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-500">{text("ยังไม่มีรูปหลักฐาน", "No evidence photos yet")}</div>}
  </div>;
}
