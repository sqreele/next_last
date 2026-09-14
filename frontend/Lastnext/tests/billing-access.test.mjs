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

test("unknown, loading, missing, and inactive membership states fail closed", () => {
  assert.equal(canAccessBilling(undefined), false);
  assert.equal(canAccessBilling(null), false);
  assert.equal(canAccessBilling({ memberships: [], is_platform_superuser: false }), false);
  assert.equal(
    canAccessBilling({
      memberships: [{ role: "admin", is_active: false }],
      is_platform_superuser: false,
    }),
    false,
  );
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
    {
      name: "Billing",
      href: "/dashboard/settings/billing",
      requiredCapability: "billing",
    },
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

test("every desktop, mobile, tablet, and AI navigation surface filters billing", async () => {
  const paths = [
    "../app/dashboard/layout.tsx",
    "../app/components/ui/mobile-nav.tsx",
    "../app/components/ui/tablet-nav.tsx",
    "../app/components/ai/AiChatDesktopNav.tsx",
    "../app/components/ai/AiChatMobileMenu.tsx",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /useBillingAccess/);
    assert.match(source, /filterBillingNavigation/);
  }
});

test("both billing routes fail closed through the server-side backend guard", async () => {
  const canonicalPage = await readFile(
    new URL("../app/dashboard/settings/billing/page.tsx", import.meta.url),
    "utf8",
  );
  const aliasPage = await readFile(
    new URL("../app/dashboard/billing/page.tsx", import.meta.url),
    "utf8",
  );
  const successPage = await readFile(
    new URL("../app/dashboard/settings/billing/success/page.tsx", import.meta.url),
    "utf8",
  );
  const guard = await readFile(
    new URL("../app/lib/billing-access.server.ts", import.meta.url),
    "utf8",
  );
  for (const source of [canonicalPage, aliasPage, successPage]) {
    assert.match(source, /await requireBillingAccess\(\)/);
  }
  assert.match(guard, /api\/v1\/tenant-subscriptions/);
  assert.match(guard, /response\.status === 403/);
  assert.match(guard, /redirect\("\/dashboard\/unauthorized"\)/);
  assert.match(guard, /Authorization: `Bearer \$\{accessToken\}`/);
});

test("billing BFF requests only the billing-scoped tenant collection", async () => {
  const route = await readFile(
    new URL("../app/api/billing/[action]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /tenants: "\/api\/v1\/tenants\/billing\/"/);
  assert.doesNotMatch(route, /tenants: "\/api\/v1\/tenants\/"/);
});
