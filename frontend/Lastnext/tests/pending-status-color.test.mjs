import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("pending job status uses the shared orange treatment across UI surfaces", () => {
  const config = read("app/design-system/status-config.ts");
  const chartColors = read("app/design-system/status-colors.ts");
  const dashboard = read("app/dashboard/ImprovedDashboard.tsx");
  const mobileKpis = read("app/components/dashboard/MobileKpiStrip.tsx");
  const jobsContent = read("app/dashboard/JobsContent.tsx");
  const styles = read("app/globals.css");

  assert.match(config, /pending:[\s\S]*?bg-orange-50[\s\S]*?bg-orange-500/);
  assert.match(chartColors, /pending: "#F97316"/);
  assert.match(dashboard, /sneat-stat-card__icon--pending/);
  assert.match(mobileKpis, /tone: "pending"/);
  assert.match(jobsContent, /value: "pending",[\s\S]*?bg-orange-100 text-orange-700/);
  assert.match(jobsContent, /value === "pending"[\s\S]*?data-\[state=active\]:bg-orange-500/);
  assert.match(styles, /--status-pending-bg: #fff7ed/);
  assert.match(styles, /\.pcms-status-badge--pending[\s\S]*?var\(--status-pending-bg\)/);
});
