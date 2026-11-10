"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMainStore, useProperties, useUser } from "@/app/lib/stores/mainStore";
import { useSession } from "@/app/lib/session.client";
import { usePlanCapabilities } from "@/app/lib/hooks/usePlanCapabilities";
import { Job, JobStatus, JobPriority } from "@/app/lib/types";
import { fetchAllJobsForPropertyWithSession } from "@/app/lib/api-client";
import { format } from "date-fns";

import {
  type PmFilterType,
  type TopicFilterValue,
  type UserFilterValue,
  getJobUserKey,
  getReportUserLabel,
  DEFAULT_REPORT_TIMEZONE,
  getReportDateParts,
  filterJobsForReport,
} from "@/app/lib/jobs-report-data";
import type { UtilityConsumptionRow } from "@/app/dashboard/utility-consumption/types";

import {
  assertJobsReportPropertyBoundary,
  isCurrentJobsReportRequest,
  type JobsReportFilters,
} from "@/app/lib/jobs-report.mjs";

import { JobsReportProps, EMPTY_JOBS } from "./jobs-report-config";
import { useJobsReportAnalytics } from "./useJobsReportAnalytics";
import { useJobsReportExports } from "./useJobsReportExports";

export function useJobsReportModel({
  jobs = EMPTY_JOBS,
  filter = "all",
}: JobsReportProps) {
  const { canUseFeature } = usePlanCapabilities();
  const { data: session, status: sessionStatus } = useSession();
  const { selectedPropertyId: selectedProperty } = useUser();
  const { properties: userProperties } = useProperties();

  const [isGeneratingCsv, setIsGeneratingCsv] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [reportJobs, setReportJobs] = useState<Job[]>([]);
  const [loadedPropertyId, setLoadedPropertyId] = useState<string | null>(null);
  const [utilityRows, setUtilityRows] = useState<UtilityConsumptionRow[]>([]);
  const [utilityLoading, setUtilityLoading] = useState(false);
  const [utilityError, setUtilityError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<JobPriority | "all">(
    "all",
  );
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [pmFilter, setPmFilter] = useState<PmFilterType>("all");
  const [topicFilter, setTopicFilter] = useState<TopicFilterValue>("all");
  const [userFilter, setUserFilter] = useState<UserFilterValue>("all");
  const [monthFilter, setMonthFilter] = useState<"all" | string>("all");
  const [yearFilter, setYearFilter] = useState<"all" | string>("all");
  const reportRequestIdRef = useRef(0);
  const reportControllerRef = useRef<AbortController | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const exportInFlightRef = useRef(false);
  const currentProperty = useMemo(() => {
    if (!selectedProperty) return null;
    return (
      userProperties.find((p) => p.property_id === selectedProperty) || null
    );
  }, [selectedProperty, userProperties]);
  const reportTimezone = currentProperty?.timezone || DEFAULT_REPORT_TIMEZONE;
  const visibleReportJobs = useMemo(
    () => (loadedPropertyId === selectedProperty ? reportJobs : []),
    [loadedPropertyId, reportJobs, selectedProperty],
  );

  const topicFilterOptions = useMemo(() => {
    const byId = new Map<number, { id: number; title: string }>();
    visibleReportJobs.forEach((job) => {
      job.topics?.forEach((t) => {
        if (t == null || t.id == null) return;
        const id = Number(t.id);
        if (Number.isNaN(id)) return;
        const title = (t.title && String(t.title).trim()) || `Topic ${id}`;
        if (!byId.has(id)) byId.set(id, { id, title });
      });
    });
    return Array.from(byId.values()).sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
  }, [visibleReportJobs]);

  const jobsWithNoTopicCount = useMemo(
    () => visibleReportJobs.filter((j) => !j.topics?.length).length,
    [visibleReportJobs],
  );

  const jobsWithNoUserCount = useMemo(
    () => visibleReportJobs.filter((j) => getJobUserKey(j.user) === null).length,
    [visibleReportJobs],
  );

  const userFilterOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    visibleReportJobs.forEach((job) => {
      const key = getJobUserKey(job.user);
      if (!key || byKey.has(key)) return;
      byKey.set(
        key,
        getReportUserLabel(job.user, session?.user),
      );
    });
    return Array.from(byKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
      );
  }, [visibleReportJobs, session?.user]);

  const stableProvidedJobs = jobs;

  const filteredReportJobs = useMemo(
    () =>
      filterJobsForReport(
        visibleReportJobs,
        statusFilter,
        priorityFilter,
        pmFilter,
        topicFilter,
        userFilter,
        monthFilter,
        yearFilter,
        createdFrom,
        createdTo,
        searchFilter,
        reportTimezone,
      ),
    [
      visibleReportJobs,
      statusFilter,
      priorityFilter,
      pmFilter,
      topicFilter,
      userFilter,
      monthFilter,
      yearFilter,
      createdFrom,
      createdTo,
      searchFilter,
      reportTimezone,
    ],
  );

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filteredReportJobs.length / pageSize));
  const paginatedReportJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReportJobs.slice(start, start + pageSize);
  }, [currentPage, filteredReportJobs]);

  const dateRangeInvalid = Boolean(
    createdFrom && createdTo && createdFrom > createdTo,
  );

  const activeFilters: JobsReportFilters = {
    status: statusFilter,
    priority: priorityFilter,
    pm: pmFilter,
    topic: topicFilter,
    user: userFilter,
    month: monthFilter,
    year: yearFilter,
    createdFrom,
    createdTo,
    search: searchFilter,
  };

  const yearFilterOptions = useMemo(() => {
    const years = new Set<number>();
    visibleReportJobs.forEach((job) => {
      const date = getReportDateParts(job.created_at, reportTimezone);
      if (date) years.add(Number(date.year));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [reportTimezone, visibleReportJobs]);

  const monthFilterOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1),
        label: format(new Date(2020, i, 1), "MMMM"),
      })),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadUtilityRows() {
      if (!selectedProperty) {
        setUtilityRows([]);
        setUtilityError(null);
        setUtilityLoading(false);
        return;
      }
      try {
        setUtilityLoading(true);
        setUtilityError(null);
        const params = new URLSearchParams();
        params.set("property_id", String(selectedProperty));
        params.set("page_size", "1000");
        const res = await fetch(
          `/api/utility/consumption?${params.toString()}`,
          {
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          throw new Error("Unable to load utility consumption for comparison.");
        }
        const payload: UtilityConsumptionRow[] = await res.json();
        if (
          !controller.signal.aborted &&
          useMainStore.getState().selectedPropertyId === selectedProperty
        ) {
          setUtilityRows(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setUtilityRows([]);
        setUtilityError(
          error instanceof Error
            ? error.message
            : "Unable to load utility consumption.",
        );
      } finally {
        if (!controller.signal.aborted) setUtilityLoading(false);
      }
    }

    loadUtilityRows();
    return () => controller.abort();
  }, [selectedProperty]);

  useEffect(() => {
    if (topicFilter === "none" && jobsWithNoTopicCount === 0) {
      setTopicFilter("all");
      return;
    }
    if (topicFilter === "all" || topicFilter === "none") return;
    const ok = topicFilterOptions.some((t) => String(t.id) === topicFilter);
    if (!ok) setTopicFilter("all");
  }, [topicFilter, topicFilterOptions, jobsWithNoTopicCount]);

  useEffect(() => {
    if (userFilter === "none" && jobsWithNoUserCount === 0) {
      setUserFilter("all");
      return;
    }
    if (userFilter === "all" || userFilter === "none") return;
    const ok = userFilterOptions.some((u) => u.key === userFilter);
    if (!ok) setUserFilter("all");
  }, [userFilter, userFilterOptions, jobsWithNoUserCount]);

  const { roomsJobsSummary, roomsChartData, roomsChartHeight, jobsByMonthChart, jobsAndNightSaleByMonthChart, monthlyAndYearlyComparisons, statistics, pmVsNonPmChartRows, priorityChartRows } = useJobsReportAnalytics({
    filteredReportJobs,
    utilityRows,
  });

  useEffect(() => {
    reportControllerRef.current?.abort();
    exportControllerRef.current?.abort();
    reportRequestIdRef.current += 1;
    setReportJobs([]);
    setLoadedPropertyId(null);
    setReportError(null);
    setExportError(null);
    setCurrentPage(1);
    setSearchFilter("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setPmFilter("all");
    setTopicFilter("all");
    setUserFilter("all");
    setMonthFilter("all");
    setYearFilter("all");
    setCreatedFrom("");
    setCreatedTo("");
  }, [selectedProperty]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    statusFilter,
    priorityFilter,
    pmFilter,
    topicFilter,
    userFilter,
    monthFilter,
    yearFilter,
    createdFrom,
    createdTo,
    searchFilter,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Load the complete authorized Property projection once for analytics.
  useEffect(() => {
    if (!selectedProperty || sessionStatus === "loading") return;
    if (!session?.user) {
      setLoading(false);
      setReportError("Authentication is required to load this report.");
      return;
    }

    const requestPropertyId = selectedProperty;
    const requestId = ++reportRequestIdRef.current;
    const controller = new AbortController();
    reportControllerRef.current?.abort();
    reportControllerRef.current = controller;
    setReportJobs([]);
    setLoadedPropertyId(null);
    setReportError(null);
    setLoading(true);

    const loadPropertyJobs = async () => {
      try {
        const propertyJobs =
          stableProvidedJobs.length > 0
            ? stableProvidedJobs
            : await fetchAllJobsForPropertyWithSession<Job>(
                requestPropertyId,
                controller.signal,
              );
        const scopedJobs = assertJobsReportPropertyBoundary(
          propertyJobs,
          requestPropertyId,
        );
        const isCurrent = isCurrentJobsReportRequest({
          requestId,
          currentRequestId: reportRequestIdRef.current,
          requestPropertyId,
          currentPropertyId: useMainStore.getState().selectedPropertyId,
        });
        if (!controller.signal.aborted && isCurrent) {
          setReportJobs(scopedJobs);
          setLoadedPropertyId(requestPropertyId);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (requestId !== reportRequestIdRef.current) return;
        setReportJobs([]);
        setLoadedPropertyId(null);
        setReportError(
          error instanceof Error ? error.message : "Unable to load report.",
        );
      } finally {
        if (!controller.signal.aborted && requestId === reportRequestIdRef.current) {
          setLoading(false);
        }
      }
    };

    void loadPropertyJobs();
    return () => controller.abort();
  }, [
    reloadKey,
    selectedProperty,
    sessionStatus,
    stableProvidedJobs,
    session?.user,
  ]);

  const { handleGenerateCSV, handleGenerateExcel, handleGeneratePdf } = useJobsReportExports({
    currentProperty,
    selectedProperty,
    statusFilter,
    priorityFilter,
    pmFilter,
    topicFilter,
    userFilter,
    monthFilter,
    yearFilter,
    createdFrom,
    createdTo,
    searchFilter,
    exportInFlightRef,
    dateRangeInvalid,
    filteredReportJobs,
    isGeneratingCsv,
    activeFilters,
    exportControllerRef,
    setExportError,
    setIsGeneratingCsv,
    setIsGeneratingExcel,
    userProperties,
    statistics,
    setIsGeneratingPdf,
  });

  return {
    sessionStatus,
    session,
    selectedProperty,
    userProperties,
    loading,
    loadedPropertyId,
    reportError,
    currentProperty,
    setReloadKey,
    filter,
    filteredReportJobs,
    visibleReportJobs,
    handleGenerateExcel,
    isGeneratingExcel,
    handleGeneratePdf,
    isGeneratingPdf,
    canUseFeature,
    handleGenerateCSV,
    dateRangeInvalid,
    isGeneratingCsv,
    exportError,
    searchFilter,
    setSearchFilter,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    pmFilter,
    setPmFilter,
    topicFilter,
    setTopicFilter,
    jobsWithNoTopicCount,
    topicFilterOptions,
    userFilter,
    setUserFilter,
    jobsWithNoUserCount,
    userFilterOptions,
    createdFrom,
    setCreatedFrom,
    createdTo,
    setCreatedTo,
    monthFilter,
    setMonthFilter,
    monthFilterOptions,
    yearFilter,
    setYearFilter,
    yearFilterOptions,
    setExportError,
    setCurrentPage,
    currentPage,
    pageSize,
    paginatedReportJobs,
    totalPages,
    statistics,
    jobsByMonthChart,
    jobsAndNightSaleByMonthChart,
    monthlyAndYearlyComparisons,
    utilityLoading,
    utilityError,
    pmVsNonPmChartRows,
    priorityChartRows,
    roomsJobsSummary,
    roomsChartHeight,
    roomsChartData,
  };
}

export type JobsReportModel = ReturnType<typeof useJobsReportModel>;
