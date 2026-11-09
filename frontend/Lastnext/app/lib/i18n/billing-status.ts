import type { DictKey } from "./dictionary";

export const billingStatusKeys: Record<string, true> = {
  "billing.status.active": true,
  "billing.status.grace": true,
  "billing.status.trialing": true,
  "billing.status.billable": true,
  "billing.status.pending_payment": true,
  "billing.status.inactive": true,
  "billing.status.draft": true,
  "billing.status.unreviewed": true,
  "billing.status.paid": true,
  "billing.status.awaiting_payment": true,
  "billing.status.past_due": true,
  "billing.status.cancelled": true,
  "billing.status.suspended": true,
  "billing.status.missing": true,
  "billing.status.unavailable": true,
  "billing.status.open": true,
  "billing.status.void": true,
  "billing.status.uncollectible": true,
  "billing.status.applying": true,
  "billing.status.incomplete": true,
  "billing.status.incomplete_expired": true,
  "billing.status.canceled": true,
  "billing.status.unpaid": true,
  "billing.status.FULL": true,
  "billing.status.READ_ONLY": true,
  "billing.status.GRACE": true,
  "billing.status.BLOCKED": true,
  "billing.status.NONE": true
};

export function billingStatusKey(status: string): DictKey {
  const key = `billing.status.${status}`;
  return (Object.hasOwn(billingStatusKeys, key) ? key : "billing.status.unavailable") as DictKey;
}
