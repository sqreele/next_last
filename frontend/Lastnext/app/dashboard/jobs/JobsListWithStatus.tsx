"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RefreshCcw, Search } from "lucide-react";
import MaintenanceJobCard from "@/app/components/jobs/MaintenanceJobCard";
import { JobListSkeleton } from "@/app/components/ui/loading";
import { useSession } from "@/app/lib/session.client";
import { useProperties, useUser } from "@/app/lib/stores/mainStore";
import type { Job, JobPriority, TabValue } from "@/app/lib/types";
import {
  isCurrentJobsDashboardRequest,
  isJobsDashboardAbortError,
  requestJobsDashboardPage,
  type JobsDashboardResponse,
  type JobsDashboardStatusCounts,
} from "@/app/lib/hooks/jobs-dashboard-request.mjs";
import { cn } from "@/app/lib/utils/cn";
import { PageContainer } from "@/app/components/layout/PageContainer";
import { PageHeader } from "@/app/components/layout/PageHeader";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

const PAGE_SIZE = 24;
const EMPTY_COUNTS: JobsDashboardStatusCounts = {
  total: 0, pending: 0, in_progress: 0, waiting_sparepart: 0,
  completed: 0, cancelled: 0, defect: 0, preventive_maintenance: 0,
};
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

type DateFilter = "all" | "today" | "week" | "month";
type Ordering = "-created_at" | "created_at" | "-updated_at";

