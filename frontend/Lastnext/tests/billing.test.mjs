import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  billingStatusLabel,
  formatBillingDateTime,
  getBillingLifecycleMessage,
  getLifecycleDisplay,
  isSafeStripeHostedUrl,
  redirectToStripe,
  rows,
} from '../app/lib/billing-ui.mjs';

const billing = {
  status: 'active',
  entitlement_level: 'FULL',
  reason_code: 'subscription_active',
  current_period_end: '2026-10-01',
  trial_ends_at: null,
  grace_period_ends_at: null,
  cancel_at_period_end: false,
};

test('billing states include active, past_due/grace, and cancelled display labels', () => {
  assert.equal(billingStatusLabel('active'), 'Active');
  assert.equal(billingStatusLabel('past_due'), 'Past due');
  assert.equal(billingStatusLabel('cancelled'), 'Cancelled');
});

test('checkout and portal redirects accept only Stripe-hosted HTTPS URLs', () => {
  assert.equal(isSafeStripeHostedUrl('https://checkout.stripe.com/c/pay/test'), true);
  assert.equal(isSafeStripeHostedUrl('https://billing.stripe.com/p/session/test'), true);
  assert.equal(isSafeStripeHostedUrl('https://stripe.com.attacker.test/path'), false);
  assert.equal(isSafeStripeHostedUrl('javascript:alert(1)'), false);
  let redirected = '';
  redirectToStripe('https://checkout.stripe.com/c/pay/test', { assign: (value) => { redirected = value; } });
  assert.equal(redirected, 'https://checkout.stripe.com/c/pay/test');
});

test('plan selection normalizes paginated API results', () => {
  assert.deepEqual(rows({ results: [{ code: 'starter' }] }), [{ code: 'starter' }]);
});

test('billing lifecycle wording covers renewal, cancellation, trials, and payment failure', () => {
  assert.match(getBillingLifecycleMessage(billing).message, /^Renews /);
  assert.match(getBillingLifecycleMessage({ ...billing, cancel_at_period_end: true }).message, /^Access until /);
  assert.match(getBillingLifecycleMessage({
    ...billing,
    status: 'trialing',
    reason_code: 'trial_active',
    trial_ends_at: '2026-10-01T00:00:00Z',
  }).message, /^Trial expires /);
  assert.match(getBillingLifecycleMessage({
    ...billing,
    status: 'trialing',
    entitlement_level: 'READ_ONLY',
    reason_code: 'trial_end_missing',
    current_period_end: null,
  }).message, /Expiry date unavailable/);
  assert.match(getBillingLifecycleMessage({
    ...billing,
    status: 'past_due',
    entitlement_level: 'GRACE',
    reason_code: 'past_due_within_grace_period',
    grace_period_ends_at: '2026-10-01T00:00:00Z',
  }).message, /^Grace until /);
});

test('billing lifecycle wording covers stale and ended periods', () => {
  assert.match(getBillingLifecycleMessage({
    ...billing,
    entitlement_level: 'READ_ONLY',
    reason_code: 'active_period_expired',
  }).message, /Paid period expired/);
  assert.match(getBillingLifecycleMessage({
    ...billing,
    status: 'cancelled',
    entitlement_level: 'READ_ONLY',
    reason_code: 'cancelled_period_ended',
  }).message, /^Access ended /);
});

test('platform lifecycle labels use one explicit deadline and never fabricate missing dates', () => {
  const trial = { ...billing, status: 'trialing', trial_ends_at: '2026-12-31T16:59:00Z' };
  assert.equal(getLifecycleDisplay(trial, 'Asia/Bangkok').message, 'Trial expires 31 Dec 2026, 23:59');
  assert.equal(formatBillingDateTime('2026-12-31T16:59:00Z', 'Asia/Bangkok'), '31 Dec 2026, 23:59');
  assert.match(getLifecycleDisplay(billing).message, /^Renews 1 Oct 2026$/);
  assert.match(getLifecycleDisplay({ ...billing, cancel_at_period_end: true }).message, /^Access until /);
  assert.match(getLifecycleDisplay({ ...billing, status: 'past_due', grace_period_ends_at: '2026-12-31T16:59:00Z' }, 'Asia/Bangkok').message, /^Grace until /);
  assert.match(getLifecycleDisplay({ ...billing, status: 'cancelled', current_period_end: '2026-12-31' }, 'UTC', new Date('2026-09-14T00:00:00Z')).message, /^Access until /);
  assert.match(getLifecycleDisplay({ ...billing, status: 'cancelled', current_period_end: '2026-01-01' }, 'UTC', new Date('2026-09-14T00:00:00Z')).message, /^Access ended /);
  assert.equal(getLifecycleDisplay({ ...billing, status: 'trialing', trial_ends_at: null }).message, 'Expiry date unavailable');
});

test('billing pages use internal plans, role visibility, and waiting-for-webhook copy', () => {
  const page = readFileSync(new URL('../app/dashboard/settings/billing/BillingSettingsClient.tsx', import.meta.url), 'utf8');
  const serverPage = readFileSync(new URL('../app/dashboard/settings/billing/page.tsx', import.meta.url), 'utf8');
  const success = readFileSync(new URL('../app/dashboard/settings/billing/success/BillingSuccessClient.tsx', import.meta.url), 'utf8');
  assert.match(page, /can_manage_billing/);
  assert.match(page, /can_start_checkout \? "checkout" : "portal"/);
  assert.match(page, /plan: plan\.id/);
  assert.match(page, /getBillingLifecycleMessage/);
  assert.match(page, /cancel_at_period_end/);
  assert.doesNotMatch(page, /external_customer_id|external_subscription_id/);
  assert.match(serverPage, /requireBillingAccess/);
  assert.match(success, /We&apos;re confirming your subscription/);
  assert.match(success, /does not activate your subscription/);
  assert.doesNotMatch(success, /external_customer_id|external_subscription_id/);
});

test('billing browser calls use the authenticated billing BFF', () => {
  const page = readFileSync(new URL('../app/dashboard/settings/billing/BillingSettingsClient.tsx', import.meta.url), 'utf8');
  const success = readFileSync(new URL('../app/dashboard/settings/billing/success/BillingSuccessClient.tsx', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../app/api/billing/[action]/route.ts', import.meta.url), 'utf8');
  assert.match(page, /fetch\(`\/api\/billing\/\$\{path\}`/);
  assert.match(page, /path: "checkout" \| "portal"/);
  assert.match(page, /\/api\/billing\/status/);
  assert.match(success, /\/api\/billing\/status/);
  assert.match(route, /getCompatServerSession/);
  assert.match(route, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(route, /webhooks/);
});
