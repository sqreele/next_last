import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canUseFeature,
  filterPlanNavigationItems,
} from "../app/lib/plan-capabilities.mjs";

const items = [
  { name: "Jobs", href: "/jobs" },
  { name: "PM", href: "/pm", requiredFeature: "preventive_maintenance" },
  { name: "Reports", href: "/reports", requiredFeature: "advanced_reports" },
  { name: "Properties", href: "/properties", requiredFeature: "multi_property" },
  { name: "Grants", href: "/grants", requiredFeature: "advanced_property_permissions" },
];

test("Basic navigation excludes commercial PM and reports", () => {
  assert.deepEqual(filterPlanNavigationItems(items, {}), [items[0]]);
});

test("Pro includes PM and reports but excludes Enterprise controls", () => {
  const features = { preventive_maintenance: true, advanced_reports: true };
  assert.deepEqual(filterPlanNavigationItems(items, features), items.slice(0, 3));
});

test("Enterprise includes implemented controls", () => {
  const features = {
    preventive_maintenance: true,
    advanced_reports: true,
    multi_property: true,
    advanced_property_permissions: true,
  };
  assert.deepEqual(filterPlanNavigationItems(items, features), items);
});

test("missing and portfolio capabilities fail closed", () => {
  assert.equal(canUseFeature(undefined, "csv_export"), false);
  assert.equal(canUseFeature({ portfolio_dashboard: false }, "portfolio_dashboard"), false);
});

test("direct-route denial offers a friendly pricing link", () => {
  const source = readFileSync(new URL("../app/components/subscription/PlanFeatureGate.tsx", import.meta.url), "utf8");
  assert.match(source, /This feature is not available on your current plan\./);
  assert.match(source, /href="\/pricing\/"/);
});
