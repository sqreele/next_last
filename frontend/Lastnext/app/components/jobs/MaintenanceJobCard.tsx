"use client";

import React, { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Copy,
  ExternalLink,
  ImageIcon,
  MapPin,
  MoreHorizontal,
} from "lucide-react";
import type { Job, JobPriority, Topic } from "@/app/lib/types";
import { cn } from "@/app/lib/utils/cn";
import { createImageUrl } from "@/app/lib/utils/image-utils";
import { getDisplayName } from "@/app/lib/utils/display-name";
import { StatusBadge } from "@/app/components/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

type ViewMode = "grid" | "list";
type PriorityKey = JobPriority | "urgent" | string | null | undefined;

interface MaintenanceJobCardProps {
  job: Job;
  viewMode?: ViewMode;
}

interface ToneStyle {
  label: string;
  header: string;
  icon: string;
  badge: string;
}

const PRIORITY_STYLES: Record<string, ToneStyle> = {
  urgent: {
    label: "Urgent",
    header: "bg-rose-50 text-rose-950",
    icon: "bg-white text-rose-600 ring-rose-100",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
  },
  high: {
    label: "High",
    header: "bg-orange-50 text-orange-950",
    icon: "bg-white text-orange-600 ring-orange-100",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
  },
  medium: {
    label: "Medium",
    header: "bg-sky-50 text-sky-950",
    icon: "bg-white text-sky-600 ring-sky-100",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
  },
  low: {
    label: "Low",
    header: "bg-emerald-50 text-emerald-950",
    icon: "bg-white text-emerald-600 ring-emerald-100",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

const TYPE_BADGE = "border-slate-200 bg-white text-slate-700";

const isExternalImageUrl = (url: string) => /^https?:\/\//i.test(url) || url.startsWith("/media/");

function getPriorityStyle(priority: PriorityKey): ToneStyle {
  return PRIORITY_STYLES[String(priority || "medium").toLowerCase()] || PRIORITY_STYLES.medium;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "Not set";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Not set";

  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);

  if (diffInDays === 0) return "Today";
  if (diffInDays === 1) return "Yesterday";
  if (diffInDays > 1 && diffInDays < 7) return `${diffInDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getImageUrl(job: Job): string | null {
  const firstImage = Array.isArray(job.images) ? job.images.find((image) => image?.jpeg_url || image?.image_url) : null;
  const raw = firstImage?.jpeg_url || firstImage?.image_url || (Array.isArray(job.image_urls) ? job.image_urls[0] : null);
  return raw ? createImageUrl(raw) : null;
}

function getTopicTitle(topic: Topic | undefined): string | null {
  const title = topic?.title?.trim();
  return title ? title : null;
}

function getPrimaryPlace(job: Job): string {
  return job.area?.name || job.area_name || job.rooms?.[0]?.name || job.room_name || "Unassigned location";
}

function getAssignee(job: Job): string {
  return getDisplayName(
    job.user,
    job.technician_name || job.user_name || job.created_by_name || "Unassigned technician",
  );
}

function getTypeBadges(job: Job): string[] {
  const badges = ["Work Order"];
  if (job.is_defective) badges.push("Defect");
  if (job.is_preventivemaintenance) badges.push("PM");
  return badges;
}

function InfoRow({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-h-[28px] items-center rounded-full border px-2.5 py-1 text-xs font-bold leading-none", className)}>
      {children}
    </span>
  );
}

export default function MaintenanceJobCard({ job, viewMode = "grid" }: MaintenanceJobCardProps) {
  const router = useRouter();
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const priorityStyle = getPriorityStyle(job.priority || job.urgency);
  const imageUrl = useMemo(() => getImageUrl(job), [job]);
  const topics = Array.isArray(job.topics) ? job.topics.filter((topic) => getTopicTitle(topic)) : [];
  const visibleTopics = topics.slice(0, 3);
  const extraTopicCount = Math.max(0, topics.length - visibleTopics.length);
  const assignee = getAssignee(job);
  const detailHref = `/dashboard/jobs/${job.job_id}`;

  const goToDetail = useCallback(() => {
    router.push(detailHref);
  }, [router, detailHref]);

  const onMenuAction = useCallback((event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <article
      className={cn(
        "group flex h-full min-h-[430px] w-full cursor-pointer flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.07)] transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_44px_rgba(15,23,42,0.12)] focus-within:ring-2 focus-within:ring-slate-900 focus-within:ring-offset-2",
        viewMode === "list" && "min-h-0 sm:grid sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]",
      )}
      onClick={goToDetail}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          goToDetail();
        }
      }}
      aria-label={`Open maintenance job ${job.job_id}`}
    >
      <header className={cn("relative overflow-hidden p-4", priorityStyle.header, viewMode === "list" && "sm:h-full")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl ring-1", priorityStyle.icon)}>
              {job.rooms?.length ? <Building2 className="h-5 w-5" aria-hidden="true" /> : <MapPin className="h-5 w-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-current">{getPrimaryPlace(job)}</p>
              <p className="mt-0.5 text-xs font-bold text-slate-500">Job #{job.job_id || "New"}</p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/85 text-slate-700 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                aria-label={`Open actions for job ${job.job_id}`}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-xl bg-white p-1 shadow-xl">
              <DropdownMenuItem
                className="min-h-10 rounded-lg font-semibold"
                onSelect={(event) => {
                  onMenuAction(event);
                  goToDetail();
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Job
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-10 rounded-lg font-semibold"
                onSelect={(event) => {
                  onMenuAction(event);
                  void navigator.clipboard?.writeText(String(job.job_id));
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/80 bg-white/60">
          {imageUrl && !imageFailed ? (
            <div className={cn("relative w-full", viewMode === "list" ? "h-40 sm:h-full" : "h-32")}>
              <div className={cn("absolute inset-0 bg-white/60 transition-opacity", imageLoaded ? "opacity-0" : "opacity-100")} aria-hidden="true" />
              <Image
                src={imageUrl}
                alt={`Maintenance job ${job.job_id} photo`}
                fill
                sizes={viewMode === "list" ? "(max-width: 768px) 100vw, 420px" : "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 360px"}
                className={cn("object-cover transition-opacity duration-300", imageLoaded ? "opacity-100" : "opacity-0")}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageFailed(true)}
                unoptimized={isExternalImageUrl(imageUrl)}
              />
            </div>
          ) : (
            <div className="grid h-24 place-items-center text-slate-500">
              <div className="flex items-center gap-2 text-xs font-bold">
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                No job photo
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex flex-wrap gap-1.5">
          {getTypeBadges(job).map((badge) => (
            <Pill key={badge} className={TYPE_BADGE}>{badge}</Pill>
          ))}
          <Pill className={priorityStyle.badge}>{priorityStyle.label}</Pill>
        </div>

        <div className="mt-3 min-w-0">
          <h2 className="line-clamp-2 text-base font-extrabold leading-snug text-slate-950">
            {job.description || job.title || "Maintenance job"}
          </h2>
          {job.remarks?.trim() && (
            <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-slate-500">
              {job.remarks}
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-2">
          <InfoRow icon={CalendarDays} label={`Created ${formatDate(job.created_at)}`} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={job.status} size="sm" />
          {visibleTopics.map((topic) => (
            <Pill key={topic.id} className="border-slate-200 bg-slate-50 text-slate-600">
              {getTopicTitle(topic)}
            </Pill>
          ))}
          {extraTopicCount > 0 && (
            <Pill className="border-slate-200 bg-slate-100 text-slate-600">+{extraTopicCount}</Pill>
          )}
        </div>

        <footer className="mt-auto flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs font-bold text-slate-500">
            <p className="truncate">{assignee}</p>
            <p className="mt-0.5 truncate text-slate-400">Updated {formatDate(job.updated_at)}</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 max-sm:w-full"
            onClick={(event) => {
              event.stopPropagation();
              goToDetail();
            }}
          >
            View Job
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </footer>
      </div>
    </article>
  );
}
