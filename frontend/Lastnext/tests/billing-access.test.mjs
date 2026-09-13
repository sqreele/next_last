import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  canAccessBilling,
  filterBillingNavigationItems,
} from "../app/lib/billing-access.mjs";

const profile = (role, extra = {}) => ({
  memberships: role ? [{ role }] : [],
  is_platform_superuser: false,
  ...extra,
});

test("only admin and manager application roles can access billing", () => {
  assert.equal(canAccessBilling(profile("admin")), true);
  assert.equal(canAccessBilling(profile("manager")), true);
  for (const role of ["owner", "supervisor", "technician", "viewer", "billing", "other"]) {
    assert.equal(canAccessBilling(profile(role)), false, role);
  }
});

test("platform superuser retains explicit break-glass access", () => {
  assert.equal(
    canAccessBilling(profile(null, { is_platform_superuser: true })),
    true,
  );
});

test("billing navigation is hidden by default and shown only when authorized", () => {
  const items = [
    { name: "Overview", href: "/dashboard" },
    { name: "Billing", href: "/dashboard/billing", requiredCapability: "billing" },
  ];
  assert.deepEqual(
    filterBillingNavigationItems(items, false).map((item) => item.name),
    ["Overview"],
  );
  assert.deepEqual(
    filterBillingNavigationItems(items, true).map((item) => item.name),
    ["Overview", "Billing"],
  );
});

test("direct billing route fails closed on backend authorization", async () => {
  const page = await readFile(
    new URL("../app/dashboard/billing/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /authorizedBillingFetch\("tenant-subscriptions"/);
  assert.match(page, /response\.status === 403/);
  assert.match(page, /redirect\("\/dashboard"\)/);
  assert.match(page, /Authorization: `Bearer \$\{accessToken\}`/);
});
