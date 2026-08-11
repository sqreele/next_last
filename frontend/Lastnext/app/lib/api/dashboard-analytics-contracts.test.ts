import { describe, expect, it } from "vitest";
import {
  aggregateStatus,
  aggregateTopUsers,
  aggregateTopics,
  applyMonthYearFilter,
  buildCardSummary,
} from "@/app/dashboard/chartdashboard/utils/dashboardAggregate";
import {
  dashboardSummaryQueryString,
  isDashboardSummaryResponse,
  isJobDashboardStats,
  type DashboardSummaryResponse,
} from "./dashboard-analytics-contracts";

const summary: DashboardSummaryResponse = {
  totalJobs: 5,
  pmJobs: 2,
  nonPmJobs: 3,
  completionRate: 40,
  trendByMonth: [{ month: "Jul", year: 2026, jobs: 2 }, { month: "Aug", year: 2026, jobs: 3 }],
  pmNonPmByMonth: [
    { month: "Jul", year: 2026, pm: 1, nonPm: 1 },
    { month: "Aug", year: 2026, pm: 1, nonPm: 2 },
  ],
  statusByMonth: [
    { month: "Aug", year: 2026, status: "Completed", count: 2 },
    { month: "Aug", year: 2026, status: "Waiting Sparepart", count: 1 },
    { month: "Aug", year: 2026, status: "Waiting Fix Defect", count: 0 },
  ],
  topUsersByMonth: [{ month: "Aug", year: 2026, user: "Jane Engineer", pm: 1, nonPm: 2 }],
  topicsByMonth: [{
    month: "Aug", year: 2026, topic: "Electrical", count: 3,
    pm: 1, nonPm: 2, isPreventive: true,
  }],
};

describe("dashboard analytics backend contracts", () => {
  it("accepts the canonical KPI summary and required count fields", () => {
    expect(isDashboardSummaryResponse(summary)).toBe(true);
    expect(summary.totalJobs).toBe(5);
  });

  it("keeps completion percentage as a finite JSON number", () => {
    expect(isDashboardSummaryResponse({ ...summary, completionRate: 33.333333 })).toBe(true);
    expect(isDashboardSummaryResponse({ ...summary, completionRate: "40" })).toBe(false);
  });

  it("distinguishes zero from invalid null metrics", () => {
    expect(isDashboardSummaryResponse({ ...summary, completionRate: 0 })).toBe(true);
    expect(isDashboardSummaryResponse({ ...summary, completionRate: null })).toBe(false);
  });

  it("accepts the exact empty-data response without fabricating series", () => {
    const empty = {
      totalJobs: 0, pmJobs: 0, nonPmJobs: 0, completionRate: 0,
      trendByMonth: [], pmNonPmByMonth: [], statusByMonth: [],
      topUsersByMonth: [], topicsByMonth: [],
    };
    expect(isDashboardSummaryResponse(empty)).toBe(true);
    expect(buildCardSummary([], [])).toEqual({
      totalJobs: 0,
      pmJobs: 0,
      nonPmJobs: 0,
      completionRate: 0,
      statusTotals: [
        { name: "Completed", value: 0 },
        { name: "Waiting Sparepart", value: 0 },
        { name: "Waiting Fix Defect", value: 0 },
      ],
    });
  });

  it("uses only the supported property business-ID query", () => {
    expect(dashboardSummaryQueryString({ property_id: "P00000007" })).toBe("property_id=P00000007");
  });

  it("models the backend's analytics status labels including non-default status", () => {
    expect(aggregateStatus(summary.statusByMonth)).toEqual([
      { name: "Completed", value: 2 },
      { name: "Waiting Sparepart", value: 1 },
      { name: "Waiting Fix Defect", value: 0 },
    ]);
  });

  it("rejects stale or unknown status keys", () => {
    expect(isDashboardSummaryResponse({
      ...summary,
      statusByMonth: [{ month: "Aug", year: 2026, status: "verified", count: 1 }],
    })).toBe(false);
  });

  it("preserves backend trend order and filters at the chart adapter", () => {
    expect(applyMonthYearFilter(summary.trendByMonth, "Aug", 2026)).toEqual([
      { month: "Aug", year: 2026, jobs: 3 },
    ]);
  });

  it("uses explicit dashboard job-stat counts and accepts zero", () => {
    expect(isJobDashboardStats({
      total: 0, pending: 0, inProgress: 0, completed: 0,
      cancelled: 0, waitingSparepart: 0, defect: 0, preventiveMaintenance: 0,
    })).toBe(true);
  });

  it("rejects optional-everything job statistics", () => {
    expect(isJobDashboardStats({ total: 3, pending: 1 })).toBe(false);
  });

  it("aggregates backend-dynamic user labels deterministically", () => {
    expect(aggregateTopUsers([
      ...summary.topUsersByMonth,
      { ...summary.topUsersByMonth[0], month: "Jul", pm: 2, nonPm: 0 },
    ])).toEqual([{ name: "Jane Engineer", pm: 3, nonPm: 2 }]);
  });

  it("keeps topic aggregates separate from their API points", () => {
    expect(aggregateTopics(summary.topicsByMonth)).toEqual([
      { topic: "Electrical", count: 3, pm: 1, nonPm: 2, isPreventive: true },
    ]);
  });
});
