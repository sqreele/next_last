"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Job } from "@/app/lib/types";
import { createImageUrl } from "@/app/lib/utils/image-utils";
import { Clock, Calendar, MessageSquare, MapPin, ImageIcon, UserRound } from "lucide-react";
import { StatusBadge } from "@/app/components/pcms-ui";
import { getDisplayName } from "@/app/lib/utils/display-name";

type ViewMode = "grid" | "list";

interface InstagramJobCardProps {
  job: Job;
  viewMode?: ViewMode;
}

const isExternalImageUrl = (url: string) => /^https?:\/\//i.test(url) || url.startsWith('/media/');

export default function InstagramJobCard({ job, viewMode = "grid" }: InstagramJobCardProps) {
  const router = useRouter();

  // Function to format dates
  const formatDate = useCallback((dateString: string | null | undefined): string => {
    if (!dateString) return 'Not set';
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInMs = now.getTime() - date.getTime();
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
      
      if (diffInDays === 0) {
        return 'Today';
      } else if (diffInDays === 1) {
        return 'Yesterday';
      } else if (diffInDays < 7) {
        return `${diffInDays} days ago`;
      } else {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
      }
    } catch {
      return 'Invalid date';
    }
  }, []);

  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    if (Array.isArray(job.images)) {
      for (const img of job.images) {
        const rawUrl = (img && (img.jpeg_url || img.image_url)) || null;
        if (rawUrl) {
          const u = createImageUrl(rawUrl);
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

  const assignedTechnicianName = useMemo(() => {
    const fallbackName = "Chief Engineer review";
    const displayName = getDisplayName(job.user, job.technician_name || job.user_name || fallbackName);
    return displayName === fallbackName ? fallbackName : displayName.split(/\s+/)[0] || displayName;
  }, [job.user, job.technician_name, job.user_name]);

  const roomName = job.rooms?.[0]?.name || null;
  const areaName = job.area?.name || job.area_name || null;
  const locationLabel = areaName
    ? `${areaName}${roomName ? ` · Room ${roomName}` : ''}`
    : roomName
      ? `Room ${roomName}`
      : 'No Area';

  const [activeIdx, setActiveIdx] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
  }, [activeIdx, imageUrls]);

  const onError = useCallback((idx: number) => {
    setFailed(prev => new Set(prev).add(idx));
    if (idx === activeIdx) {
      const next = imageUrls.findIndex((_, i) => i !== idx && !failed.has(i));
      if (next !== -1) setActiveIdx(next);
    }
  }, [activeIdx, imageUrls, failed]);


  const goToDetail = useCallback(() => {
    router.push(`/dashboard/jobs/${job.job_id}`);
  }, [router, job.job_id]);



  return (
    <article
      className="group h-full w-full max-w-full cursor-pointer overflow-hidden rounded-[1.15rem] border border-[var(--pcms-border)] bg-white text-[var(--pcms-text)] shadow-[var(--pcms-shadow-card)] transition duration-200 hover:border-cyan-200 hover:shadow-[var(--pcms-shadow)] sm:rounded-[1.35rem]"
      onClick={goToDetail}
    >
      <div className="relative p-1 sm:p-1.5">
        <div className={viewMode === "list" ? "relative h-52 w-full overflow-hidden rounded-[0.95rem] bg-[var(--pcms-surface-soft)] sm:h-56 sm:rounded-[1.1rem]" : "relative aspect-[4/3] w-full overflow-hidden rounded-[0.95rem] bg-[var(--pcms-surface-soft)] sm:rounded-[1.1rem]"}>
          {imageUrls.length > 0 && imageUrls[activeIdx] && !failed.has(activeIdx) ? (
            <>
              <div
                className={`absolute inset-0 bg-slate-100 transition-opacity duration-300 ${imageLoaded ? "opacity-0" : "opacity-100"}`}
                aria-hidden="true"
              />
              <Image
                src={imageUrls[activeIdx]}
                alt={job.topics?.[0]?.title || 'Before photo for maintenance job'}
                fill
                sizes={viewMode === "list" ? "(max-width: 768px) 100vw, 780px" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"}
                className={`object-cover transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => onError(activeIdx)}
                unoptimized={isExternalImageUrl(imageUrls[activeIdx])}
              />
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-cyan-50 via-blue-50 to-teal-50 text-cyan-700">
              <div className="grid place-items-center gap-2 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/85 shadow-[var(--pcms-shadow-sm)]">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <span className="text-xs font-bold uppercase">Before Photo</span>
              </div>
            </div>
          )}

          <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5 sm:left-3 sm:top-3">
            <StatusBadge status={job.status} />
            {job.is_preventivemaintenance && (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700">PM</span>
            )}
          </div>

          {imageUrls.length > 1 && (
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-slate-950/35 px-1.5 py-0.5 backdrop-blur-sm">
              {imageUrls.map((_: string, i: number) => (
                <button
                  key={i}
                  type="button"
                  className="grid h-6 w-6 place-items-center rounded-full touch-manipulation"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setActiveIdx(i); }}
                  aria-label={`Show maintenance photo ${i + 1}`}
                  aria-pressed={i === activeIdx}
                >
                  <span className={`block h-1.5 rounded-full transition-all ${i === activeIdx ? "w-4 bg-white" : "w-1.5 bg-white/60"}`} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5 px-3 pb-3 pt-1.5 sm:px-4 sm:pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase text-[var(--pcms-primary-strong)] sm:gap-2 sm:text-xs">
              <span>#{job.job_id}</span>
              <span className="h-1 w-1 rounded-full bg-cyan-300" />
              <span>{formatDate(job.created_at)}</span>
            </div>
            <h2 className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--pcms-text)] sm:text-base">
              {job.topics?.[0]?.title || "Maintenance Job"}
            </h2>
          </div>
        </div>

        <p className="line-clamp-2 text-[13px] font-medium leading-6 text-[var(--pcms-text-muted)] sm:line-clamp-3 sm:text-sm">
          {job.description || "No description provided. Add maintenance notes for the technician and Chief Engineer."}
        </p>

        <div className="grid gap-1.5 rounded-[0.9rem] border border-[var(--pcms-border)] bg-[var(--pcms-surface-soft)] p-2.5 text-[11px] font-semibold text-[var(--pcms-text-muted)] sm:gap-2 sm:rounded-[1rem] sm:p-3 sm:text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
            <span className="truncate">Area / Room: {locationLabel}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span className="truncate">Technician: {assignedTechnicianName}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-orange-500" />
            <span className="truncate">Updated: {formatDate(job.updated_at)}</span>
          </div>
        </div>

        {job.remarks && job.remarks.trim() && (
          <div className="flex items-start gap-2 rounded-[1.25rem] bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">{job.remarks}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="hidden items-center gap-2 text-xs font-black text-[var(--pcms-text-soft)] sm:flex">
            <Calendar className="h-3.5 w-3.5" />
            <span>Created / updated info</span>
          </div>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--pcms-accent-gradient)] px-5 py-2.5 text-sm font-bold text-white shadow-[var(--pcms-button-shadow)] transition-transform touch-manipulation active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 max-sm:w-full sm:min-h-0 sm:px-4 sm:py-2 sm:text-xs"
            onClick={(e) => { e.stopPropagation(); goToDetail(); }}
          >
            View
          </button>
        </div>
      </div>
    </article>
  );
}
