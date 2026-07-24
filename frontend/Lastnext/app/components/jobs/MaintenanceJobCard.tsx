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
        "group h-full rounded-xl border border-border bg-card shadow-soft transition-colors duration-150 hover:border-foreground/25 motion-reduce:transition-none",
        viewMode === "list" && "sm:min-h-0",
      )}
    >
      <Link
        href={detailHref}
        className="flex h-full min-h-64 flex-col overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open maintenance job ${job.job_id}`}
      >
        <div className="relative h-36 w-full border-b border-border bg-muted">
          {imageUrl && !imageFailed ? (
            <Image
              src={imageUrl}
              alt={`Maintenance job at ${getLocation(job)}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 360px"
              className="object-cover"
              onError={() => setImageFailed(true)}
              unoptimized={imageUrl.startsWith("http")}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              <span className="flex items-center gap-2 text-sm">
                <ImageIcon className="h-5 w-5" aria-hidden="true" />
                No job photo
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{getLocation(job)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Job #{job.job_id || "New"}
              </p>
            </div>
            <PriorityBadge priority={job.priority || job.urgency} />
          </div>

          <h2 className="mt-4 line-clamp-2 text-base font-semibold leading-6 text-card-foreground">
            {getProblemSummary(job)}
          </h2>

          <div className="mt-3">
            <StatusBadge status={job.status} size="sm" />
          </div>

          <dl className="mt-5 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-2">
              <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
              <dt className="sr-only">Assigned technician</dt>
              <dd className="truncate">{getAssignee(job)}</dd>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
              <dt className="sr-only">Created time</dt>
              <dd className="truncate">Created {formatDate(job.created_at)}</dd>
            </div>
          </dl>

          <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              Updated {formatDate(job.updated_at)}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
              View job
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
