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
          <section className="space-y-3 rounded-2xl border border-border bg-card p-3 shadow-sm" aria-label="Job filters">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <label htmlFor="jobs-search" className="sr-only">Search jobs</label>
              <Input id="jobs-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job ID, description, room, area, topic, or assignee" className="pl-10" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <label className="sr-only" htmlFor="jobs-priority">Priority</label>
              <select id="jobs-priority" value={priority} onChange={(event) => setPriority(event.target.value as JobPriority | "all")} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-semibold">
                <option value="all">All priorities</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option>
              </select>
              <label className="sr-only" htmlFor="jobs-date">Created date</label>
              <select id="jobs-date" value={date} onChange={(event) => setDate(event.target.value as DateFilter)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-semibold">
                <option value="all">Any date</option><option value="today">Today</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option>
              </select>
              <label className="sr-only" htmlFor="jobs-ordering">Sort jobs</label>
              <select id="jobs-ordering" value={ordering} onChange={(event) => setOrdering(event.target.value as Ordering)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-semibold">
                <option value="-created_at">Newest first</option><option value="created_at">Oldest first</option><option value="-updated_at">Recently updated</option>
              </select>
              <Button type="button" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}>
                <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Refresh
              </Button>
            </div>
          </section>

          <div className="rounded-xl border border-border bg-card p-3 shadow-sm sm:hidden">
            <label htmlFor="mobile-job-status" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Job status</label>
            <select id="mobile-job-status" value={filter} onChange={(event) => setStatus(event.target.value as TabValue)} className="h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-base font-bold">
              {TABS.map((tab) => <option key={tab.value} value={tab.value}>{tab.label} ({countFor(tab.value)})</option>)}
            </select>
          </div>
          <div role="tablist" aria-label="Filter jobs by status" className="hidden flex-wrap gap-2 rounded-xl border border-border bg-card p-2 shadow-sm sm:flex">
            {TABS.map((tab) => {
              const active = filter === tab.value;
              return <button key={tab.value} type="button" role="tab" aria-selected={active} onClick={() => setStatus(tab.value)} className={cn("inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold", active ? "border-slate-900 bg-slate-900 text-white" : "border-border text-muted-foreground hover:bg-muted")}>
                {tab.label}<span className={cn("rounded-full px-1.5 py-0.5 text-[11px]", active ? "bg-white/20" : "bg-muted")}>{countFor(tab.value)}</span>
              </button>;
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

          {!loading && !error && scopedResponse && scopedResponse.count > PAGE_SIZE && (
            <nav aria-label="Jobs pagination" className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages} · {scopedResponse.count} jobs</p>
              <div className="flex gap-2">
                <button type="button" disabled={!scopedResponse.previous} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button>
                <button type="button" disabled={!scopedResponse.next} onClick={() => setPage((value) => value + 1)} className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
              </div>
            </nav>
          )}
        </>
      )}
    </PageContainer>
  );
}
