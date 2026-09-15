import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/components/platform/TenantDetailClient.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/platform/tenants/[tenantId]/page.tsx", import.meta.url), "utf8");

test("tenant detail has operator header, lifecycle, and accessible sections", () => {
  for (const value of ["Tenant ID:", "Subscription lifecycle", "Overview", "Properties", "Users", "Billing", "Usage", "Diagnostics"]) assert.match(source, new RegExp(value));
  assert.match(source, /aria-label="Tenant detail sections"/);
  assert.match(page, /getLifecycleDisplay/);
});

test("memberships prefer human-readable identity and remain responsive", () => {
  assert.match(source, /member\.display_name \|\| member\.email \|\| member\.user/);
  assert.match(source, /title=\{primary\}/);
  assert.match(source, /<Table mobileCards>/);
  assert.match(source, /Search users/);
  assert.match(source, /All Properties/);
  assert.match(source, /No memberships found/);
  assert.match(source, /Active/);
  assert.match(source, /Inactive/);
});

test("billing stays read-only and surfaces test-mode safely", () => {
  assert.match(source, /Read-only billing/);
  assert.match(source, /Stripe test mode is active/);
  assert.match(source, /Customer bound/);
  assert.doesNotMatch(source, /external_customer_id/);
});
