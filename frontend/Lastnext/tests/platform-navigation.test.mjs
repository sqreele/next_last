import test from "node:test";
import assert from "node:assert/strict";
import { visiblePlatformNavigation } from "../app/lib/platform-navigation.mjs";

test("tenant-only users receive no platform navigation", () => {
  assert.deepEqual(visiblePlatformNavigation({ platform_capabilities: [] }), []);
});

test("support sees tenant and diagnostics-only navigation", () => {
  assert.deepEqual(visiblePlatformNavigation({ platform_capabilities: [
    "platform.tenants.read", "platform.support.read", "platform.billing.diagnostics.read",
  ] }).map((item) => item.href), ["/platform", "/platform/tenants", "/platform/webhook-events"]);
});

test("billing and super admins see their allowed platform navigation", () => {
  const billing = visiblePlatformNavigation({ platform_capabilities: [
    "platform.tenants.read", "platform.billing.read", "platform.usage.read", "platform.billing.diagnostics.read",
  ] });
  assert.equal(billing.length, 5);
  const superAdmin = visiblePlatformNavigation({ platform_capabilities: [
    "platform.tenants.read", "platform.billing.read", "platform.usage.read", "platform.billing.diagnostics.read", "platform.roles.manage",
  ] });
  assert.equal(superAdmin.length, 5);
});
