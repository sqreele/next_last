import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLATFORM_FEATURES,
  featureStatus,
  formatStorage,
  usageDisplay,
} from "../app/lib/platform-plans.mjs";

const capabilities = {
  starter: {},
  pro: { preventive_maintenance: true, pm_schedules: true, technician_kpi: true, advanced_reports: true, csv_export: true },
  enterprise: { preventive_maintenance: true, pm_schedules: true, technician_kpi: true, advanced_reports: true, csv_export: true, multi_property: true, advanced_property_permissions: true },
};
const plans = [
  { code: "starter", name: "Basic", monthly_price: "15.00", max_users: 4, max_properties: 1 },
  { code: "pro", name: "Pro", monthly_price: "30.00", max_users: 10, max_properties: 1 },
  { code: "enterprise", name: "Enterprise", monthly_price: "60.00", max_users: 50, max_properties: 5 },
].map((plan) => ({ ...plan, max_monthly_work_orders: 500, max_pm_schedules: 100, max_assets: 250, max_storage_mb: 10240, features: { ...capabilities[plan.code], portfolio_dashboard: false } }));

const feature = (key) => PLATFORM_FEATURES.find((item) => item.key === key);

test("canonical backend plan response presents current prices, capacities, and quotas", () => {
  assert.deepEqual(plans.map((plan) => [plan.code, plan.monthly_price]), [["starter", "15.00"], ["pro", "30.00"], ["enterprise", "60.00"]]);
  assert.deepEqual(plans.map((plan) => plan.max_users), [4, 10, 50]);
  assert.deepEqual(plans.map((plan) => plan.max_properties), [1, 1, 5]);
  for (const plan of plans) {
    assert.equal(plan.max_monthly_work_orders, 500);
    assert.equal(plan.max_pm_schedules, 100);
    assert.equal(plan.max_assets, 250);
    assert.equal(formatStorage(plan.max_storage_mb), "10 GB");
  }
  assert.equal(plans[0].code, "starter");
  assert.notEqual(plans[0].code, "basic");
});

test("capability presentation matches Basic, Pro, and Enterprise", () => {
  assert.equal(featureStatus(plans[0], feature("preventive_maintenance")), "— Not available");
  assert.equal(featureStatus(plans[1], feature("preventive_maintenance")), "✓ Available");
  assert.equal(featureStatus(plans[2], feature("preventive_maintenance")), "✓ Available");
  assert.equal(featureStatus(plans[0], feature("csv_export")), "— Not available");
  assert.equal(featureStatus(plans[1], feature("csv_export")), "✓ Available");
  assert.equal(featureStatus(plans[2], feature("csv_export")), "✓ Available");
  assert.equal(featureStatus(plans[0], feature("multi_property")), "— Not available");
  assert.equal(featureStatus(plans[1], feature("multi_property")), "— Not available");
  assert.equal(featureStatus(plans[2], feature("multi_property")), "✓ Available");
  assert.equal(featureStatus(plans[0], feature("advanced_property_permissions")), "— Not available");
  assert.equal(featureStatus(plans[1], feature("advanced_property_permissions")), "— Not available");
  assert.equal(featureStatus(plans[2], feature("advanced_property_permissions")), "✓ Available");
});

test("portfolio dashboard is always presented as coming soon, never enabled", () => {
  for (const plan of plans) assert.equal(featureStatus(plan, feature("portfolio_dashboard")), "Coming soon");
  assert.notEqual(featureStatus({ features: { portfolio_dashboard: true } }, feature("portfolio_dashboard")), "✓ Available");
});

test("usage presentation flags grandfathered over-limit tenants", () => {
  assert.deepEqual(usageDisplay(11, 10), { value: "11 / 10", overLimit: true });
  assert.deepEqual(usageDisplay(2, 1), { value: "2 / 1", overLimit: true });
  assert.deepEqual(usageDisplay(1331.2, 10240, { storage: true }), { value: "1.3 GB / 10 GB", overLimit: false });
});

test("active platform pages use backend plan projections and retain authorization guards", () => {
  const overview = readFileSync(new URL("../app/platform/page.tsx", import.meta.url), "utf8");
  const tenants = readFileSync(new URL("../app/platform/tenants/page.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/platform/tenants/[tenantId]/page.tsx", import.meta.url), "utf8");
  assert.match(overview, /data\.commercial_plans/);
  assert.match(overview, /requirePlatformAccess\("platform\.tenants\.read"\)/);
  assert.match(tenants, /requirePlatformAccess\("platform\.tenants\.read"\)/);
  assert.match(detail, /requirePlatformAccess\("platform\.tenants\.read"\)/);
});
