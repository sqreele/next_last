"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ImageIcon,
  MapPin,
  UserRound,
} from "lucide-react";
import type { Job } from "@/app/lib/types";
import { cn } from "@/app/lib/utils/cn";
import { getDisplayName } from "@/app/lib/utils/display-name";
import { createImageUrl } from "@/app/lib/utils/image-utils";
import { StatusBadge } from "@/app/components/StatusBadge";
import { PriorityBadge } from "@/app/components/pcms-ui";

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

export default function MaintenanceJobCard({
  job,
  viewMode = "grid",
}: MaintenanceJobCardProps) {
  const detailHref = `/dashboard/jobs/${job.job_id}`;
  const imageUrl = useMemo(() => getJobImageUrl(job), [job]);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-colors duration-150 hover:border-foreground/25 motion-reduce:transition-none",
        viewMode === "list" && "sm:min-h-0",
      )}
    >
      <Link
        href={detailHref}
        className="flex h-full min-h-0 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open maintenance job ${job.job_id}`}
      >
        <div className="job-card-image relative h-28 w-full border-b border-border bg-muted md:h-32 lg:h-36">
          {imageUrl && !imageFailed ? (
            <Image
              src={imageUrl}
              alt={`Maintenance job at ${getLocation(job)}`}
              fill
              sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 20vw"
              className="object-cover"
              onError={() => setImageFailed(true)}
              unoptimized={imageUrl.startsWith("http")}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              <span className="job-card-photo-label flex flex-col items-center gap-1 text-center text-xs md:flex-row md:gap-2 md:text-sm">
                <ImageIcon className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
                <span>No job photo</span>
              </span>
            </div>
          )}
        </div>

        <div className="job-card-content flex flex-1 flex-col p-3 md:p-4 lg:p-5">
          <div className="flex flex-col items-start gap-2 lg:flex-row lg:justify-between lg:gap-3">
            <div className="min-w-0">
              <div className="job-card-location flex items-center gap-1.5 text-xs font-medium text-foreground md:text-sm">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground md:h-4 md:w-4" aria-hidden="true" />
                <span className="truncate">{getLocation(job)}</span>
              </div>
              <p className="job-card-id mt-1 text-[11px] text-muted-foreground md:text-xs">
                Job #{job.job_id || "New"}
              </p>
            </div>
            <PriorityBadge priority={job.priority || job.urgency} />
          </div>

          <h2 className="job-card-title mt-3 line-clamp-2 text-sm font-semibold leading-5 text-card-foreground md:text-base md:leading-6">
            {getProblemSummary(job)}
          </h2>

          <div className="job-card-status mt-2.5 md:mt-3">
            <StatusBadge status={job.status} size="sm" />
          </div>

          <dl className="job-card-meta mt-3 grid gap-1.5 text-xs text-muted-foreground md:mt-4 md:gap-2 md:text-sm xl:grid-cols-2">
            <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
              <UserRound className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" aria-hidden="true" />
              <dt className="sr-only">Assigned technician</dt>
              <dd className="truncate">{getAssignee(job)}</dd>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" aria-hidden="true" />
              <dt className="sr-only">Created time</dt>
              <dd className="truncate">
                <span className="hidden md:inline">Created </span>
                {formatDate(job.created_at)}
              </dd>
            </div>
          </dl>

          <div className="job-card-footer mt-3 flex items-center justify-between gap-1 border-t border-border pt-3 md:mt-4 md:pt-4">
            <span className="hidden truncate text-xs text-muted-foreground md:block">
              Updated {formatDate(job.updated_at)}
            </span>
            <span className="job-card-action inline-flex items-center gap-1 text-xs font-semibold text-foreground md:ml-auto md:text-sm">
              View
              <span className="hidden md:inline"> job</span>
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none md:h-4 md:w-4"
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
