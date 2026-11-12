"use client";
import { appCalendarDate } from '@/app/lib/date-time.mjs';
import { useAppTimeZone } from '@/app/lib/hooks/useAppTimeZone';
import { useCurrentTime } from '@/app/lib/hooks/useCurrentTime';

import { useMemo } from "react";

import { Job, STATUS_COLORS } from "@/app/lib/types";

import { format } from "date-fns";

import {
  jobIsPm,
  getJobRoomEntries,
  buildComparisonSnapshot,
  buildComparisonMetrics,
  buildUtilitySnapshot,
} from "@/app/lib/jobs-report-data";
import type { UtilityConsumptionRow } from "@/app/dashboard/utility-consumption/types";

import {
  UNASSIGNED_ROOM_KEY,
  ReportStatistics,
  RoomJobsSummaryRow,
  PRIORITY_COLORS,
  ROOMS_CHART_MAX,
  truncateRoomLabel,
} from "./jobs-report-config";

export function useJobsReportAnalytics({ filteredReportJobs, utilityRows }: { filteredReportJobs: Job[]; utilityRows: UtilityConsumptionRow[] }) {
  const appTimeZone = useAppTimeZone();
  const currentTime = useCurrentTime();
  const today = appCalendarDate(currentTime, appTimeZone).getTime();
  const roomsJobsSummary = useMemo((): RoomJobsSummaryRow[] => {
    const map = new Map<
      string,
      {
        displayName: string;
        roomId: string;
        jobCount: number;
        pmJobCount: number;
      }
    >();

    filteredReportJobs.forEach((job) => {
      const isPm = jobIsPm(job);
      const entries = getJobRoomEntries(job);
      if (entries.length === 0) {
        const cur = map.get(UNASSIGNED_ROOM_KEY) ?? {
          displayName: "No room linked",
          roomId: "—",
          jobCount: 0,
          pmJobCount: 0,
        };
        cur.jobCount += 1;
        if (isPm) cur.pmJobCount += 1;
        map.set(UNASSIGNED_ROOM_KEY, cur);
        return;
      }
      entries.forEach((r) => {
        const cur = map.get(r.key) ?? {
          displayName: r.displayName,
          roomId: r.roomId,
          jobCount: 0,
          pmJobCount: 0,
        };
        cur.jobCount += 1;
        if (isPm) cur.pmJobCount += 1;
        if (r.displayName) cur.displayName = r.displayName;
        if (r.roomId !== "—") cur.roomId = r.roomId;
        map.set(r.key, cur);
      });
    });

    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        displayName: v.displayName,
        roomId: v.roomId,
        jobCount: v.jobCount,
        pmJobCount: v.pmJobCount,
      }))
      .sort((a, b) => b.jobCount - a.jobCount);
  }, [filteredReportJobs]);

  /** Top rooms, reversed so highest count appears at top of horizontal bar chart. */
  const roomsChartData = useMemo(() => {
    const top = roomsJobsSummary.slice(0, ROOMS_CHART_MAX);
    return [...top].reverse().map((r) => {
      const pm = r.pmJobCount;
      const nonPm = Math.max(0, r.jobCount - pm);
      return {
        label: truncateRoomLabel(r.displayName),
        fullLabel: r.displayName,
        roomId: r.roomId,
        pm,
        nonPm,
        total: r.jobCount,
      };
    });
  }, [roomsJobsSummary]);

  const roomsChartHeight = useMemo(
    () => Math.min(720, 56 + Math.max(roomsChartData.length, 1) * 36),
    [roomsChartData.length],
  );

  /** Chronological month buckets for charts (statistics.jobsByMonth order is not sorted). */
  const jobsByMonthChart = useMemo(() => {
    const map = new Map<
      string,
      { sortKey: string; label: string; count: number }
    >();
    filteredReportJobs.forEach((job) => {
      const d = appCalendarDate(job.created_at, appTimeZone);
      const sortKey = format(d, "yyyy-MM");
      const label = format(d, "MMM yyyy");
      const cur = map.get(sortKey);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(sortKey, { sortKey, label, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey),
    );
  }, [filteredReportJobs, appTimeZone]);

  const jobsAndNightSaleByMonthChart = useMemo(() => {
    const monthMap = new Map<
      string,
      { sortKey: string; label: string; jobs: number; nightSale: number }
    >();

    jobsByMonthChart.forEach((monthRow) => {
      monthMap.set(monthRow.sortKey, {
        sortKey: monthRow.sortKey,
        label: monthRow.label,
        jobs: monthRow.count,
        nightSale: 0,
      });
    });

    utilityRows.forEach((row) => {
      const monthDate = new Date(`${row.month} 1, ${row.year}`);
      if (Number.isNaN(monthDate.getTime())) return;

      const sortKey = format(monthDate, "yyyy-MM");
      const existing = monthMap.get(sortKey);
      if (existing) {
        existing.nightSale += Number(row.nightsale) || 0;
        return;
      }

      monthMap.set(sortKey, {
        sortKey,
        label: format(monthDate, "MMM yyyy"),
        jobs: 0,
        nightSale: Number(row.nightsale) || 0,
      });
    });

    const sorted = Array.from(monthMap.values()).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey),
    );
    const bySortKey = new Map(sorted.map((row) => [row.sortKey, row]));

    return sorted.map((row) => {
      const [yearStr, monthStr] = row.sortKey.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const prevYearKey = `${year - 1}-${String(month).padStart(2, "0")}`;
      const prevYearRow = bySortKey.get(prevYearKey);
      const jobsYoyPct =
        prevYearRow && prevYearRow.jobs !== 0
          ? ((row.jobs - prevYearRow.jobs) / prevYearRow.jobs) * 100
          : null;
      const nightSaleYoyPct =
        prevYearRow && prevYearRow.nightSale !== 0
          ? ((row.nightSale - prevYearRow.nightSale) / prevYearRow.nightSale) *
            100
          : null;
      return {
        ...row,
        jobsYoyPct,
        nightSaleYoyPct,
      };
    });
  }, [jobsByMonthChart, utilityRows]);

  const monthlyAndYearlyComparisons = useMemo(() => {
    const now = new Date(today);
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const previousYear = currentYear - 1;

    const inMonth = (date: Date, year: number, month: number) =>
      date.getFullYear() === year && date.getMonth() === month;

    const currentMonthJobs = filteredReportJobs.filter((job) =>
      inMonth(appCalendarDate(job.created_at, appTimeZone), currentYear, currentMonth),
    );
    const previousMonthJobs = filteredReportJobs.filter((job) =>
      inMonth(
        appCalendarDate(job.created_at, appTimeZone),
        previousMonthDate.getFullYear(),
        previousMonthDate.getMonth(),
      ),
    );
    const sameMonthLastYearJobs = filteredReportJobs.filter((job) =>
      inMonth(appCalendarDate(job.created_at, appTimeZone), previousYear, currentMonth),
    );
    const currentMonthUtilityRows = utilityRows.filter(
      (row) =>
        row.year === currentYear &&
        new Date(`${row.month} 1, ${row.year}`).getMonth() === currentMonth,
    );
    const previousMonthUtilityRows = utilityRows.filter(
      (row) =>
        row.year === previousMonthDate.getFullYear() &&
        new Date(`${row.month} 1, ${row.year}`).getMonth() ===
          previousMonthDate.getMonth(),
    );
    const sameMonthLastYearUtilityRows = utilityRows.filter(
      (row) =>
        row.year === previousYear &&
        new Date(`${row.month} 1, ${row.year}`).getMonth() === currentMonth,
    );

    const monthLabel = format(
      new Date(currentYear, currentMonth, 1),
      "MMMM yyyy",
    );
    const previousMonthLabel = format(previousMonthDate, "MMMM yyyy");
    const sameMonthLastYearLabel = format(
      new Date(previousYear, currentMonth, 1),
      "MMMM yyyy",
    );

    const currentSnapshot = buildComparisonSnapshot(currentMonthJobs);
    const previousMonthSnapshot = buildComparisonSnapshot(previousMonthJobs);
    const previousYearSnapshot = buildComparisonSnapshot(sameMonthLastYearJobs);
    const utilityCurrent = buildUtilitySnapshot(currentMonthUtilityRows);
    const utilityPreviousMonth = buildUtilitySnapshot(previousMonthUtilityRows);
    const utilityPreviousYear = buildUtilitySnapshot(
      sameMonthLastYearUtilityRows,
    );
    const safeRatio = (num: number, den: number) => (den > 0 ? num / den : 0);

    return {
      monthLabel,
      previousMonthLabel,
      sameMonthLastYearLabel,
      monthOverMonth: buildComparisonMetrics(
        currentSnapshot,
        previousMonthSnapshot,
      ),
      yearOverYear: buildComparisonMetrics(
        currentSnapshot,
        previousYearSnapshot,
      ),
      utility: {
        currentNightSale: utilityCurrent.nightsale,
        previousMonthNightSale: utilityPreviousMonth.nightsale,
        sameMonthLastYearNightSale: utilityPreviousYear.nightsale,
        monthOverMonthNightSale:
          utilityCurrent.nightsale - utilityPreviousMonth.nightsale,
        yearOverYearNightSale:
          utilityCurrent.nightsale - utilityPreviousYear.nightsale,
        nightSalePerJobOrder: safeRatio(
          utilityCurrent.nightsale,
          currentSnapshot.total,
        ),
        previousMonthNightSalePerJobOrder: safeRatio(
          utilityPreviousMonth.nightsale,
          previousMonthSnapshot.total,
        ),
        sameMonthLastYearNightSalePerJobOrder: safeRatio(
          utilityPreviousYear.nightsale,
          previousYearSnapshot.total,
        ),
        monthOverMonthNightSalePerJobOrder:
          safeRatio(utilityCurrent.nightsale, currentSnapshot.total) -
          safeRatio(
            utilityPreviousMonth.nightsale,
            previousMonthSnapshot.total,
          ),
        yearOverYearNightSalePerJobOrder:
          safeRatio(utilityCurrent.nightsale, currentSnapshot.total) -
          safeRatio(utilityPreviousYear.nightsale, previousYearSnapshot.total),
        nightSalePerPmJob: safeRatio(
          utilityCurrent.nightsale,
          currentSnapshot.pm,
        ),
      },
    };
  }, [filteredReportJobs, utilityRows, appTimeZone, today]);

  // Calculate comprehensive statistics (respects export filters)
  const statistics: ReportStatistics = useMemo(() => {
    const total = filteredReportJobs.length;
    const pmJobs = filteredReportJobs.filter((job) => jobIsPm(job)).length;
    const nonPmJobs = total - pmJobs;
    const completed = filteredReportJobs.filter(
      (job) => job.status === "completed",
    ).length;
    const inProgress = filteredReportJobs.filter(
      (job) => job.status === "in_progress",
    ).length;
    const pending = filteredReportJobs.filter(
      (job) => job.status === "pending",
    ).length;
    const cancelled = filteredReportJobs.filter(
      (job) => job.status === "cancelled",
    ).length;
    const waitingSparepart = filteredReportJobs.filter(
      (job) => job.status === "waiting_sparepart",
    ).length;
    const highPriority = filteredReportJobs.filter(
      (job) => job.priority === "high",
    ).length;
    const mediumPriority = filteredReportJobs.filter(
      (job) => job.priority === "medium",
    ).length;
    const lowPriority = filteredReportJobs.filter(
      (job) => job.priority === "low",
    ).length;

    const completionRate =
      total > 0 ? Math.round((completed / total) * 100) : 0;

    // Calculate average response time
    const completedJobDates = filteredReportJobs
      .filter((job) => job.status === "completed" && job.completed_at)
      .map(
        (job) =>
          new Date(job.completed_at!).getTime() -
          appCalendarDate(job.created_at, appTimeZone).getTime(),
      );

    const averageResponseTime =
      completedJobDates.length > 0
        ? Math.round(
            completedJobDates.reduce((sum, time) => sum + time, 0) /
              completedJobDates.length /
              (1000 * 60 * 60 * 24),
          )
        : 0;

    // Group jobs by month
    const jobsByMonth = filteredReportJobs.reduce(
      (acc, job) => {
        const month = format(appCalendarDate(job.created_at, appTimeZone), "MMM yyyy");
        const existing = acc.find((item) => item.month === month);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ month, count: 1 });
        }
        return acc;
      },
      [] as Array<{ month: string; count: number }>,
    );

    // Jobs by status
    const jobsByStatus = [
      { status: "Completed", count: completed, color: STATUS_COLORS.completed },
      {
        status: "In Progress",
        count: inProgress,
        color: STATUS_COLORS.in_progress,
      },
      { status: "Pending", count: pending, color: STATUS_COLORS.pending },
      { status: "Cancelled", count: cancelled, color: STATUS_COLORS.cancelled },
      {
        status: "Waiting Parts",
        count: waitingSparepart,
        color: STATUS_COLORS.waiting_sparepart,
      },
    ];

    return {
      total,
      pmJobs,
      nonPmJobs,
      completed,
      inProgress,
      pending,
      cancelled,
      waitingSparepart,
      highPriority,
      mediumPriority,
      lowPriority,
      completionRate,
      averageResponseTime,
      jobsByMonth,
      jobsByStatus,
    };
  }, [filteredReportJobs, appTimeZone]);

  const pmVsNonPmChartRows = useMemo(
    () => [
      { name: "PM", value: statistics.pmJobs, fill: "#7c3aed" },
      { name: "Non-PM", value: statistics.nonPmJobs, fill: "#0ea5e9" },
    ],
    [statistics.pmJobs, statistics.nonPmJobs],
  );

  const priorityChartRows = useMemo(
    () => [
      {
        name: "High",
        value: statistics.highPriority,
        fill: PRIORITY_COLORS.high,
      },
      {
        name: "Medium",
        value: statistics.mediumPriority,
        fill: PRIORITY_COLORS.medium,
      },
      { name: "Low", value: statistics.lowPriority, fill: PRIORITY_COLORS.low },
    ],
    [
      statistics.highPriority,
      statistics.mediumPriority,
      statistics.lowPriority,
    ],
  );

  return {
    roomsJobsSummary,
    roomsChartData,
    roomsChartHeight,
    jobsByMonthChart,
    jobsAndNightSaleByMonthChart,
    monthlyAndYearlyComparisons,
    statistics,
    pmVsNonPmChartRows,
    priorityChartRows,
  };
}
