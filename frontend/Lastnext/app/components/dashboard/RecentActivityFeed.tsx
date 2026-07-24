"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Hammer,
  Timer,
  ArrowRight,
  Activity,
  LucideIcon,
} from "lucide-react";
import { Job } from "@/app/lib/types";
import { cn } from "@/app/lib/utils/cn";
import {
  normalizeStatus,
  PriorityBadge,
  StatusBadge,
} from "@/app/components/pcms-ui";
import { getDisplayName } from "@/app/lib/utils/display-name";

type ActivityKind =
  "created" | "completed" | "in_progress" | "blocked" | "overdue" | "updated";

interface ActivityRow {
  key: string;
  kind: ActivityKind;
  job: Job;
  timestamp: number;
  label: string;
  icon: LucideIcon;
  toneRing: string;
  toneIcon: string;
}

function getJobRoom(job: Job): string {
  return job.room_name || job.rooms?.[0]?.name || "Unassigned";
}

function getJobTitle(job: Job): string {
  return job.topics?.[0]?.title || job.title || "Maintenance job";
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "soon";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(ts);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function categorize(job: Job): { kind: ActivityKind; timestamp: number } {
  const status = normalizeStatus(job.status);
  const created = new Date(job.created_at).getTime();
  const updated = job.updated_at ? new Date(job.updated_at).getTime() : created;
  const completed = job.completed_at ? new Date(job.completed_at).getTime() : 0;

  if (status === "completed" || status === "verified") {
    return { kind: "completed", timestamp: completed || updated };
  }
  if (
    status === "waiting_sparepart" ||
    status === "waiting_vendor" ||
    status === "waiting_fix_defect"
  ) {
    return { kind: "blocked", timestamp: updated };
  }
  if (status === "in_progress") {
    return { kind: "in_progress", timestamp: updated };
  }
  // Job aged > 3 days without completion = overdue surface
  const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  if (ageDays >= 3 && status !== "cancelled") {
    return { kind: "overdue", timestamp: updated };
  }
  if (updated > created + 5 * 60 * 1000) {
    return { kind: "updated", timestamp: updated };
  }
  return { kind: "created", timestamp: created };
}

const KIND_META: Record<
  ActivityKind,
  {
    icon: LucideIcon;
    label: (job: Job) => string;
    toneRing: string;
    toneIcon: string;
  }
> = {
  created: {
    icon: Plus,
    label: () => "New job created",
    toneRing: "ring-blue-200",
    toneIcon: "bg-blue-600 text-white",
  },
  in_progress: {
    icon: Hammer,
    label: (job) => `Work started by ${getDisplayName(job.user, "technician")}`,
    toneRing: "ring-amber-200",
    toneIcon: "bg-amber-500 text-white",
  },
  blocked: {
    icon: Timer,
    label: () => "Blocked — waiting on parts or vendor",
    toneRing: "ring-orange-200",
    toneIcon: "bg-orange-500 text-white",
  },
  completed: {
    icon: CheckCircle2,
    label: (job) => `Completed by ${getDisplayName(job.user, "technician")}`,
    toneRing: "ring-emerald-200",
    toneIcon: "bg-emerald-600 text-white",
  },
  overdue: {
    icon: AlertTriangle,
    label: () => "Pending more than 3 days — needs follow-up",
    toneRing: "ring-rose-200",
    toneIcon: "bg-rose-600 text-white",
  },
  updated: {
    icon: Clock,
    label: () => "Status updated",
    toneRing: "ring-slate-200",
    toneIcon: "bg-slate-700 text-white",
  },
};

const FILTERS: Array<{ value: ActivityKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "created", label: "New" },
  { value: "in_progress", label: "Active" },
  { value: "completed", label: "Done" },
  { value: "blocked", label: "Blocked" },
  { value: "overdue", label: "Overdue" },
];

interface RecentActivityFeedProps {
  jobs: Job[];
  limit?: number;
  className?: string;
  /** Suppress the header/card chrome when embedding in an existing card. */
  inline?: boolean;
}

export function RecentActivityFeed({
  jobs,
  limit = 12,
  className,
  inline = false,
}: RecentActivityFeedProps) {
  const [filter, setFilter] = React.useState<ActivityKind | "all">("all");

  const activity = useMemo<ActivityRow[]>(() => {
    return jobs
      .map((job) => {
        const { kind, timestamp } = categorize(job);
        const meta = KIND_META[kind];
        return {
          key: `${job.job_id || job.id}-${kind}-${timestamp}`,
          kind,
          job,
          timestamp,
          label: meta.label(job),
          icon: meta.icon,
          toneRing: meta.toneRing,
          toneIcon: meta.toneIcon,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [jobs]);

  const filtered = useMemo(() => {
    const slice =
      filter === "all"
        ? activity
        : activity.filter((row) => row.kind === filter);
    return slice.slice(0, limit);
  }, [activity, filter, limit]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: activity.length };
    for (const row of activity) {
      map[row.kind] = (map[row.kind] || 0) + 1;
    }
    return map;
  }, [activity]);

  const content = (
    <>
      <div
        role="tablist"
        aria-label="Activity filter"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2"
      >
        {FILTERS.map((opt) => {
          const active = filter === opt.value;
          const count = counts[opt.value] || 0;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(opt.value)}
              className={cn(
                "inline-flex flex-none items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {opt.label}
              <span
                className={cn(
                  "min-w-[1.25rem] rounded-full px-1.5 text-[10px] font-bold leading-4",
                  active
                    ? "bg-card/15 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm font-medium text-muted-foreground">
          No matching activity yet.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {filtered.map((row) => {
            const Icon = row.icon;
            const jobLink = `/dashboard/jobs/${row.job.job_id}`;
            return (
              <li key={row.key}>
                <Link
                  href={jobLink}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border border-transparent p-3 hover:bg-muted hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-full ring-4",
                      row.toneIcon,
                      row.toneRing,
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-foreground line-clamp-1">
                        {getJobTitle(row.job)}
                      </p>
                      <span className="flex-none text-[11px] font-semibold text-muted-foreground">
                        {relativeTime(row.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground line-clamp-1">
                      #{row.job.job_id} · {getJobRoom(row.job)} · {row.label}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <StatusBadge size="sm" status={row.job.status} />
                      <PriorityBadge
                        priority={row.job.priority || row.job.urgency}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );

  if (inline) {
    return <div className={className}>{content}</div>;
  }

  return (
    <section
      aria-label="Recent activity"
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground sm:text-lg">
              Recent activity
            </h2>
            <p className="text-xs font-medium text-muted-foreground">
              Latest changes across your maintenance work.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/jobs"
          className="hidden items-center gap-1 text-xs font-bold text-blue-700 hover:underline sm:inline-flex"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {content}
    </section>
  );
}
