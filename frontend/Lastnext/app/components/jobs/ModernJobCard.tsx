"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Job, JobStatus, Property } from "@/app/lib/types";
import { Calendar, MapPin, CheckCircle2, Clock, AlertCircle, AlertTriangle, ClipboardList } from "lucide-react";
import { createImageUrl } from "@/app/lib/utils/image-utils";

type ViewMode = "grid" | "list";

interface ModernJobCardProps {
  job: Job;
  properties?: Property[];
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

export default function ModernJobCard({ job, viewMode = "grid" }: ModernJobCardProps) {
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
    // Limit to a maximum of 2 images for display
    return urls.slice(0, 2);
  }, [job.images, job.image_urls]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());

  const onError = useCallback((idx: number) => {
    setFailed(prev => new Set(prev).add(idx));
    if (idx === activeIdx) {
      const next = imageUrls.findIndex((_, i) => i !== idx && !failed.has(i));
      if (next !== -1) setActiveIdx(next);
    }
  }, [activeIdx, imageUrls, failed]);

  const status = getStatusConfig(job.status);
  const createdAt = useMemo(() => {
    try {
      return new Date(job.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return "Unknown";
    }
  }, [job.created_at]);

  const goToDetail = useCallback(() => {
    router.push(`/dashboard/jobs/${job.job_id}`);
  }, [router, job.job_id]);

  return (
    <Card className={"group overflow-hidden bg-white shadow hover:shadow-md transition-all duration-200"} onClick={goToDetail}>
      <div className="relative">
        <div className={viewMode === "list" ? "h-40 w-full" : "aspect-video w-full"}>
          {imageUrls.length > 0 && imageUrls[activeIdx] && !failed.has(activeIdx) ? (
            <Image
              src={imageUrls[activeIdx]}
              alt={"Job image"}
              fill
              className="object-cover"
              unoptimized
              onError={() => onError(activeIdx)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100"></div>
          )}
        </div>

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <Badge variant="secondary" className={`px-2 py-0.5 text-xs ${status.color}`}>{status.icon}<span className="ml-1 hidden xs:inline">{status.label}</span></Badge>
          {job.is_preventivemaintenance && (
            <Badge className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700">PM</Badge>
          )}
        </div>

        {imageUrls.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/35 backdrop-blur-sm px-2 py-1 rounded-full">
            {imageUrls.map((_, i) => (
              <button key={i} className={`w-1.5 h-1.5 rounded-full ${i === activeIdx ? "bg-white" : "bg-white/60"}`} onClick={(e) => { e.stopPropagation(); setActiveIdx(i); }} aria-label={`Show image ${i+1}`} />
            ))}
          </div>
        )}
      </div>

      <CardHeader className="p-3 sm:p-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm sm:text-base font-semibold text-gray-900 line-clamp-2">
              {job.topics?.[0]?.title || "No Topic"}
            </CardTitle>
            <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              <span className="truncate">
                {job.rooms && job.rooms.length > 0 ? (job.rooms[0].name || "Unknown") : "N/A"}
              </span>
            </div>
          </div>
          <span className="text-[11px] text-gray-500 flex-shrink-0">ID #{String(job.job_id).slice(0, 8)}</span>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 space-y-3">
        <p className="text-xs sm:text-sm text-gray-700 leading-relaxed line-clamp-3">
          {job.description || "No description provided"}
        </p>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="px-2 py-0.5">
            {job.priority?.charAt(0).toUpperCase() + job.priority?.slice(1) || "Medium"}
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>{createdAt}</span>
          </Badge>
          {job.is_defective && (
            <Badge variant="destructive" className="px-2 py-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Defective</span>
            </Badge>
          )}
        </div>

        <div className="pt-1">
          <Button variant="outline" size="sm" className="w-full h-8 sm:h-9 text-xs sm:text-sm">View details</Button>
        </div>
      </CardContent>
    </Card>
  );
}

