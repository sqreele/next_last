import { describe, expect, it } from "vitest";
import type { Job, User } from "@/app/lib/types";
import type { UtilityConsumptionRow } from "@/app/dashboard/utility-consumption/types";
import {
  buildComparisonMetrics,
  buildComparisonSnapshot,
  buildUtilitySnapshot,
  filterJobsForReport,
  getJobUserKey,
} from "./jobs-report-domain";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    job_id: "JOB-1",
    description: "Inspect air conditioner",
    status: "pending",
    priority: "medium",
    created_at: "2026-08-09T10:30:00",
    updated_at: "2026-08-09T10:30:00",
    completed_at: null,
    user: 7,
    ...overrides,
  };
}

function makeUtilityRow(overrides: Partial<UtilityConsumptionRow> = {}): UtilityConsumptionRow {
  return {
    month: "August",
    year: 2026,
    totalkwh: 0,
    onpeakkwh: 0,
    offpeakkwh: 0,
    totalelectricity: 0,
    electricity_cost_budget: 0,
    water: 0,
    nightsale: 0,
    ...overrides,
  };
}

describe("jobs report domain", () => {
  it("keeps the established stable user keys", () => {
    const user: User = {
      id: "42",
      username: "engineer",
      email: null,
      profile_image: null,
      positions: "Technician",
      properties: [],
      accessToken: "",
      refreshToken: "",
      created_at: "2026-08-09T00:00:00Z",
    };
    expect(getJobUserKey(null)).toBeNull();
    expect(getJobUserKey(7)).toBe("7");
    expect(getJobUserKey(user)).toBe("42");
  });

  it("preserves combined report filters and inclusive local dates", () => {
    const matching = makeJob({
      topics: [{ id: 3, title: "HVAC", description: null }],
      is_preventivemaintenance: true,
    });
    const wrongPriority = makeJob({ id: 2, job_id: "JOB-2", priority: "high" });

    const result = filterJobsForReport(
      [matching, wrongPriority],
      "pending",
      "medium",
      "pm",
      "3",
      "7",
      "8",
      "2026",
      "2026-08-09",
      "2026-08-09",
    );

    expect(result).toEqual([matching]);
  });

  it("keeps comparison behavior when the previous value is zero", () => {
    const current = buildComparisonSnapshot([
      makeJob({ is_preventivemaintenance: true }),
      makeJob({ id: 2, job_id: "JOB-2" }),
    ]);
    const metrics = buildComparisonMetrics(current, { total: 0, pm: 0, nonPm: 0 });

    expect(current).toEqual({ total: 2, pm: 1, nonPm: 1 });
    expect(metrics.map((metric) => metric.deltaPct)).toEqual([null, null, null]);
  });

  it("aggregates utility totals", () => {
    expect(buildUtilitySnapshot([
      makeUtilityRow({ nightsale: 10, water: 2.5, totalkwh: 30 }),
      makeUtilityRow({ nightsale: 5 }),
    ])).toEqual({ nightsale: 15, water: 2.5, totalkwh: 30 });
  });
});
