import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const view = source("../app/dashboard/utility-consumption/UtilityConsumptionView.tsx");
const filters = source("../app/dashboard/utility-consumption/components/FiltersBar.tsx");
const summary = source("../app/dashboard/utility-consumption/components/SummaryCards.tsx");
const trend = source("../app/dashboard/utility-consumption/components/YoYLineChart.tsx");
const table = source("../app/dashboard/utility-consumption/components/UtilityRecordsTable.tsx");
const breakdown = source("../app/dashboard/utility-consumption/components/UtilityBreakdown.tsx");
const metricChart = source("../app/dashboard/utility-consumption/components/MetricLineChart.tsx");
const costChart = source("../app/dashboard/utility-consumption/components/ActualVsBudgetChart.tsx");
const dictionary = source("../app/lib/i18n/dictionary.ts");

test("page renders the professional header and KPI summary", () => {
  assert.match(view, /t\("utility\.title"\)/);
  assert.match(view, /<SummaryCards/);
  assert.match(summary, /utility\.recordedCost/);
  assert.match(summary, /utility\.electricityConsumption/);
  assert.match(summary, /utility\.waterConsumption/);
  assert.match(summary, /utility\.budgetVariance/);
});

test("electricity, water, and actual comparison data remain visible", () => {
  assert.match(breakdown, /utility\.electricity/);
  assert.match(breakdown, /utility\.water/);
  assert.match(summary, /CardComparisonLine/);
  assert.match(summary, /insight\.headline/);
  assert.match(table, /change\(row\.totalelectricity, previousCost\(row\)\)/);
});

test("existing year, month, and metric filters remain usable", () => {
  assert.match(filters, /onYearsChange/);
  assert.match(filters, /onPrimaryYearChange/);
  assert.match(filters, /onMonthChange/);
  assert.match(filters, /onMetricChange/);
  assert.match(filters, /aria-pressed/);
});

test("monthly trend and engineering records table render", () => {
  assert.match(view, /<YoYLineChart/);
  assert.match(trend, /utility\.monthlyTrend/);
  assert.match(view, /<UtilityRecordsTable/);
  assert.match(table, /utility\.monthlyRecords/);
  assert.match(table, /sticky top-0/);
});

test("electricity and water consumption use separate unit-specific charts", () => {
  assert.match(view, /data=\{electricitySeries\}[\s\S]*?unit="kWh"/);
  assert.match(view, /data=\{waterSeries\}[\s\S]*?unit="m³"/);
  assert.doesNotMatch(metricChart, /electricitySeries[\s\S]*waterSeries|kWh[\s\S]*m³/);
  assert.match(metricChart, /unit=\{` \$\{unit\}`\}/);
});

test("cost comparison uses only the common THB currency", () => {
  assert.match(costChart, /dataKey="totalelectricity"/);
  assert.match(costChart, /dataKey="electricity_cost_budget"/);
  assert.match(costChart, /unit=" THB"/);
  assert.doesNotMatch(costChart, /kWh|m³/);
});

test("table headings carry engineering units while cells preserve raw values", () => {
  assert.match(table, /utility\.totalKwh[\s\S]*\(kWh\)/);
  assert.match(table, /utility\.water[\s\S]*\(m³\)/);
  assert.match(table, /utility\.electricityCost[\s\S]*\(THB\)/);
  assert.match(table, /number\.format\(row\.totalkwh\)/);
  assert.match(table, /number\.format\(row\.water\)/);
});

test("unsupported utility types and fabricated occupancy KPIs are absent", () => {
  const active = `${view}\n${summary}\n${breakdown}\n${table}`;
  assert.doesNotMatch(active, /Gas|Diesel|LPG|efficiency score|performance rating/i);
  assert.doesNotMatch(view, /occupiedRoom|roomsSold|costPerRoom|kwhPerRoom/i);
  assert.match(view, /utility\.futureEnhancement/);
});

test("loading, empty, property-required, and safe error states render", () => {
  assert.match(view, /DashboardKpiSkeleton/);
  assert.match(view, /SkeletonTable/);
  assert.match(view, /utility\.noData/);
  assert.match(view, /utility\.selectPropertyHint/);
  assert.match(view, /utility\.loadError/);
  assert.doesNotMatch(view, /\{error\}/);
});

test("English and Thai utility labels are present", () => {
  assert.match(dictionary, /'utility\.title': 'Utility Consumption'/);
  assert.match(dictionary, /'utility\.title': 'การใช้สาธารณูปโภค'/);
  assert.match(dictionary, /'utility\.monthlyTrend': 'Monthly trend'/);
  assert.match(dictionary, /'utility\.monthlyTrend': 'แนวโน้มรายเดือน'/);
  assert.match(dictionary, /'utility\.noData': 'No utility data available'/);
  assert.match(dictionary, /'utility\.noData': 'ไม่มีข้อมูลสาธารณูปโภค'/);
});

test("mobile layout keeps filters and records available without accidental overflow", () => {
  assert.match(filters, /grid-cols-1/);
  assert.match(filters, /sm:grid-cols-2/);
  assert.match(table, /md:hidden/);
  assert.match(table, /hidden max-h-\[32rem\] overflow-auto md:block/);
  assert.doesNotMatch(view, /overflow-x-auto/);
});
