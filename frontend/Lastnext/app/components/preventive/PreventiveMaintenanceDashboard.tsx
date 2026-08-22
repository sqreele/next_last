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
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-foreground">Select a property</h1>
        <p className="mt-2 text-muted-foreground">
          Choose an active property from the dashboard header to view preventive maintenance analytics.
        </p>
      </div>
    );
  }

  if (statisticsLoading && !statistics) {
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
        <div className="text-center py-10">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-border border-t-blue-600"></div>
          <p className="mt-2 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <Link
          href="/dashboard/preventive-maintenance/"
          className="bg-muted py-2 px-4 rounded-md text-muted-foreground hover:bg-gray-200"
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
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
        <div className="text-center py-10">
          <p className="text-lg text-muted-foreground">
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
    <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          Preventive Maintenance Dashboard
        </h1>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:space-x-3">
          <Link
            href="/dashboard/preventive-maintenance"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-muted px-3 py-2 text-center text-sm font-semibold text-muted-foreground hover:bg-gray-200 sm:px-4"
          >
            View All Tasks
          </Link>
          {canOperate && (
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700 sm:px-4"
            >
              Create New
            </Link>
          )}
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:mb-8 md:gap-6 lg:grid-cols-4">
        {/* Total */}
        <div className="order-3 rounded-lg bg-card p-4 shadow sm:p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
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
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">
                Total Tasks
              </p>
              <p className="text-2xl font-bold text-foreground sm:text-3xl">
                {statistics.counts.total}
              </p>
            </div>
          </div>
        </div>

        {/* Upcoming open work */}
        <div className="order-2 rounded-lg bg-card p-4 shadow sm:p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
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
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">
                Upcoming
              </p>
              <p className="text-2xl font-bold text-foreground sm:text-3xl">
                {statistics.counts.pending}
              </p>
            </div>
          </div>
        </div>

        {/* Overdue */}
        <div className="order-1 rounded-lg bg-card p-4 shadow sm:p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-red-100 text-red-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
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
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">
                Overdue
              </p>
              <p className="text-2xl font-bold text-red-600 sm:text-3xl">
                {statistics.counts.overdue}
              </p>
            </div>
          </div>
        </div>

        {/* Completed */}
        <div className="order-4 rounded-lg bg-card p-4 shadow sm:p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
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
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">
                Completed
              </p>
              <p className="text-2xl font-bold text-green-600 sm:text-3xl">
                {statistics.counts.completed}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Completion Progress */}
      <div className="bg-card rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-muted-foreground mb-4">
          Completion Rate
        </h2>
        <div className="flex items-center mb-2">
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-green-600 h-4 rounded-full"
              style={{ width: `${getCompletionRate()}%` }}
            ></div>
          </div>
          <span className="ml-4 text-xl font-bold">{getCompletionRate()}%</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {statistics.counts.completed} of {completionEligibleTotal} non-cancelled
          maintenance tasks completed
        </p>
      </div>

      {/* Frequency Distribution - Fixed to use frequency and count properties */}
      {statistics.frequency_distribution &&
        Array.isArray(statistics.frequency_distribution) &&
        statistics.frequency_distribution.length > 0 && (
          <div className="bg-card rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold text-muted-foreground mb-4">
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
                    key={item.frequency || `freq-${index}`}
                    className="bg-muted rounded-lg p-4 text-center"
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
          </div>
        )}
      {(!statistics.frequency_distribution ||
        statistics.frequency_distribution.length === 0) && (
        <div className="mb-8 rounded-lg bg-card p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-muted-foreground">
            Maintenance Frequency Distribution
          </h2>
          <p className="text-sm text-muted-foreground">
            No frequency data is available for this property yet.
          </p>
        </div>
      )}

      {/* Average Completion Times - Using avg_completion_times data */}
      {statistics.avg_completion_times &&
        Object.keys(statistics.avg_completion_times).length > 0 && (
          <div className="bg-card rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold text-muted-foreground mb-4">
              Average Completion Times
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(statistics.avg_completion_times).map(
                ([frequency, avgDays]) => (
                  <div
                    key={frequency}
                    className="bg-muted rounded-lg p-4 text-center"
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
          </div>
        )}
      {(!statistics.avg_completion_times ||
        Object.keys(statistics.avg_completion_times).length === 0) && (
        <div className="mb-8 rounded-lg bg-card p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-muted-foreground">
            Average Completion Times
          </h2>
          <p className="text-sm text-muted-foreground">
            Completion timing will appear after tasks have been completed.
          </p>
        </div>
      )}

      {/* Enhanced Upcoming Maintenance Section */}
      <div className="bg-card rounded-lg shadow mb-8">
        <div className="border-b px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-muted-foreground">
              Upcoming Maintenance
            </h2>
            <div className="flex flex-wrap items-center gap-3 sm:space-x-4">
              <span className="text-sm text-muted-foreground">
                Total: {visibleUpcomingTotal} tasks
              </span>
              <div className="flex items-center space-x-2">
                <label className="text-sm text-muted-foreground">Show:</label>
                <select
                  value={upcomingPageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="text-sm border border-border rounded px-2 py-1"
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
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-muted-foreground">
              Loading upcoming maintenance...
            </p>
          </div>
        ) : upcomingError ? (
          <div className="p-8 text-center" role="alert">
            <p className="font-medium text-red-700">{upcomingError}</p>
            <button
              type="button"
              onClick={() => void fetchUpcomingMaintenance(upcomingPage, upcomingPageSize)}
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Try again
            </button>
          </div>
        ) : visibleUpcomingItems.length > 0 ? (
          <>
            <div className="divide-y divide-border md:hidden">
              {visibleUpcomingItems.map((item: PreventiveMaintenance) => {
                const status = item.status || determinePMStatus(item);
                const title = getMaintenanceTitle(item);

                return (
                  <article key={item.pm_id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{title}</p>
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
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-semibold text-blue-700"
                      >
                        View
                      </Link>
                      {canOperate && status !== "completed" && (
                        <Link
                          href={`/dashboard/preventive-maintenance/edit/${item.pm_id}?complete=true`}
                          className="inline-flex min-h-11 items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white"
                        >
                          Complete
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-muted">
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
                <tbody className="bg-card divide-y divide-gray-200">
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
                        <tr key={item.pm_id} className="hover:bg-muted">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-medium text-blue-600">
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
                                <div className="h-10 w-10 rounded overflow-hidden border">
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
                                <div className="h-10 w-10 rounded overflow-hidden border">
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
                                className="text-blue-600 hover:text-blue-900"
                              >
                                View
                              </Link>
                              {canOperate && status !== "completed" && (
                                <Link
                                  href={`/dashboard/preventive-maintenance/edit/${item.pm_id}?complete=true`}
                                  className="text-green-600 hover:text-green-900"
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
              <div className="px-6 py-4 border-t bg-muted">
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
                      className="min-h-11 px-3 py-2 text-sm border border-border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
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
                              className={`min-h-11 min-w-11 px-3 py-2 text-sm border rounded ${
                                pageNum === upcomingPage
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "border-border hover:bg-muted"
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
                      className="min-h-11 px-3 py-2 text-sm border border-border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-6 text-center">
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
                  className="inline-block bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                >
                  Create New Task
                </Link>
              )}
              <Link
                href="/dashboard/preventive-maintenance"
                className="inline-block bg-muted text-muted-foreground px-4 py-2 rounded text-sm hover:bg-gray-200"
              >
                View All Tasks
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Quick Access */}
      <div className="bg-card rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-muted-foreground mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {canOperate && <Link
            href="/dashboard/preventive-maintenance/create"
            className="flex items-center p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-300"
          >
            <div className="p-2 rounded-full bg-blue-100 text-blue-600 mr-3">
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
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
            <span>Create New Task</span>
          </Link>}

          <Link
            href="/dashboard/preventive-maintenance?status=overdue"
            className="flex items-center p-4 border rounded-lg hover:bg-red-50 hover:border-red-300"
          >
            <div className="p-2 rounded-full bg-red-100 text-red-600 mr-3">
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
            <span>View Overdue Tasks</span>
          </Link>

          <Link
            href="/dashboard/preventive-maintenance?status=pending"
            className="flex items-center p-4 border rounded-lg hover:bg-yellow-50 hover:border-yellow-300"
          >
            <div className="p-2 rounded-full bg-yellow-100 text-yellow-600 mr-3">
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
            <span>View Upcoming Tasks</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
