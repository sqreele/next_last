"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePreventiveMaintenanceActions } from "@/app/lib/hooks/usePreventiveMaintenanceActions";
import { PreventiveMaintenance, determinePMStatus } from "@/app/lib/preventiveMaintenanceModels";
import { createPreventiveMaintenanceService } from "@/app/lib/PreventiveMaintenanceService";
import { useMainStore } from "@/app/lib/stores/mainStore";
import { StatusBadge } from "@/app/components/StatusBadge";
import Image from "next/image";
import { fixImageUrl } from "@/app/lib/utils/image-utils";
import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";
import { PageLoader } from "@/app/components/ui/loading";
import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import { CalendarDays, Repeat2 } from "lucide-react";

// Updated interface to match Django API response
interface FrequencyDistributionItem {
  frequency: string; // Changed to match Django API response
  count: number; // Changed to match Django API response
}

export default function PreventiveMaintenanceDashboard() {
  const { locale, t } = useLocale();
  const dateLocale = locale === "th" ? "th-TH-u-ca-gregory" : "en-US";
  // Use our store hook to access all maintenance data and actions
  const context = usePreventiveMaintenanceActions();
  const {
    statistics,
    error,
    fetchStatistics,
  } = context;
  const selectedProperty = useMainStore(state => state.selectedPropertyId);
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
      if (!selectedProperty) {
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

        const service = createPreventiveMaintenanceService();
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
          setUpcomingError(response.message || t("pmDashboard.upcomingError"));
        }
      } catch (error) {
        if (requestId !== upcomingRequestRef.current) return;
        console.error("❌ Error fetching upcoming maintenance:", error);
        setUpcomingItems([]);
        setUpcomingPropertyId(selectedProperty);
        setUpcomingTotal(0);
        setUpcomingError(t("pmDashboard.upcomingError"));
      } finally {
        if (requestId === upcomingRequestRef.current) setUpcomingLoading(false);
      }
    },
    [selectedProperty, t],
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
    if (!dateString) return t("common.notAvailable");
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return t("common.notAvailable");
    return date.toLocaleDateString(dateLocale, {
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
    return item.pmtitle || t("pm.taskId", { id: item.pm_id });
  };

  const formatFrequencyName = (frequency: string | undefined | null): string => {
    if (!frequency || typeof frequency !== "string") return t("pmDashboard.unknown");
    const key = frequency === "semi_annual" ? "semiAnnual" : frequency;
    const supported = ["daily", "weekly", "monthly", "quarterly", "semiAnnual", "annual", "custom"];
    return supported.includes(key)
      ? t(`pm.frequency.${key}` as Parameters<typeof t>[0])
      : frequency.replaceAll("_", " ");
  };

  if (!selectedProperty) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-2xl items-center px-4 py-12">
        <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-soft">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("common.selectProperty")}</h1>
        <p className="mt-2 leading-6 text-muted-foreground">
          {t("pmDashboard.selectPropertyHint")}
        </p>
        </div>
      </div>
    );
  }

  if (statisticsLoading && !statistics) {
    return (
      <PageLoader
        label={t("pmDashboard.loading")}
        description={t("pmDashboard.loadingDescription")}
      />
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
          {t("pmDashboard.viewAll")}
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
            {t("pmDashboard.loadingSummary")}
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
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("pmDashboard.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {t("pmDashboard.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("pmDashboard.description")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:space-x-3">
          <Link
            href="/dashboard/preventive-maintenance"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-center text-sm font-semibold text-foreground shadow-soft hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
          >
            {t("pmDashboard.viewAll")}
          </Link>
          {canOperate && (
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground shadow-soft hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
            >
              {t("pmDashboard.createNew")}
            </Link>
          )}
        </div>
      </header>

      {/* Main Stats Cards */}
      <section className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:gap-4 lg:grid-cols-4" aria-label={t("pmDashboard.kpis")}>
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
              <p className="text-xs font-semibold uppercase leading-4 tracking-wide text-muted-foreground">
                {t("pmDashboard.totalTasks")}
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
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning-emphasis sm:h-12 sm:w-12">
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
              <p className="text-xs font-semibold uppercase leading-4 tracking-wide text-muted-foreground">
                {t("pm.upcoming")}
              </p>
              <p className="text-2xl font-bold tabular-nums text-warning-emphasis sm:text-3xl">
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
              <p className="text-xs font-semibold uppercase leading-4 tracking-wide text-muted-foreground">
                {t("status.overdue")}
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
              <p className="text-xs font-semibold uppercase leading-4 tracking-wide text-muted-foreground">
                {t("status.completed")}
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
          {t("pmDashboard.completionRate")}
        </h2>
        <div className="mb-2 flex items-center gap-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t("pmDashboard.completionRate")} aria-valuenow={getCompletionRate()} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-3 rounded-full bg-success"
              style={{ width: `${getCompletionRate()}%` }}
            ></div>
          </div>
          <span className="shrink-0 text-xl font-bold tabular-nums text-success">{getCompletionRate()}%</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("pmDashboard.completionSummary", { completed: statistics.counts.completed, total: completionEligibleTotal })}
        </p>
      </section>

      {/* Frequency Distribution - Fixed to use frequency and count properties */}
      {statistics.frequency_distribution &&
        Array.isArray(statistics.frequency_distribution) &&
        statistics.frequency_distribution.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              {t("pmDashboard.frequencyDistribution")}
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
            {t("pmDashboard.frequencyDistribution")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("pmDashboard.noFrequencyData")}
          </p>
        </section>
      )}

      {/* Average Completion Times - Using avg_completion_times data */}
      {statistics.avg_completion_times &&
        Object.keys(statistics.avg_completion_times).length > 0 && (
          <section className="rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              {t("pmDashboard.averageCompletion")}
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
                      {t("pmDashboard.days")}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground capitalize">
                      {formatFrequencyName(frequency)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {typeof avgDays === "number" && avgDays < 0
                        ? t("pmDashboard.early")
                        : avgDays === 0
                          ? t("pmDashboard.onTime")
                          : t("pmDashboard.delayed")}
                    </p>
                  </div>
                ),
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              {t("pmDashboard.timingHint")}
            </p>
          </section>
        )}
      {(!statistics.avg_completion_times ||
        Object.keys(statistics.avg_completion_times).length === 0) && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            {t("pmDashboard.averageCompletion")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("pmDashboard.noCompletionData")}
          </p>
        </section>
      )}

      {/* Enhanced Upcoming Maintenance Section */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-soft" aria-labelledby="upcoming-maintenance-title">
        <div className="border-b border-border bg-muted/30 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="upcoming-maintenance-title" className="text-lg font-semibold text-foreground">
              {t("pmDashboard.upcomingMaintenance")}
            </h2>
            <div className="flex flex-wrap items-center gap-3 sm:space-x-4">
              <span className="text-sm text-muted-foreground">
                {t("pmDashboard.totalUpcoming", { count: visibleUpcomingTotal })}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="pm-upcoming-page-size" className="text-sm font-medium text-muted-foreground">{t("pmDashboard.show")}</label>
                <select
                  id="pm-upcoming-page-size"
                  value={upcomingPageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/20"
                  aria-label={t("pmDashboard.perPage")}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-sm text-muted-foreground">{t("pmDashboard.perPage")}</span>
              </div>
            </div>
          </div>
        </div>

        {upcomingLoading ? (
          <div className="p-10 text-center">
            <BouncingDotsLoader size="md" label={t("pmDashboard.loadingUpcoming")} className="text-sm font-medium text-muted-foreground" />
          </div>
        ) : upcomingError ? (
          <div className="p-8 text-center" role="alert">
            <p className="font-medium text-destructive">{upcomingError}</p>
            <button
              type="button"
              onClick={() => void fetchUpcomingMaintenance(upcomingPage, upcomingPageSize)}
              className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("action.tryAgain")}
            </button>
          </div>
        ) : visibleUpcomingItems.length > 0 ? (
          <>
            <div className="divide-y divide-border xl:hidden">
              {visibleUpcomingItems.map((item: PreventiveMaintenance) => {
                const status = determinePMStatus(item);
                const title = getMaintenanceTitle(item);

                return (
                  <article key={item.pm_id} className="space-y-3 p-4 transition-colors hover:bg-muted/50 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-foreground">{title}</p>
                        <p className="text-sm text-muted-foreground">{t("pm.taskId", { id: item.pm_id })}</p>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                    <dl className="grid grid-cols-1 gap-3 text-sm min-[400px]:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">{t("status.scheduled")}</dt>
                        <dd className="font-medium text-foreground">{formatDate(item.scheduled_date)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("pm.nextDue")}</dt>
                        <dd className="font-medium text-foreground">{formatDate(item.next_due_date)}</dd>
                      </div>
                    </dl>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-primary shadow-soft hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {t("action.viewDetails")}
                      </Link>
                      {canOperate && status !== "completed" && (
                        <Link
                          href={`/dashboard/preventive-maintenance/edit/${item.pm_id}?complete=true`}
                          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-success bg-success px-3 py-2 text-sm font-semibold text-success-foreground shadow-soft hover:border-[hsl(var(--success-hover))] hover:bg-[hsl(var(--success-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {t("status.completed")}
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
                      {t("pmDashboard.id")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {t("pmEdit.maintenanceTitle")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {t("pmEdit.scheduledDate")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {t("pm.nextDue")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {t("editJob.status")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {t("pmDashboard.images")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {t("inventory.actions")}
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
                      const status = determinePMStatus(item);

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
                                alt={t("pmDashboard.beforeImage", { title })}
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
                                    alt={t("pmDashboard.afterImage", { title })}
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
                                {t("action.viewDetails")}
                              </Link>
                              {canOperate && status !== "completed" && (
                                <Link
                                  href={`/dashboard/preventive-maintenance/edit/${item.pm_id}?complete=true`}
                                  className="rounded-sm text-success hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  {t("status.completed")}
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
                      {t("pm.showing", {
                        from: (upcomingPage - 1) * upcomingPageSize + 1,
                        to: Math.min(upcomingPage * upcomingPageSize, visibleUpcomingTotal),
                        total: visibleUpcomingTotal,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePageChange(upcomingPage - 1)}
                      disabled={upcomingPage <= 1}
                      className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold shadow-soft hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("pmDashboard.previous")}
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
                              aria-label={t("pmDashboard.goToPage", { page: pageNum })}
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
                      {t("pmDashboard.next")}
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
            <p className="mb-2 font-semibold text-foreground">{t("pmDashboard.noUpcoming")}</p>
            <p className="text-sm text-muted-foreground">{t("pmDashboard.noUpcomingHint")}</p>
            <div className="mt-4 grid gap-2 sm:flex sm:justify-center">
              {canOperate && (
                <Link
                  href="/dashboard/preventive-maintenance/create"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("pm.createTask")}
                </Link>
              )}
              <Link
                href="/dashboard/preventive-maintenance"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-soft hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("pmDashboard.viewAll")}
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
          {t("pmDashboard.quickActions")}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            <span>{t("pmDashboard.viewOverdue")}</span>
          </Link>

          <Link
            href="/dashboard/preventive-maintenance?status=pending"
            className="flex min-h-16 items-center rounded-lg border border-border bg-background p-4 font-medium text-foreground transition-colors hover:border-warning/40 hover:bg-warning/10 hover:text-warning-emphasis focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="mr-3 rounded-full bg-warning/10 p-2 text-warning-emphasis">
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
            <span>{t("pmDashboard.viewUpcoming")}</span>
          </Link>

          <Link
            href="/dashboard/preventive-maintenance/schedule"
            className="flex min-h-16 items-center rounded-lg border border-border bg-background p-4 font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="mr-3 rounded-full bg-primary/10 p-2 text-primary">
              <CalendarDays className="h-6 w-6" aria-hidden="true" />
            </div>
            <span>{t("pmPlans.schedule")}</span>
          </Link>

          <Link
            href="/dashboard/preventive-maintenance/plans"
            className="flex min-h-16 items-center rounded-lg border border-border bg-background p-4 font-medium text-foreground transition-colors hover:border-purple-400 hover:bg-purple-50 hover:text-purple-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="mr-3 rounded-full bg-purple-100 p-2 text-purple-700">
              <Repeat2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <span>{t("pm.masterPlans")}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
