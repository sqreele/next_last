"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePreventiveMaintenanceActions } from "@/app/lib/hooks/usePreventiveMaintenanceActions";
import { PreventiveMaintenance } from "@/app/lib/preventiveMaintenanceModels";
import { createPreventiveMaintenanceService } from "@/app/lib/PreventiveMaintenanceService";
import { useSession } from "@/app/lib/session.client";
import { useMainStore } from "@/app/lib/stores/mainStore";
import { StatusBadge } from "@/app/components/StatusBadge";
import Image from "next/image";
import { fixImageUrl } from "@/app/lib/utils/image-utils";

// Updated interface to match Django API response
interface FrequencyDistributionItem {
  frequency: string; // Changed to match Django API response
  count: number; // Changed to match Django API response
}

// Helper function to determine PM status
const determinePMStatus = (item: PreventiveMaintenance): string => {
  // If status is already set, return it
  if (item.status) {
    const normalizedStatus = item.status.toLowerCase();
    return normalizedStatus === "complete" ? "completed" : normalizedStatus;
  }

  // Get current date
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Check if completed
  if (item.completed_date) {
    return "completed";
  }

  // Check if scheduled date is in the past
  if (item.scheduled_date) {
    const scheduledDate = new Date(item.scheduled_date);
    if (scheduledDate < today) {
      return "overdue";
    }
  }

  // Default to pending
  return "pending";
};