export function JobsListWithStatus({ initialFilter }: { initialFilter: TabValue }) {
  const router = useRouter();
  const { status } = useSession();
  const { selectedPropertyId } = useUser();
  const { properties, propertyLoading } = useProperties();
  const activePropertyId = String(selectedPropertyId || "");
  const [response, setResponse] = React.useState<JobsDashboardResponse | null>(null);
  const [filter, setFilter] = React.useState<TabValue>(initialFilter);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [priority, setPriority] = React.useState<JobPriority | "all">("all");
  const [date, setDate] = React.useState<DateFilter>("all");
  const [ordering, setOrdering] = React.useState<Ordering>("-created_at");
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [propertyEpoch, setPropertyEpoch] = React.useState(0);
  const requestIdRef = React.useRef(0);
  const propertyRef = React.useRef(activePropertyId);
  const propertyResetRef = React.useRef(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    if (propertyRef.current === activePropertyId) return;
    propertyRef.current = activePropertyId;
    propertyResetRef.current = true;
    requestIdRef.current += 1;
    setResponse(null);
    setError(null);
    setLoading(false);
    setPage(1);
    setFilter(initialFilter);
    setSearch("");
    setDebouncedSearch("");
    setPriority("all");
    setDate("all");
    setOrdering("-created_at");
    setPropertyEpoch((value) => value + 1);
  }, [activePropertyId, initialFilter]);

  React.useEffect(() => {
    if (status !== "authenticated" || !activePropertyId) {
      requestIdRef.current += 1;
      setResponse(null);
      setLoading(false);
      return;
    }
    if (propertyResetRef.current) {
      propertyResetRef.current = false;
      return;
    }
    if (propertyRef.current !== activePropertyId) return;

    const requestId = ++requestIdRef.current;
    const requestPropertyId = activePropertyId;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void requestJobsDashboardPage({
      propertyId: requestPropertyId,
      page,
      pageSize: PAGE_SIZE,
      filters: { search: debouncedSearch, status: filter, priority, date, ordering },
      signal: controller.signal,
    }).then((data) => {
      if (!data || !isCurrentJobsDashboardRequest({
        requestId, currentRequestId: requestIdRef.current,
        requestPropertyId, currentPropertyId: propertyRef.current,
      })) return;
      setResponse(data);
      setLoading(false);
    }).catch((requestError: unknown) => {
      if (isJobsDashboardAbortError(requestError)) return;
      if (!isCurrentJobsDashboardRequest({
        requestId, currentRequestId: requestIdRef.current,
        requestPropertyId, currentPropertyId: propertyRef.current,
      })) return;
      setResponse(null);
      setError(requestError instanceof Error ? requestError.message : "Unable to load jobs.");
      setLoading(false);
    });

    return () => controller.abort(new DOMException("Jobs request superseded", "AbortError"));
  }, [status, activePropertyId, page, debouncedSearch, filter, priority, date, ordering, refreshKey, propertyEpoch]);

  React.useEffect(() => setPage(1), [debouncedSearch, filter, priority, date, ordering]);

  const scopedResponse = response?.property_id === activePropertyId ? response : null;
  const jobs: Job[] = scopedResponse?.results || [];
  const counts = scopedResponse?.status_counts || EMPTY_COUNTS;
  const totalPages = Math.max(1, Math.ceil((scopedResponse?.count || 0) / PAGE_SIZE));
  const countFor = (tab: TabValue) => tab === "all" ? counts.total : counts[tab];
  const hasActiveFilters = Boolean(
    filter !== "all" || debouncedSearch || priority !== "all" || date !== "all",
  );

  const setStatus = (value: TabValue) => {
    setFilter(value);
    router.replace(value === "all" ? "/dashboard/jobs" : `/dashboard/jobs?status=${value}`, { scroll: false });
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Jobs workspace"
        title="Maintenance jobs"
        description={
          !activePropertyId
            ? "Choose an active property to load its maintenance work."
            : scopedResponse
              ? `${scopedResponse.count} job${scopedResponse.count === 1 ? "" : "s"} at ${scopedResponse.property_name}`
              : "Property-scoped maintenance work"
        }
        actions={scopedResponse?.can_operate ? (
          <Button asChild>
            <Link href={`/dashboard/create-job?property_id=${encodeURIComponent(activePropertyId)}`}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Create job
            </Link>
          </Button>
        ) : undefined}
      />

      {status === "loading" || propertyLoading ? (
        <JobListSkeleton count={6} />
      ) : !activePropertyId ? (
        <FeedbackState
          variant={properties.length > 0 ? "empty" : "unauthorized"}
          title={properties.length > 0 ? "Select a property to view jobs" : "No accessible properties"}
          description={properties.length > 0 ? "Use the property selector in the navigation, then this page will load that property only." : "Ask a tenant administrator to grant you access to a property."}
        />
      ) : (
        <>
          <section
            className="rounded-xl border border-border bg-card p-4 shadow-soft lg:p-5"
            aria-label="Job filters"
          >
            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,1fr)_auto] xl:items-end">
              <div className="min-w-0 space-y-1.5">
                <label
                  htmlFor="jobs-search"
                  className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Search jobs
                </label>
                <div className="relative min-w-0">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="jobs-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search job ID, description, room, area, topic, or assignee"
                    className="h-12 min-w-0 pl-10 lg:h-11"
                  />
                </div>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-end">
                <div className="min-w-0 space-y-1.5">
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    htmlFor="jobs-priority"
                  >
                    Priority
                  </label>
                  <select
                    id="jobs-priority"
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as JobPriority | "all")
                    }
                    className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-semibold text-foreground shadow-soft transition-[border-color,box-shadow] hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20 lg:h-11 lg:text-sm xl:w-40"
                  >
                    <option value="all">All priorities</option>
                    <option value="high">High priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="low">Low priority</option>
                  </select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    htmlFor="jobs-date"
                  >
                    Created date
                  </label>
                  <select
                    id="jobs-date"
                    value={date}
                    onChange={(event) =>
                      setDate(event.target.value as DateFilter)
                    }
                    className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-semibold text-foreground shadow-soft transition-[border-color,box-shadow] hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20 lg:h-11 lg:text-sm xl:w-36"
                  >
                    <option value="all">Any date</option>
                    <option value="today">Today</option>
                    <option value="week">Last 7 days</option>
                    <option value="month">Last 30 days</option>
                  </select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    htmlFor="jobs-ordering"
                  >
                    Sort jobs
                  </label>
                  <select
                    id="jobs-ordering"
                    value={ordering}
                    onChange={(event) =>
                      setOrdering(event.target.value as Ordering)
                    }
                    className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-semibold text-foreground shadow-soft transition-[border-color,box-shadow] hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20 lg:h-11 lg:text-sm xl:w-44"
                  >
                    <option value="-created_at">Newest first</option>
                    <option value="created_at">Oldest first</option>
                    <option value="-updated_at">Recently updated</option>
                  </select>
                </div>
                <div className="flex items-end sm:pt-[1.375rem] xl:pt-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRefreshKey((value) => value + 1)}
                    className="h-12 w-full lg:h-11 lg:w-auto"
                    aria-label="Refresh jobs"
                  >
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />{" "}
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <div className="rounded-xl border border-border bg-card p-4 shadow-soft sm:hidden">
            <label
              htmlFor="mobile-job-status"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
            >
              Job status
            </label>
            <select
              id="mobile-job-status"
              value={filter}
              onChange={(event) => setStatus(event.target.value as TabValue)}
              className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-semibold text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20"
            >
              {TABS.map((tab) => (
                <option key={tab.value} value={tab.value}>
                  {tab.label} ({countFor(tab.value)})
                </option>
              ))}
            </select>
          </div>
          <div
            role="tablist"
            aria-label="Filter jobs by status"
            className="hidden flex-wrap gap-2 rounded-xl border border-border bg-card p-2.5 shadow-soft sm:flex"
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
                    "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-soft"
                      : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                      active
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {countFor(tab.value)}
                  </span>
                </button>
              );
            })}
          </div>

          {loading ? <JobListSkeleton count={6} /> : error ? (
            <FeedbackState
              variant="error"
              title="Jobs could not be loaded"
              description={error}
              action={<Button type="button" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}>Try again</Button>}
            />
          ) : jobs.length === 0 ? (
            <FeedbackState
              variant={hasActiveFilters ? "no-results" : "empty"}
              title={hasActiveFilters ? "No jobs match these filters" : "No jobs found for this property"}
              description={hasActiveFilters ? "Try clearing the search, status, priority, or date filter." : "New maintenance jobs for this property will appear here."}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {jobs.map((job) => <MaintenanceJobCard key={job.job_id} job={job} />)}
            </div>
          )}

          {!loading &&
            !error &&
            scopedResponse &&
            scopedResponse.count > PAGE_SIZE && (
              <nav
                aria-label="Jobs pagination"
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-center text-sm font-medium text-muted-foreground sm:text-left">
                  <span className="font-semibold text-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <span aria-hidden="true"> · </span>
                  {scopedResponse.count} jobs
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!scopedResponse.previous}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    className="w-full px-3 sm:w-auto"
                    aria-label="Go to previous jobs page"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />{" "}
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!scopedResponse.next}
                    onClick={() => setPage((value) => value + 1)}
                    className="w-full px-3 sm:w-auto"
                    aria-label="Go to next jobs page"
                  >
                    Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </nav>
            )}
        </>
      )}
    </PageContainer>
  );
}
