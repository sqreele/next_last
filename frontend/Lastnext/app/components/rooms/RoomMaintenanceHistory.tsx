"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Wrench,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Job } from "@/app/lib/types";
import {
  StatusBadge,
  PriorityBadge,
  normalizeStatus,
} from "@/app/components/pcms-ui";
import { getDisplayName } from "@/app/lib/utils/display-name";
import { cn } from "@/app/lib/utils/cn";

interface RoomMaintenanceHistoryProps {
  jobs: Job[];
  className?: string;
}

type HistoryFilter = "all" | "pm" | "completed" | "open";

const FILTERS: Array<{ value: HistoryFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pm", label: "Preventive" },
  { value: "completed", label: "Completed" },
  { value: "open", label: "Open / In progress" },
];

function isOpen(job: Job) {
  const s = normalizeStatus(job.status);
  return s !== "completed" && s !== "verified" && s !== "cancelled";
}

function getTechnician(job: Job): string {
  return getDisplayName(
    job.user,
    job.technician_name || job.user_name || "Unknown technician",
  );
}

function getTitle(job: Job): string {
  return job.topics?.[0]?.title || job.title || "Maintenance job";
}

function ageInDays(a: string, b?: string | null) {
  if (!b) return null;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

export function RoomMaintenanceHistory({
  jobs,
  className,
}: RoomMaintenanceHistoryProps) {
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const stats = useMemo(() => {
    const total = jobs.length;
    const pm = jobs.filter((j) => j.is_preventivemaintenance).length;
    const completed = jobs.filter(
      (j) =>
        normalizeStatus(j.status) === "completed" ||
        normalizeStatus(j.status) === "verified",
    ).length;
    const open = jobs.filter((j) => isOpen(j)).length;
    const defects = jobs.filter((j) => j.is_defective).length;
    const responseTimes = jobs
      .filter(
        (j) => normalizeStatus(j.status) === "completed" && j.completed_at,
      )
      .map((j) => ageInDays(j.created_at, j.completed_at))
      .filter((d): d is number => d !== null);
    const avgResponse = responseTimes.length
      ? Math.round(
          responseTimes.reduce((s, d) => s + d, 0) / responseTimes.length,
        )
      : null;
    const lastServiceJob = [...jobs]
      .filter((j) => j.completed_at)
      .sort(
        (a, b) =>
          new Date(b.completed_at!).getTime() -
          new Date(a.completed_at!).getTime(),
      )[0];
    const lastService = lastServiceJob?.completed_at ?? null;

    // Group by year-month for spark chart
    const byMonth = new Map<string, number>();
    jobs.forEach((j) => {
      const d = new Date(j.created_at);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) || 0) + 1);
    });
    const monthEntries = Array.from(byMonth.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const monthMax = Math.max(1, ...monthEntries.map(([, v]) => v));

    return {
      total,
      pm,
      completed,
      open,
      defects,
      avgResponse,
      lastService,
      monthEntries,
      monthMax,
    };
  }, [jobs]);

  const filtered = useMemo(() => {
    const base = [...jobs].sort((a, b) => {
      const aTime = new Date(a.completed_at || a.created_at).getTime();
      const bTime = new Date(b.completed_at || b.created_at).getTime();
      return bTime - aTime;
    });
    switch (filter) {
      case "pm":
        return base.filter((j) => j.is_preventivemaintenance);
      case "completed":
        return base.filter(
          (j) =>
            normalizeStatus(j.status) === "completed" ||
            normalizeStatus(j.status) === "verified",
        );
      case "open":
        return base.filter((j) => isOpen(j));
      default:
        return base;
    }
  }, [jobs, filter]);

  return (
    <section className={cn("space-y-5", className)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={Activity}
          label="Total jobs"
          value={stats.total}
          tone="primary"
        />
        <StatTile
          icon={CheckCircle2}
          label="Completed"
          value={stats.completed}
          tone="success"
        />
        <StatTile
          icon={Clock}
          label="Open"
          value={stats.open}
          tone="warning"
          hint={stats.defects ? `${stats.defects} defects` : undefined}
        />
        <StatTile
          icon={Sparkles}
          label="Preventive"
          value={stats.pm}
          tone="info"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <CalendarCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Last serviced
              </p>
              <p className="text-sm font-bold text-foreground">
                {stats.lastService
                  ? new Date(stats.lastService).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "No completed jobs yet"}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-700">
              <Clock className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Avg. response
              </p>
              <p className="text-sm font-bold text-foreground">
                {stats.avgResponse !== null
                  ? `${stats.avgResponse} day${stats.avgResponse === 1 ? "" : "s"}`
                  : "Not enough data"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {stats.monthEntries.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">
              Jobs over time
            </h3>
            <span className="text-xs font-semibold text-muted-foreground">
              {stats.monthEntries.length} months
            </span>
          </div>
          <div className="flex h-24 items-end gap-1.5">
            {stats.monthEntries.map(([key, count]) => {
              const height = Math.max(
                6,
                Math.round((count / stats.monthMax) * 100),
              );
              const [year, month] = key.split("-");
              return (
                <div
                  key={key}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    className="w-full rounded-t-md bg-blue-500/80 transition-all hover:bg-blue-600"
                    style={{ height: `${height}%` }}
                    title={`${key}: ${count} jobs`}
                  />
                  <span className="text-[9px] font-semibold text-muted-foreground">
                    {new Date(
                      Number(year),
                      Number(month) - 1,
                    ).toLocaleDateString("en-US", { month: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground sm:text-lg">
              Maintenance history
            </h3>
            <p className="text-xs font-medium text-muted-foreground">
              Showing {filtered.length} of {stats.total} jobs, newest first.
            </p>
          </div>
          <div
            className="-mx-1 flex gap-1 overflow-x-auto px-1"
            role="tablist"
            aria-label="History filter"
          >
            {FILTERS.map((opt) => {
              const active = filter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "flex-none rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm font-medium text-muted-foreground">
            No jobs match this filter.
          </p>
        ) : (
          <ol className="relative space-y-3 before:absolute before:left-[1.125rem] before:top-1 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200">
            {filtered.map((job) => {
              const status = normalizeStatus(job.status);
              const ToneIcon = job.is_defective
                ? AlertTriangle
                : status === "completed" || status === "verified"
                  ? CheckCircle2
                  : status === "in_progress"
                    ? Wrench
                    : Clock;
              const toneClass = job.is_defective
                ? "bg-rose-600"
                : status === "completed" || status === "verified"
                  ? "bg-emerald-600"
                  : status === "in_progress"
                    ? "bg-amber-500"
                    : "bg-blue-600";
              const responseDays = ageInDays(job.created_at, job.completed_at);

              return (
                <li key={job.job_id} className="relative pl-12">
                  <span
                    className={cn(
                      "absolute left-2 top-1.5 grid h-9 w-9 place-items-center rounded-full text-white ring-4 ring-white shadow",
                      toneClass,
                    )}
                    aria-hidden="true"
                  >
                    <ToneIcon className="h-4 w-4" />
                  </span>
                  <Link
                    href={`/dashboard/jobs/${job.job_id}`}
                    className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-border hover:bg-muted"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground line-clamp-1">
                          {getTitle(job)}
                        </p>
                        <p className="text-xs font-semibold text-muted-foreground">
                          #{job.job_id} ·{" "}
                          {new Date(job.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                          {responseDays !== null && (
                            <> · resolved in {responseDays}d</>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge size="sm" status={job.status} />
                        {job.is_preventivemaintenance && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                            PM
                          </span>
                        )}
                      </div>
                    </div>
                    {job.description && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {job.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <PriorityBadge priority={job.priority} />
                      <span className="text-muted-foreground">
                        By {getTechnician(job)}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-blue-700 group-hover:underline">
                        Open <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

type StatTone = "primary" | "success" | "warning" | "info";

const TONE_STYLES: Record<StatTone, { card: string; icon: string }> = {
  primary: {
    card: "border-blue-200 bg-blue-50/40",
    icon: "bg-blue-600 text-white",
  },
  success: {
    card: "border-emerald-200 bg-emerald-50/40",
    icon: "bg-emerald-600 text-white",
  },
  warning: {
    card: "border-amber-200 bg-amber-50/40",
    icon: "bg-amber-500 text-white",
  },
  info: {
    card: "border-indigo-200 bg-indigo-50/40",
    icon: "bg-indigo-600 text-white",
  },
};

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  tone: StatTone;
  hint?: string;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-3 shadow-soft sm:p-4",
        styles.card,
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 place-items-center rounded-xl",
          styles.icon,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-black leading-none text-foreground sm:text-3xl">
        {value}
      </p>
      {hint ? (
        <p className="text-xs font-semibold text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
