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
  trial_ends_at: null,
  grace_period_ends_at: null,
  cancel_at_period_end: false,
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
  assert.match(warning.message, /observe mode/);
  assert.doesNotMatch(warning.message, /currently read-only/);
  assert.match(warning.contact, /administrator/);
});

test("READ_ONLY warning explains hardened expiry reasons", () => {
  const cases = [
    ["trial_expired", /trial has ended/],
    ["active_period_expired", /paid subscription period has ended/],
    ["cancelled_period_ended", /cancelled subscription period has ended/],
    ["trial_end_missing", /trial end could not be verified/],
  ];
  for (const [reason_code, expected] of cases) {
    const warning = getSubscriptionWarning({
      ...base,
      entitlement_level: "READ_ONLY",
      reason_code,
      can_write: false,
    });
    assert.match(warning.message, expected);
  }
});
