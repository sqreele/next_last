"use client";

import React, { useMemo, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Job, JobStatus } from "@/app/lib/types";
import { createImageUrl } from "@/app/lib/utils/image-utils";
import { Badge } from "@/app/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, AlertTriangle, ClipboardList, ImageOff } from "lucide-react";

type ViewMode = "grid" | "list";

interface InstagramJobCardProps {
  job: Job;
  viewMode?: ViewMode;
}

function getStatusConfig(status: JobStatus) {
  const configs = {
    completed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "bg-green-100 text-green-700", label: "Completed" },
    in_progress: { icon: <Clock className="w-3.5 h-3.5" />, color: "bg-blue-100 text-blue-700", label: "In Progress" },
    pending: { icon: <AlertCircle className="w-3.5 h-3.5" />, color: "bg-yellow-100 text-yellow-700", label: "Pending" },
    cancelled: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "bg-red-100 text-red-700", label: "Cancelled" },
    waiting_sparepart: { icon: <ClipboardList className="w-3.5 h-3.5" />, color: "bg-purple-100 text-purple-700", label: "Waiting Sparepart" },
  } as const;
  return (configs as any)[status] || configs.pending;
}

export default function InstagramJobCard({ job, viewMode = "grid" }: InstagramJobCardProps) {
  const router = useRouter();

  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    if (Array.isArray(job.images)) {
      for (const img of job.images) {
        if (img?.image_url) {
          const u = createImageUrl(img.image_url);
          if (u) urls.push(u);
        }
      }
    }
    if (Array.isArray(job.image_urls)) {
      for (const url of job.image_urls) {
        const u = createImageUrl(url);
        if (u && !urls.includes(u)) urls.push(u);
      }
    }
    return urls;
  }, [job.images, job.image_urls]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(Math.max(0, (job.id % 37) + 5));

  const onError = useCallback((idx: number) => {
    setFailed(prev => new Set(prev).add(idx));
    if (idx === activeIdx) {
      const next = imageUrls.findIndex((_, i) => i !== idx && !failed.has(i));
      if (next !== -1) setActiveIdx(next);
    }
  }, [activeIdx, imageUrls, failed]);

  const toggleLike = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setLiked((prev: boolean) => {
      const next = !prev;
      setLikesCount((count: number) => count + (next ? 1 : -1));
      return next;
    });
  }, []);

  const goToDetail = useCallback(() => {
    router.push(`/dashboard/jobs/${job.job_id}`);
  }, [router, job.job_id]);

  const status = getStatusConfig(job.status);

  return (
    <div className="rounded-md shadow-md bg-white text-gray-900 overflow-hidden cursor-pointer" onClick={goToDetail}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/favicon.ico" alt="property" className="w-8 h-8 rounded-full bg-gray-100" />
          <div className="-space-y-0.5 min-w-0">
            <h2 className="text-sm font-semibold leading-none truncate">{job.topics?.[0]?.title || "Job"}</h2>
            <span className="inline-block text-xs text-gray-500 truncate">{job.rooms?.[0]?.name || "N/A"}</span>
          </div>
        </div>
        <Badge variant="secondary" className={`px-2 py-0.5 text-xs ${status.color}`}>{status.icon}<span className="ml-1 hidden xs:inline">{status.label}</span></Badge>
      </div>

      {/* Image */}
      <div className={viewMode === "list" ? "h-60 w-full relative" : "relative aspect-square w-full bg-gray-50"}>
        {imageUrls.length > 0 && imageUrls[activeIdx] && !failed.has(activeIdx) ? (
          <Image src={imageUrls[activeIdx]} alt="job" fill className="object-cover" unoptimized onError={() => onError(activeIdx)} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100"><ImageOff className="w-6 h-6 text-gray-400" /></div>
        )}

        {imageUrls.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/30 px-2 py-1 rounded-full">
            {imageUrls.map((_: string, i: number) => (
              <button key={i} className={`w-1.5 h-1.5 rounded-full ${i === activeIdx ? "bg-white" : "bg-white/60"}`} onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setActiveIdx(i); }} aria-label={`Show image ${i+1}`} />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" title="Like" className="flex items-center justify-center" onClick={toggleLike}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className={`w-5 h-5 ${liked ? "fill-red-500" : "fill-current"}`}>
                <path d="M453.122,79.012a128,128,0,0,0-181.087.068l-15.511,15.7L241.142,79.114l-.1-.1a128,128,0,0,0-181.02,0l-6.91,6.91a128,128,0,0,0,0,181.019L235.485,449.314l20.595,21.578.491-.492.533.533L276.4,450.574,460.032,266.94a128.147,128.147,0,0,0,0-181.019ZM437.4,244.313,256.571,425.146,75.738,244.313a96,96,0,0,1,0-135.764l6.911-6.91a96,96,0,0,1,135.713-.051l38.093,38.787,38.274-38.736a96,96,0,0,1,135.765,0l6.91,6.909A96.11,96.11,0,0,1,437.4,244.313Z"></path>
              </svg>
            </button>
            <button type="button" title="Comment" className="flex items-center justify-center" onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-5 h-5 fill-current">
                <path d="M496,496H480a273.39,273.39,0,0,1-179.025-66.782l-16.827-14.584C274.814,415.542,265.376,416,256,416c-63.527,0-123.385-20.431-168.548-57.529C41.375,320.623,16,270.025,16,216S41.375,111.377,87.452,73.529C132.615,36.431,192.473,16,256,16S379.385,36.431,424.548,73.529C470.625,111.377,496,161.975,496,216a171.161,171.161,0,0,1-21.077,82.151,201.505,201.505,0,0,1-47.065,57.537,285.22,285.22,0,0,0,63.455,97L496,457.373ZM294.456,381.222l27.477,23.814a241.379,241.379,0,0,0,135,57.86,317.5,317.5,0,0,1-62.617-105.583v0l-4.395-12.463,9.209-7.068C440.963,305.678,464,262.429,464,216c0-92.636-93.309-168-208-168S48,123.364,48,216s93.309,168,208,168a259.114,259.114,0,0,0,31.4-1.913Z"></path>
              </svg>
            </button>
            <button type="button" title="Share" className="flex items-center justify-center" onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-5 h-5 fill-current">
                <path d="M474.444,19.857a20.336,20.336,0,0,0-21.592-2.781L33.737,213.8v38.066l176.037,70.414L322.69,496h38.074l120.3-455.4A20.342,20.342,0,0,0,474.444,19.857ZM337.257,459.693,240.2,310.37,389.553,146.788l-23.631-21.576L215.4,290.069,70.257,232.012,443.7,56.72Z"></path>
              </svg>
            </button>
          </div>
          <button type="button" title="Bookmark" className="flex items-center justify-center" onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-5 h-5 fill-current">
              <path d="M424,496H388.75L256.008,381.19,123.467,496H88V16H424ZM120,48V456.667l135.992-117.8L392,456.5V48Z"></path>
            </svg>
          </button>
        </div>

        {/* Likes row */}
        <div className="flex items-center gap-2 pt-3 pb-1">
          <div className="flex -space-x-1">
            <img alt="" className="w-5 h-5 border rounded-full bg-gray-200 border-gray-300" src="/favicon.ico" />
            <img alt="" className="w-5 h-5 border rounded-full bg-gray-200 border-gray-300" src="/favicon.ico" />
            <img alt="" className="w-5 h-5 border rounded-full bg-gray-200 border-gray-300" src="/favicon.ico" />
          </div>
          <span className="text-sm">Liked by <span className="font-semibold">Staff</span> and <span className="font-semibold">{likesCount} others</span></span>
        </div>

        {/* Caption and input */}
        <div className="space-y-3">
          <p className="text-sm">
            <span className="text-base font-semibold">{job.topics?.[0]?.title || "External_"}</span> {job.description || "No description"}
          </p>
          <input type="text" placeholder="Add a comment..." className="w-full py-1 bg-transparent border-none rounded text-sm pl-0 outline-none" onClick={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()} />
        </div>
      </div>
    </div>
  );
}

