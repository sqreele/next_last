import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  new URL("../app/dashboard/ImprovedDashboard.tsx", import.meta.url),
  "utf8",
);

test("weekly maintenance activity uses an accessible line chart", () => {
  assert.match(dashboard, /<LineChart/);
  assert.match(dashboard, /<Line[\s\S]*?dataKey="count"/);
  assert.match(dashboard, /<ReferenceDot/);
  assert.match(dashboard, /dashboard\.weeklyChartLabel/);
  assert.doesNotMatch(dashboard, /className="sneat-bars"/);
});

test("priority UX highlights escalation and uses a consistent denominator", () => {
  const prioritySection = dashboard.slice(
    dashboard.indexOf('sneat-priority-card'),
    dashboard.indexOf('{/* Status distribution'),
  );
  assert.match(prioritySection, /sneat-priority-alert--active/);
  assert.match(prioritySection, /dashboard\.criticalNeedsAttention/);
  assert.match(prioritySection, /sneat-priority-distribution/);
  assert.match(prioritySection, /role="progressbar"/);
  assert.match(prioritySection, /count \/ metrics\.priorityTotal/);
  assert.doesNotMatch(
    prioritySection,
    /const percentage = metrics\.total > 0 \? Math\.round\(\(count \/ metrics\.total\)/,
  );
});
