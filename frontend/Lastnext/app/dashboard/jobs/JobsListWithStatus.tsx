"use client";

import React from "react";
import { useRouter } from "next/navigation";
import JobList from "@/app/components/jobs/jobList";
import { Job, Property, TabValue } from "@/app/lib/types";
import { cn } from "@/app/lib/utils/cn";

interface JobsListWithStatusProps {
  jobs: Job[];
  properties: Property[];
  initialFilter: TabValue;
}

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_sparepart", label: "Waiting parts" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "defect", label: "Defective" },
  { value: "preventive_maintenance", label: "Preventive" },
];

const matchesTab = (job: Job, value: TabValue) => {
  if (value === "all") return true;
  if (value === "defect") return job.is_defective === true;
  if (value === "preventive_maintenance") {
    return job.is_preventivemaintenance === true;
  }
  return job.status === value;
};

export function JobsListWithStatus({
  jobs,
  properties,
  initialFilter,
}: JobsListWithStatusProps) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<TabValue>(initialFilter);

  React.useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const tabCounts = React.useMemo(
    () =>
      Object.fromEntries(
        TABS.map((tab) => [
          tab.value,
          jobs.filter((job) => matchesTab(job, tab.value)).length,
        ]),
      ) as Record<TabValue, number>,
    [jobs],
  );

  const setStatus = (value: TabValue) => {
    setFilter(value);
    // Keep the URL in sync so deep-links/sharing work.
    const next =
      value === "all" ? "/dashboard/jobs" : `/dashboard/jobs?status=${value}`;
    router.replace(next, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm sm:hidden">
        <label
          htmlFor="mobile-job-status"
          className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
        >
          Job status
        </label>
        <div className="relative">
          <select
            id="mobile-job-status"
            value={filter}
            onChange={(event) => setStatus(event.target.value as TabValue)}
            className="h-12 w-full appearance-none rounded-xl border-2 border-border bg-background px-3 pr-10 text-base font-bold text-foreground outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
          >
            {TABS.map((tab) => (
              <option key={tab.value} value={tab.value}>
                {tab.label} ({tabCounts[tab.value]})
              </option>
            ))}
          </select>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          >
            ▼
          </span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Showing {tabCounts[filter]} {filter === "all" ? "jobs" : "matching jobs"}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Filter jobs by status"
        className="hidden flex-wrap gap-2 rounded-xl border border-border bg-card p-2 shadow-sm sm:flex"
      >
        {TABS.map((tab) => {
          const active = filter === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "inline-flex min-h-10 touch-manipulation items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-colors",
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px]",
                  active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {tabCounts[tab.value]}
              </span>
            </button>
          );
        })}
      </div>
      <JobList jobs={jobs} filter={filter} properties={properties} />
    </div>
  );
}
