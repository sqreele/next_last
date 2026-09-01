import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  billingStatusLabel,
  isSafeStripeHostedUrl,
  redirectToStripe,
  rows,
} from '../app/lib/billing-ui.mjs';

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

test('billing pages use internal plans, role visibility, and waiting-for-webhook copy', () => {
  const page = readFileSync(new URL('../app/dashboard/settings/billing/page.tsx', import.meta.url), 'utf8');
  const success = readFileSync(new URL('../app/dashboard/settings/billing/success/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /can_manage_billing/);
  assert.match(page, /can_start_checkout \? "checkout" : "portal"/);
  assert.match(page, /plan: plan\.id/);
  assert.match(page, /Grace deadline/);
  assert.match(page, /cancel_at_period_end/);
  assert.doesNotMatch(page, /external_customer_id|external_subscription_id/);
  assert.match(success, /We&apos;re confirming your subscription/);
  assert.match(success, /does not activate your subscription/);
  assert.doesNotMatch(success, /external_customer_id|external_subscription_id/);
});

test('billing browser calls use the authenticated billing BFF', () => {
  const page = readFileSync(new URL('../app/dashboard/settings/billing/page.tsx', import.meta.url), 'utf8');
  const success = readFileSync(new URL('../app/dashboard/settings/billing/success/page.tsx', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../app/api/billing/[action]/route.ts', import.meta.url), 'utf8');
  assert.match(page, /fetch\(`\/api\/billing\/\$\{path\}`/);
  assert.match(page, /path: "checkout" \| "portal"/);
  assert.match(page, /\/api\/billing\/status/);
  assert.match(success, /\/api\/billing\/status/);
  assert.match(route, /getSessionFromRequest/);
  assert.match(route, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(route, /webhooks/);
});
