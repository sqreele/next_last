"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RefreshCcw, Search } from "lucide-react";
import MaintenanceJobCard from "@/app/components/jobs/MaintenanceJobCard";
import { JobListSkeleton, LoadingOverlay } from "@/app/components/ui/loading";
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
import { useT } from "@/app/lib/i18n/LocaleProvider";
import type { DictKey } from "@/app/lib/i18n/dictionary";

const PAGE_SIZE = 24;
const EMPTY_COUNTS: JobsDashboardStatusCounts = {
  total: 0, pending: 0, in_progress: 0, waiting_sparepart: 0,
  completed: 0, cancelled: 0, defect: 0, preventive_maintenance: 0,
};
const TABS: Array<{ value: TabValue; labelKey: DictKey }> = [
  { value: "all", labelKey: "common.all" },
  { value: "pending", labelKey: "status.pending" },
  { value: "in_progress", labelKey: "status.inProgress" },
  { value: "waiting_sparepart", labelKey: "status.waitingSparepart" },
  { value: "completed", labelKey: "status.completed" },
  { value: "cancelled", labelKey: "status.cancelled" },
  { value: "defect", labelKey: "myJobs.defective" },
  { value: "preventive_maintenance", labelKey: "status.preventiveMaintenance" },
];

type DateFilter = "all" | "today" | "week" | "month";
type Ordering = "-created_at" | "created_at" | "-updated_at";

export function JobsListWithStatus({ initialFilter }: { initialFilter: TabValue }) {
  const t = useT();
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
      setResponse((current) =>
        current?.property_id === requestPropertyId ? current : null,
      );
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
        eyebrow={t("jobs.workspace")}
        title={t("jobs.title")}
        description={
          !activePropertyId
            ? t("jobs.chooseProperty")
            : scopedResponse
              ? t("jobs.countAt", { count: scopedResponse.count, property: scopedResponse.property_name })
              : t("jobs.propertyScoped")
        }
        actions={scopedResponse?.can_operate ? (
          <Button asChild>
            <Link href={`/dashboard/create-job?property_id=${encodeURIComponent(activePropertyId)}`}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {t("nav.createJob")}
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
                  {t("jobs.search")}
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
                    placeholder={t("jobs.searchPlaceholder")}
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
                    {t("editJob.priority")}
                  </label>
                  <select
                    id="jobs-priority"
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as JobPriority | "all")
                    }
                    className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-semibold text-foreground shadow-soft transition-[border-color,box-shadow] hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20 lg:h-11 lg:text-sm xl:w-40"
                  >
                    <option value="all">{t("myJobs.allPriorities")}</option>
                    <option value="high">{t("priority.high")}</option>
                    <option value="medium">{t("priority.medium")}</option>
                    <option value="low">{t("priority.low")}</option>
                  </select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    htmlFor="jobs-date"
                  >
                    {t("jobs.createdDate")}
                  </label>
                  <select
                    id="jobs-date"
                    value={date}
                    onChange={(event) =>
                      setDate(event.target.value as DateFilter)
                    }
                    className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-semibold text-foreground shadow-soft transition-[border-color,box-shadow] hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20 lg:h-11 lg:text-sm xl:w-36"
                  >
                    <option value="all">{t("myJobs.anyDate")}</option>
                    <option value="today">{t("action.today")}</option>
                    <option value="week">{t("myJobs.last7Days")}</option>
                    <option value="month">{t("myJobs.last30Days")}</option>
                  </select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    htmlFor="jobs-ordering"
                  >
                    {t("jobs.sort")}
                  </label>
                  <select
                    id="jobs-ordering"
                    value={ordering}
                    onChange={(event) =>
                      setOrdering(event.target.value as Ordering)
                    }
                    className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-semibold text-foreground shadow-soft transition-[border-color,box-shadow] hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20 lg:h-11 lg:text-sm xl:w-44"
                  >
                    <option value="-created_at">{t("jobActions.newest")}</option>
                    <option value="created_at">{t("jobActions.oldest")}</option>
                    <option value="-updated_at">{t("jobs.recentlyUpdated")}</option>
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
                    {t("action.refresh")}
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
              {t("jobs.status")}
            </label>
            <select
              id="mobile-job-status"
              value={filter}
              onChange={(event) => setStatus(event.target.value as TabValue)}
              className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base font-semibold text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20"
            >
              {TABS.map((tab) => (
                <option key={tab.value} value={tab.value}>
                  {t(tab.labelKey)} ({countFor(tab.value)})
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
                  {t(tab.labelKey)}
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

          {error && scopedResponse ? (
            <div
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {loading && !scopedResponse ? <JobListSkeleton count={6} /> : !scopedResponse && error ? (
            <FeedbackState
              variant="error"
              title={t("jobs.loadError")}
              description={error}
              action={<Button type="button" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}>{t("action.tryAgain")}</Button>}
            />
          ) : jobs.length === 0 ? (
            <FeedbackState
              variant={hasActiveFilters ? "no-results" : "empty"}
              title={hasActiveFilters ? t("myJobs.noMatches") : t("jobs.noneProperty")}
              description={hasActiveFilters ? t("jobs.clearHint") : t("jobs.noneHint")}
            />
          ) : (
            <div className="relative" aria-busy={loading}>
              <LoadingOverlay show={loading} label={t("jobs.updating")} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {jobs.map((job) => <MaintenanceJobCard key={job.job_id} job={job} />)}
              </div>
            </div>
          )}

          {scopedResponse &&
            scopedResponse.count > PAGE_SIZE && (
              <nav
                aria-label="Jobs pagination"
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-center text-sm font-medium text-muted-foreground sm:text-left">
                  <span className="font-semibold text-foreground">
                    {t("pm.pageOf", { page, total: totalPages })}
                  </span>
                  <span aria-hidden="true"> · </span>
                  {t("dashboard.jobsCount", { count: scopedResponse.count })}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading || !scopedResponse.previous}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    className="w-full px-3 sm:w-auto"
                    aria-label="Go to previous jobs page"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />{" "}
                    {t("action.previous")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading || !scopedResponse.next}
                    onClick={() => setPage((value) => value + 1)}
                    className="w-full px-3 sm:w-auto"
                    aria-label="Go to next jobs page"
                  >
                    {t("action.next")} <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </nav>
            )}
        </>
      )}
    </PageContainer>
  );
}