// Updated helper function to safely format frequency name
const formatFrequencyName = (frequency: string | undefined | null): string => {
  if (!frequency || typeof frequency !== "string") {
    return "Unknown";
  }
  const normalized = frequency.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export default function PreventiveMaintenanceDashboard() {
  // Use our store hook to access all maintenance data and actions
  const context = usePreventiveMaintenanceActions();
  const {
    statistics,
    error,
    fetchStatistics,
  } = context;
  const selectedProperty = useMainStore(state => state.selectedPropertyId);
  const { data: session } = useSession();
  const accessToken = session?.user?.accessToken || null;
  const upcomingRequestRef = useRef(0);
  const statisticsRequestRef = useRef(0);

  // Pagination state for upcoming maintenance
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [upcomingPageSize, setUpcomingPageSize] = useState(10);
  const [upcomingItems, setUpcomingItems] = useState<PreventiveMaintenance[]>(
    [],
  );
  const [upcomingPropertyId, setUpcomingPropertyId] = useState<string | null>(null);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);

  // Function to fetch upcoming maintenance with pagination
  const fetchUpcomingMaintenance = useCallback(
    async (page: number = 1, pageSize: number = 10) => {
      if (!selectedProperty || !accessToken) {
        upcomingRequestRef.current += 1;
        setUpcomingItems([]);
        setUpcomingPropertyId(null);
        setUpcomingTotal(0);
        setUpcomingLoading(false);
        return;
      }

      const requestId = ++upcomingRequestRef.current;
      setUpcomingLoading(true);
      setUpcomingError(null);
      try {
        const params = {
          status: "pending",
          page: page,
          page_size: pageSize,
          ordering: "scheduled_date",
          property_id: selectedProperty,
        };

        const service = createPreventiveMaintenanceService(accessToken);
        const response =
          await service.getAllPreventiveMaintenance(params);

        if (requestId !== upcomingRequestRef.current) return;

        if (response.success && response.data) {
          let items: PreventiveMaintenance[];
          let total: number;

          if (Array.isArray(response.data)) {
            items = response.data;
            total = response.data.length;
          } else {
            // Paginated response
            items = response.data.results || [];
            total = response.data.count || 0;
          }

          setUpcomingItems(items);
          setUpcomingPropertyId(selectedProperty);
          setUpcomingTotal(total);
        } else {
          console.error(
            "❌ Failed to fetch upcoming maintenance:",
            response.message,
          );
          setUpcomingItems([]);
          setUpcomingPropertyId(selectedProperty);
          setUpcomingTotal(0);
          setUpcomingError(response.message || "Unable to load upcoming maintenance.");
        }
      } catch (error) {
        if (requestId !== upcomingRequestRef.current) return;
        console.error("❌ Error fetching upcoming maintenance:", error);
        setUpcomingItems([]);
        setUpcomingPropertyId(selectedProperty);
        setUpcomingTotal(0);
        setUpcomingError("Unable to load upcoming maintenance.");
      } finally {
        if (requestId === upcomingRequestRef.current) setUpcomingLoading(false);
      }
    },
    [accessToken, selectedProperty],
  );

  // Fetch maintenance data on component mount
  useEffect(() => {
    setUpcomingPage(1);
    if (!selectedProperty) {
      statisticsRequestRef.current += 1;
      setStatisticsLoading(false);
      return;
    }

    const requestId = ++statisticsRequestRef.current;
    setStatisticsLoading(true);
    void fetchStatistics().finally(() => {
      if (requestId === statisticsRequestRef.current) {
        setStatisticsLoading(false);
      }
    });
  }, [selectedProperty, fetchStatistics]);

  // Fetch upcoming maintenance with pagination
  useEffect(() => {
    fetchUpcomingMaintenance(upcomingPage, upcomingPageSize);
  }, [upcomingPage, upcomingPageSize, fetchUpcomingMaintenance]);

  // Pagination control functions
  const handlePageChange = (newPage: number) => {
    setUpcomingPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setUpcomingPageSize(newPageSize);
    setUpcomingPage(1); // Reset to first page when changing page size
  };

  const visibleUpcomingTotal = upcomingPropertyId === selectedProperty ? upcomingTotal : 0;
  const totalPages = Math.ceil(visibleUpcomingTotal / upcomingPageSize);
  const visibleUpcomingItems = upcomingPropertyId === selectedProperty ? upcomingItems : [];

  // Format date
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Get completion rate percentage
  const getCompletionRate = (): number => {
    const completed = statistics?.counts?.completed || 0;
    const eligibleTotal = Math.max(
      0,
      (statistics?.counts?.total || 0) - (statistics?.counts?.cancelled || 0),
    );
    if (!eligibleTotal) return 0;
    return Math.round((completed / eligibleTotal) * 100);
  };

  // Get maintenance title with fallback
  const getMaintenanceTitle = (item: PreventiveMaintenance): string => {
    return item.pmtitle || `Maintenance #${item.pm_id}`;
  };

  if (!selectedProperty) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-2xl items-center px-4 py-12">
        <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-soft">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Select a property</h1>
        <p className="mt-2 leading-6 text-muted-foreground">
          Choose an active property from the dashboard header to view preventive maintenance analytics.
        </p>
        </div>
      </div>
    );
  }

  if (statisticsLoading && !statistics) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-border bg-card py-12 text-center shadow-soft" aria-busy="true">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"></div>
          <p className="mt-3 text-sm font-medium text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm font-medium text-destructive" role="alert">
          {error}
        </div>
        <Link
          href="/dashboard/preventive-maintenance/"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-soft hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          View All Maintenance Tasks
        </Link>
      </div>
    );
  }

  // A null statistics value means the scoped request has not resolved yet;
  // an actual zero-data response still has a counts object full of zeroes.
  if (!statistics || !statistics.counts) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-border bg-card py-12 text-center shadow-soft" aria-busy="true">
          <p className="text-base font-medium text-muted-foreground">
            Loading maintenance summary...
          </p>
        </div>
      </div>
    );
  }

  const canOperate = statistics.can_operate === true;
  const completionEligibleTotal = Math.max(
    0,
    statistics.counts.total - (statistics.counts.cancelled || 0),
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Maintenance analytics</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Preventive Maintenance Dashboard
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Property-scoped maintenance performance and upcoming work.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:space-x-3">
          <Link
            href="/dashboard/preventive-maintenance"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-center text-sm font-semibold text-foreground shadow-soft hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
          >
            View All Tasks
          </Link>
          {canOperate && (
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground shadow-soft hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
            >
              Create New
            </Link>
          )}
        </div>
      </header>

      {/* Main Stats Cards */}
      <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4" aria-label="Preventive maintenance KPIs">
        {/* Total */}
        <div className="order-3 min-w-0 rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <div className="flex items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-info/10 text-info sm:h-12 sm:w-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <div className="ml-3 min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total Tasks
              </p>
              <p className="text-2xl font-bold tabular-nums text-info sm:text-3xl">
                {statistics.counts.total}
              </p>
            </div>
          </div>
        </div>

        {/* Upcoming open work */}
        <div className="order-2 min-w-0 rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <div className="flex items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning-foreground sm:h-12 sm:w-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="ml-3 min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Upcoming
              </p>
              <p className="text-2xl font-bold tabular-nums text-warning-foreground sm:text-3xl">
                {statistics.counts.pending}
              </p>
            </div>
          </div>
        </div>

        {/* Overdue */}
        <div className="order-1 min-w-0 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4 shadow-soft sm:p-5">
          <div className="flex items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive sm:h-12 sm:w-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="ml-3 min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Overdue
              </p>
              <p className="text-2xl font-bold tabular-nums text-destructive sm:text-3xl">
                {statistics.counts.overdue}
              </p>
            </div>
          </div>
        </div>

        {/* Completed */}
        <div className="order-4 min-w-0 rounded-xl border border-success/30 bg-success/[0.03] p-4 shadow-soft sm:p-5">
          <div className="flex items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-success/10 text-success sm:h-12 sm:w-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="ml-3 min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Completed
              </p>
              <p className="text-2xl font-bold tabular-nums text-success sm:text-3xl">
                {statistics.counts.completed}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Completion Progress */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6" aria-labelledby="completion-rate-title">
        <h2 id="completion-rate-title" className="mb-4 text-lg font-semibold text-foreground">
          Completion Rate
        </h2>
        <div className="mb-2 flex items-center gap-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Completion rate" aria-valuenow={getCompletionRate()} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-3 rounded-full bg-success"
              style={{ width: `${getCompletionRate()}%` }}
            ></div>
          </div>
          <span className="shrink-0 text-xl font-bold tabular-nums text-success">{getCompletionRate()}%</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {statistics.counts.completed} of {completionEligibleTotal} non-cancelled
          maintenance tasks completed
        </p>
      </section>

      {/* Frequency Distribution - Fixed to use frequency and count properties */}
      {statistics.frequency_distribution &&
        Array.isArray(statistics.frequency_distribution) &&
        statistics.frequency_distribution.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Maintenance Frequency Distribution
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statistics.frequency_distribution
                .filter(
                  (item: FrequencyDistributionItem) =>
                    item && typeof item === "object" && item.frequency,
                )
                .map((item: FrequencyDistributionItem, index: number) => (
                  <div
                    key={`${item.frequency || "unknown"}-${index}`}
                    className="rounded-lg border border-border bg-muted/40 p-4 text-center"
                  >
                    <p className="text-xl font-bold text-foreground">
                      {item.count || 0}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground capitalize">
                      {formatFrequencyName(item.frequency)}
                    </p>
                  </div>
                ))}
            </div>
          </section>
        )}
      {(!statistics.frequency_distribution ||
        statistics.frequency_distribution.length === 0) && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Maintenance Frequency Distribution
          </h2>
          <p className="text-sm text-muted-foreground">
            No frequency data is available for this property yet.
          </p>
        </section>
      )}

      {/* Average Completion Times - Using avg_completion_times data */}
      {statistics.avg_completion_times &&
        Object.keys(statistics.avg_completion_times).length > 0 && (
          <section className="rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Average Completion Times
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(statistics.avg_completion_times).map(
                ([frequency, avgDays]) => (
                  <div
                    key={frequency}
                    className="rounded-lg border border-border bg-muted/40 p-4 text-center"
                  >
                    <p className="text-xl font-bold text-foreground">
                      {typeof avgDays === "number" ? Math.round(avgDays) : 0}{" "}
                      days
                    </p>
                    <p className="text-sm font-medium text-muted-foreground capitalize">
                      {formatFrequencyName(frequency)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {typeof avgDays === "number" && avgDays < 0
                        ? "Early"
                        : avgDays === 0
                          ? "On Time"
                          : "Delayed"}
                    </p>
                  </div>
                ),
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              * Negative values indicate tasks completed early, positive values
              indicate delays
            </p>
          </section>
        )}
      {(!statistics.avg_completion_times ||
        Object.keys(statistics.avg_completion_times).length === 0) && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Average Completion Times
          </h2>
          <p className="text-sm text-muted-foreground">
            Completion timing will appear after tasks have been completed.
          </p>
        </section>
      )}

      {/* Enhanced Upcoming Maintenance Section */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-soft" aria-labelledby="upcoming-maintenance-title">
        <div className="border-b border-border bg-muted/30 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="upcoming-maintenance-title" className="text-lg font-semibold text-foreground">
              Upcoming Maintenance
            </h2>
            <div className="flex flex-wrap items-center gap-3 sm:space-x-4">
              <span className="text-sm text-muted-foreground">
                Total: {visibleUpcomingTotal} tasks
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm font-medium text-muted-foreground">Show:</label>
                <select
                  value={upcomingPageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20"
                  aria-label="Upcoming tasks per page"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-sm text-muted-foreground">per page</span>
              </div>
            </div>
          </div>
        </div>

        {upcomingLoading ? (
          <div className="p-10 text-center" aria-busy="true">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"></div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Loading upcoming maintenance...
            </p>
          </div>
        ) : upcomingError ? (
          <div className="p-8 text-center" role="alert">
            <p className="font-medium text-destructive">{upcomingError}</p>
            <button
              type="button"
              onClick={() => void fetchUpcomingMaintenance(upcomingPage, upcomingPageSize)}
              className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </div>
        ) : visibleUpcomingItems.length > 0 ? (
          <>
            <div className="divide-y divide-border xl:hidden">
              {visibleUpcomingItems.map((item: PreventiveMaintenance) => {
                const status = item.status || determinePMStatus(item);
                const title = getMaintenanceTitle(item);

                return (
                  <article key={item.pm_id} className="space-y-3 p-4 transition-colors hover:bg-muted/50 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-foreground">{title}</p>
                        <p className="text-sm text-muted-foreground">Task #{item.pm_id}</p>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Scheduled</dt>
                        <dd className="font-medium text-foreground">{formatDate(item.scheduled_date)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Next due</dt>
                        <dd className="font-medium text-foreground">{formatDate(item.next_due_date)}</dd>
                      </div>
                    </dl>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-primary shadow-soft hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        View
                      </Link>
                      {canOperate && status !== "completed" && (
                        <Link
                          href={`/dashboard/preventive-maintenance/edit/${item.pm_id}?complete=true`}
                          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-success bg-success px-3 py-2 text-sm font-semibold text-success-foreground shadow-soft hover:border-[hsl(var(--success-hover))] hover:bg-[hsl(var(--success-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          Complete
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      ID
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      Title
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      Scheduled Date
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      Next Due Date
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      Images
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {visibleUpcomingItems
                    .filter(
                      (item: PreventiveMaintenance) =>
                        item && typeof item === "object",
                    )
                    .map((item: PreventiveMaintenance) => {
                      // Determine PM status
                      const status = item.status || determinePMStatus(item);

                      // Get maintenance title
                      const title = getMaintenanceTitle(item);

                      // Get image URLs - only use URL properties since before_image/after_image don't exist on type
                      const beforeImageUrl = fixImageUrl(item.before_image_url);
                      const afterImageUrl = fixImageUrl(item.after_image_url);

                      return (
                        <tr key={item.pm_id} className="hover:bg-muted/60">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-medium text-primary">
                              {item.pm_id}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <p className="text-sm truncate max-w-[200px]">
                              {title}
                            </p>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {formatDate(item.scheduled_date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {formatDate(item.next_due_date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge status={status} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex space-x-2">
                              {beforeImageUrl && (
                                <div className="h-10 w-10 rounded-sm overflow-hidden border">
                                  <Image
                                    src={beforeImageUrl}
                                    alt={`${title} before maintenance`}
                                    width={40}
                                    height={40}
                                    className="h-full w-full object-cover"
                                    quality={60}
                                    unoptimized={beforeImageUrl.startsWith(
                                      "http",
                                    )}
                                  />
                                </div>
                              )}
                              {afterImageUrl && (
                                <div className="h-10 w-10 rounded-sm overflow-hidden border">
                                  <Image
                                    src={afterImageUrl}
                                    alt={`${title} after maintenance`}
                                    width={40}
                                    height={40}
                                    className="h-full w-full object-cover"
                                    quality={60}
                                    unoptimized={afterImageUrl.startsWith(
                                      "http",
                                    )}
                                  />
                                </div>
                              )}
                              {!beforeImageUrl && !afterImageUrl && null}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <Link
                                href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                                className="rounded-sm text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                View
                              </Link>
                              {canOperate && status !== "completed" && (
                                <Link
                                  href={`/dashboard/preventive-maintenance/edit/${item.pm_id}?complete=true`}
                                  className="rounded-sm text-success hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  Complete
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="border-t border-border bg-muted/30 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center justify-between gap-2 sm:justify-start">
                    <span className="text-sm text-muted-foreground">
                      Showing {(upcomingPage - 1) * upcomingPageSize + 1} to{" "}
                      {Math.min(upcomingPage * upcomingPageSize, visibleUpcomingTotal)}{" "}
                      of {visibleUpcomingTotal} results
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePageChange(upcomingPage - 1)}
                      disabled={upcomingPage <= 1}
                      className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold shadow-soft hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>

                    {/* Page numbers */}
                    <div className="hidden space-x-1 sm:flex">
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          const pageNum =
                            Math.max(
                              1,
                              Math.min(totalPages - 4, upcomingPage - 2),
                            ) + i;
                          if (pageNum > totalPages) return null;

                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePageChange(pageNum)}
                              aria-label={`Go to page ${pageNum}`}
                              aria-current={pageNum === upcomingPage ? "page" : undefined}
                              className={`min-h-11 min-w-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                                pageNum === upcomingPage
                                  ? "border-primary bg-primary text-primary-foreground shadow-soft"
                                  : "border-border bg-background hover:bg-primary/10 hover:text-primary"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        },
                      )}
                    </div>

                    <button
                      onClick={() => handlePageChange(upcomingPage + 1)}
                      disabled={upcomingPage >= totalPages}
                      className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold shadow-soft hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center">
            <div className="text-muted-foreground mb-2">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 0V9a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V11a2 2 0 00-2-2v0"
                />
              </svg>
            </div>
            <p className="text-muted-foreground mb-2">
              No upcoming maintenance tasks found
            </p>
            <p className="text-sm text-muted-foreground">This could mean:</p>
            <ul className="text-sm text-muted-foreground mt-1 list-disc list-inside">
              <li>All tasks are completed</li>
              <li>No pending maintenance tasks exist</li>
              <li>Try adjusting your filters</li>
            </ul>
            <div className="mt-4 space-x-2">
              {canOperate && (
                <Link
                  href="/dashboard/preventive-maintenance/create"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Create New Task
                </Link>
              )}
              <Link
                href="/dashboard/preventive-maintenance"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-soft hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                View All Tasks
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Quick Access */}
      <section
        aria-labelledby="quick-actions-heading"
        className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-6"
      >
        <h2
          id="quick-actions-heading"
          className="mb-4 text-lg font-semibold text-foreground"
        >
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {canOperate && (
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="flex min-h-16 items-center rounded-lg border border-border bg-background p-4 font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="mr-3 rounded-full bg-primary/10 p-2 text-primary">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
              </div>
              <span>Create New Task</span>
            </Link>
          )}

          <Link
            href="/dashboard/preventive-maintenance?status=overdue"
            className="flex min-h-16 items-center rounded-lg border border-border bg-background p-4 font-medium text-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="mr-3 rounded-full bg-destructive/10 p-2 text-destructive">
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <span>View Overdue Tasks</span>
          </Link>

          <Link
            href="/dashboard/preventive-maintenance?status=pending"
            className="flex min-h-16 items-center rounded-lg border border-border bg-background p-4 font-medium text-foreground transition-colors hover:border-warning/40 hover:bg-warning/10 hover:text-warning focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="mr-3 rounded-full bg-warning/10 p-2 text-warning">
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <span>View Upcoming Tasks</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
