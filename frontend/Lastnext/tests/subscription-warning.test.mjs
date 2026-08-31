import assert from "node:assert/strict";
import test from "node:test";

import { getSubscriptionWarning } from "../app/lib/subscription-warning.mjs";

const base = {
  tenant_id: "TSAFE",
  status: "active",
  can_read: true,
  can_write: true,
  can_manage_billing: false,
  reason_code: "subscription_active",
  grace_ends_at: null,
  current_period_end: null,
  enforcement_mode: "observe",
};

test("FULL entitlement renders no warning", () => {
  assert.equal(getSubscriptionWarning({ ...base, entitlement_level: "FULL" }), null);
});

test("GRACE warning uses backend deadline and billing-role support copy", () => {
  const warning = getSubscriptionWarning({
    ...base,
    entitlement_level: "GRACE",
    status: "past_due",
    grace_ends_at: "2026-09-03T10:00:00Z",
    can_manage_billing: true,
  }, "Sep 3, 2026");
  assert.match(warning.message, /Sep 3, 2026/);
  assert.match(warning.contact, /StayMaint support/);
});

test("READ_ONLY observe copy does not falsely claim writes are blocked", () => {
  const warning = getSubscriptionWarning({
    ...base,
    entitlement_level: "READ_ONLY",
    status: "suspended",
    can_write: false,
  });
  assert.match(warning.message, /restrictions may apply/);
  assert.doesNotMatch(warning.message, /currently read-only/);
  assert.match(warning.contact, /administrator/);
});
