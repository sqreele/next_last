import test from "node:test";
import assert from "node:assert/strict";
import { canAccessPlatform, isPlatformUser } from "../app/lib/platform-access.mjs";

test("platform access is capability-based and fails closed", () => {
  assert.equal(canAccessPlatform(null, "platform.billing.read"), false);
  assert.equal(canAccessPlatform({ platform_capabilities: [] }, "platform.billing.read"), false);
  assert.equal(
    canAccessPlatform({ platform_capabilities: ["platform.billing.read"] }, "platform.billing.read"),
    true,
  );
});

test("platform user signal is separate from tenant billing roles", () => {
  assert.equal(isPlatformUser({ is_platform_user: false }), false);
  assert.equal(isPlatformUser({ is_platform_user: true, memberships: [{ role: "admin" }] }), true);
});
