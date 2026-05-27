"use client";

import React, { useMemo, useState, useCallback } from "react";
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

  const [activeIdx, setActiveIdx] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());

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
      className="group h-full w-full max-w-full cursor-pointer overflow-hidden rounded-[1.35rem] border border-white/80 bg-white/95 text-[var(--pcms-text)] shadow-[var(--pcms-shadow-card)] transition duration-200 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-[var(--pcms-shadow)] sm:rounded-[2rem]"
      onClick={goToDetail}
    >
      <div className="relative p-1.5 sm:p-2.5">
        <div className={viewMode === "list" ? "relative h-56 w-full overflow-hidden rounded-[1.15rem] bg-[var(--pcms-surface-soft)] sm:rounded-[1.55rem]" : "relative aspect-square w-full overflow-hidden rounded-[1.15rem] bg-[var(--pcms-surface-soft)] sm:aspect-[4/3] sm:rounded-[1.55rem]"}>
          {imageUrls.length > 0 && imageUrls[activeIdx] && !failed.has(activeIdx) ? (
            <Image
              src={imageUrls[activeIdx]}
              alt={job.topics?.[0]?.title || 'Before photo for maintenance job'}
              fill
              className="object-cover transition duration-500 group-hover:scale-105"
              onError={() => onError(activeIdx)}
              unoptimized={isExternalImageUrl(imageUrls[activeIdx])}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-cyan-50 via-blue-50 to-teal-50 text-cyan-700">
              <div className="grid place-items-center gap-2 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-3xl bg-white/80 shadow-[var(--pcms-shadow-sm)]">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.18em]">Before Photo</span>
              </div>
            </div>
          )}

          <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5 sm:left-3 sm:top-3 sm:gap-2">
            <StatusBadge status={job.status} />
            {job.is_preventivemaintenance && (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-700">PM</span>
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

      <div className="space-y-2 px-2.5 pb-3 pt-1 sm:space-y-3 sm:px-4 sm:pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--pcms-primary-strong)] sm:gap-2 sm:text-xs sm:tracking-[0.12em]">
              <span>#{job.job_id}</span>
              <span className="h-1 w-1 rounded-full bg-cyan-300" />
              <span>{formatDate(job.created_at)}</span>
            </div>
            <h2 className="line-clamp-2 text-sm font-black leading-tight tracking-[-0.02em] text-[var(--pcms-text)] sm:text-base">
              {job.topics?.[0]?.title || "Maintenance Job"}
            </h2>
          </div>
        </div>

        <p className="line-clamp-2 text-xs font-medium leading-relaxed text-[var(--pcms-text-muted)] sm:line-clamp-3 sm:text-sm">
          {job.description || "No description provided. Add maintenance notes for the technician and Chief Engineer."}
        </p>

        <div className="grid gap-1.5 rounded-[1rem] border border-[var(--pcms-border)] bg-[var(--pcms-surface-soft)] p-2 text-[11px] font-bold text-[var(--pcms-text-muted)] sm:gap-2 sm:rounded-[1.35rem] sm:p-3 sm:text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
            <span className="truncate">Room / Area: {job.rooms?.[0]?.name || "Not assigned"}</span>
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
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--pcms-accent-gradient)] px-5 py-2.5 text-sm font-black text-white shadow-[var(--pcms-button-shadow)] transition-transform touch-manipulation active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 max-sm:w-full sm:min-h-0 sm:px-4 sm:py-2 sm:text-xs"
            onClick={(e) => { e.stopPropagation(); goToDetail(); }}
          >
            View
          </button>
        </div>
      </div>
    </article>
  );
}

