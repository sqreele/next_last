import assert from "node:assert/strict";
import test from "node:test";
import { aggregateReport, jobPeriod } from "../app/demo/report/analytics.mjs";

test("report groups creation dates using Bangkok month/year boundaries", () => {
  assert.deepEqual(jobPeriod({ created: "2025-12-31T18:00:00Z" }), { year: "2026", month: 1 });
  assert.equal(jobPeriod({ created: "invalid" }), null);
  assert.equal(jobPeriod({}), null);
});

test("report reconciles monthly and technician workload including cancelled and missing dates", () => {
  const result = aggregateReport([
    { created: "2026-01-01T00:00:00Z", technician: "A", status: "completed" },
    { created: "2026-01-20T00:00:00Z", technician: "A", status: "waiting_sparepart" },
    { created: "2026-02-01T00:00:00Z", technician: "B", status: "cancelled" },
    { technician: "B", status: "pending" },
  ]);
  assert.equal(result.monthly.length, 12);
  assert.deepEqual(result.monthly[0], { month: 1, total: 2, completed: 1, open: 1, cancelled: 0 });
  assert.deepEqual(result.monthly[1], { month: 2, total: 1, completed: 0, open: 0, cancelled: 1 });
  assert.equal(result.monthly[2].total, 0);
  assert.equal(result.undated, 1);
  assert.deepEqual(result.technicians[0], { name: "A", total: 2, completed: 1, open: 1, cancelled: 0 });
  assert.equal(result.technicians.reduce((sum, person) => sum + person.total, 0), 4);
  assert.equal(aggregateReport([]).technicians.length, 0);
});
