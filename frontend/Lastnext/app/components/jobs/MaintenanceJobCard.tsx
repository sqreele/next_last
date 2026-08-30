"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AirVent,
  Armchair,
  ArrowRight,
  Bath,
  CalendarDays,
  CircleEllipsis,
  ClipboardCheck,
  DoorOpen,
  Droplets,
  Fan,
  Flame,
  ImageIcon,
  Layers3,
  Lightbulb,
  LockKeyhole,
  MapPin,
  PaintRoller,
  Snowflake,
  Sparkles,
  Thermometer,
  UserRound,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Job } from "@/app/lib/types";
import { cn } from "@/app/lib/utils/cn";
import { getDisplayName } from "@/app/lib/utils/display-name";
import { createImageUrl } from "@/app/lib/utils/image-utils";
import { StatusBadge } from "@/app/components/StatusBadge";
import { PriorityBadge } from "@/app/components/PriorityBadge";

type ViewMode = "grid" | "list";

interface MaintenanceJobCardProps {
  job: Job;
  viewMode?: ViewMode;
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

function getLocation(job: Job): string {
  return (
    job.area?.name ||
    job.area_name ||
    job.rooms?.[0]?.name ||
    job.room_name ||
    "Unassigned location"
  );
}

function getAssignee(job: Job): string {
  return getDisplayName(
    job.user,
    job.technician_name ||
      job.user_name ||
      job.created_by_name ||
      "Unassigned technician",
  );
}

function getProblemSummary(job: Job): string {
  return job.description?.trim() || job.title?.trim() || "Maintenance job";
}

function getJobImageUrl(job: Job): string | null {
  const imageRecord = Array.isArray(job.images)
    ? job.images.find((image) => image?.jpeg_url || image?.image_url)
    : null;
  const rawUrl =
    imageRecord?.jpeg_url ||
    imageRecord?.image_url ||
    (Array.isArray(job.image_urls) ? job.image_urls[0] : null);

  return rawUrl ? createImageUrl(rawUrl) : null;
}

const TOPIC_ICONS: Record<number, { icon: LucideIcon; label: string }> = {
  1: { icon: Snowflake, label: "Air conditioning" },
  2: { icon: Bath, label: "Bathroom" },
  3: { icon: PaintRoller, label: "Wall and repaint" },
  4: { icon: DoorOpen, label: "Door" },
  5: { icon: Lightbulb, label: "Lighting" },
  6: { icon: Wifi, label: "Internet and TV" },
  7: { icon: Flame, label: "Water and hot water" },
  8: { icon: Droplets, label: "Water leaks" },
  9: { icon: CircleEllipsis, label: "Other maintenance" },
  10: { icon: Armchair, label: "Furniture" },
  11: { icon: Sparkles, label: "Cleaning PM" },
  12: { icon: LockKeyhole, label: "Window lock" },
  13: { icon: ClipboardCheck, label: "PM rooms" },
  14: { icon: Thermometer, label: "Temperature check" },
  15: { icon: AirVent, label: "Air filter cleaning" },
  16: { icon: Fan, label: "FCU cleaning" },
  17: { icon: Layers3, label: "Stainless floor trim" },
};

function getTopicIcon(job: Job): { icon: LucideIcon; label: string } {
  const topic = job.topics?.[0];
  if (topic && TOPIC_ICONS[Number(topic.id)]) {
    return TOPIC_ICONS[Number(topic.id)];
  }

  const value = [
    topic?.title,
    job.category,
    job.title,
    job.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const nameFallbacks: Array<{
    terms: string[];
    icon: LucideIcon;
    label: string;
  }> = [
    { terms: ["air-condition", "air condition", "แอร์", "fcu"], icon: Snowflake, label: "Air conditioning" },
    { terms: ["barth", "bath", "toilet", "ห้องน้ำ", "ชักโครก"], icon: Bath, label: "Bathroom" },
    { terms: ["temperature", "อุณหภูมิ"], icon: Thermometer, label: "Temperature check" },
    { terms: ["door", "ประตู"], icon: DoorOpen, label: "Door" },
    { terms: ["furniture", "เฟอร์นิเจอร์"], icon: Armchair, label: "Furniture" },
    { terms: ["internet", "wifi", "tv", "อินเตอร์เน็ต"], icon: Wifi, label: "Internet and TV" },
    { terms: ["light", "lighting", "ไฟ", "แสงสว่าง"], icon: Lightbulb, label: "Lighting" },
    { terms: ["repaint", "paint", "wall", "ceiling", "ผนัง", "งานสี", "ฝ้า"], icon: PaintRoller, label: "Wall and repaint" },
    { terms: ["leak", "น้ำรั่ว"], icon: Droplets, label: "Water leaks" },
    { terms: ["hot water", "น้ำร้อน"], icon: Flame, label: "Water and hot water" },
    { terms: ["window", "หน้าต่าง"], icon: LockKeyhole, label: "Window lock" },
    { terms: ["clean", "ทำความสะอาด", "ล้าง"], icon: Sparkles, label: "Cleaning PM" },
  ];

  const fallback = nameFallbacks.find(({ terms }) =>
    terms.some((term) => value.includes(term)),
  );
  return fallback || { icon: Wrench, label: "General maintenance" };
}

export default function MaintenanceJobCard({
  job,
  viewMode = "grid",
}: MaintenanceJobCardProps) {
  const detailHref = job.property_id
    ? `/dashboard/jobs/${encodeURIComponent(job.job_id)}?property_id=${encodeURIComponent(String(job.property_id))}`
    : `/dashboard/jobs/${encodeURIComponent(job.job_id)}`;
  const imageUrl = useMemo(() => getJobImageUrl(job), [job]);
  const [imageFailed, setImageFailed] = useState(false);
  const { icon: JobTypeIcon, label: jobTypeLabel } = getTopicIcon(job);

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none",
        viewMode === "list" && "sm:min-h-0",
      )}
    >
      <Link
        href={detailHref}
        className="flex h-full min-h-0 flex-col focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open maintenance job ${job.job_id}`}
      >
        <div className="job-card-image relative h-28 w-full overflow-hidden border-b border-border bg-muted sm:h-44">
          {imageUrl && !imageFailed ? (
            <Image
              src={imageUrl}
              alt={`Maintenance job at ${getLocation(job)}`}
              fill
              loading="lazy"
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transform-none"
              onError={() => setImageFailed(true)}
              unoptimized={
                imageUrl.startsWith("http") || imageUrl.includes("/media/")
              }
            />
          ) : (
            <div className="grid h-full place-items-center bg-gradient-to-br from-muted to-background text-muted-foreground">
              <span className="job-card-photo-label flex flex-col items-center gap-2 text-center text-sm">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-xs">
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>No job photo</span>
              </span>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5 sm:gap-2 sm:p-3">
            <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-bold text-slate-800 shadow-xs backdrop-blur-sm sm:px-2.5 sm:text-xs">
              <MapPin className="h-3 w-3 flex-none text-slate-500" />
              <span className="truncate">{getLocation(job)}</span>
            </span>
            <span className="max-w-[52%] flex-none truncate rounded-md bg-white/90 px-1.5 py-1 text-[9px] font-semibold text-slate-800 shadow-xs backdrop-blur-sm sm:max-w-none sm:px-2.5 sm:text-xs">
              Job #{job.job_id || "New"}
            </span>
          </div>
        </div>

        <div className="job-card-content flex flex-1 flex-col p-3 sm:p-5">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="job-card-location flex min-w-0 items-center gap-1 text-sm font-bold text-foreground sm:gap-1.5 sm:text-base">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{getLocation(job)}</span>
              </div>
              <p className="job-card-id mt-0.5 truncate text-[10px] text-muted-foreground sm:text-xs">
                Job #{job.job_id || "New"}
              </p>
            </div>
            <span
              className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-md bg-muted text-muted-foreground"
              role="img"
              aria-label={jobTypeLabel}
              title={jobTypeLabel}
            >
              <JobTypeIcon className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>

          <h2 className="job-card-title mt-2 line-clamp-2 text-sm font-black leading-5 text-card-foreground sm:text-lg sm:leading-7">
            {getProblemSummary(job)}
          </h2>

          <div className="job-card-status mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} size="sm" />
            <PriorityBadge priority={job.priority} size="sm" />
          </div>

          <dl className="job-card-meta mt-3 grid grid-cols-1 gap-1.5 text-[11px] text-foreground sm:mt-4 sm:gap-2 sm:text-sm">
            <div className="flex min-w-0 items-center gap-1.5">
              <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
              <dt className="sr-only">Assigned technician</dt>
              <dd className="truncate">{getAssignee(job)}</dd>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
              <dt className="sr-only">Created time</dt>
              <dd className="truncate">
                {formatDate(job.created_at)}
              </dd>
            </div>
          </dl>

          <div className="job-card-footer mt-auto pt-3 sm:pt-4">
            <span className="hidden truncate text-xs text-muted-foreground sm:block">
              Updated {formatDate(job.updated_at)}
            </span>
            <span className="job-card-action mt-1 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold uppercase text-blue-900 shadow-xs transition-colors group-hover:bg-blue-100 sm:min-h-11 sm:text-sm">
              View details
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
