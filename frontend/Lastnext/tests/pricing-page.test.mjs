import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const pricing = source('../app/pricing/page.tsx');
const commercialPlans = source('../app/lib/commercial-plans.server.ts');
const register = source('../app/auth/register/page.tsx');
const registerForm = source('../app/components/profile/RegisterForm.tsx');
const settings = source('../../../backend/myLubd/src/myLubd/settings.py');
const tenancy = source('../../../backend/myLubd/src/myappLubd/tenancy.py');
const migration = source('../../../backend/myLubd/src/myappLubd/migrations/0089_update_commercial_pricing_plans.py');
const stripeService = source('../../../backend/myLubd/src/myappLubd/billing/stripe_service.py');

test('pricing presents the live monthly catalog and highlights Pro', () => {
  assert.match(pricing, /const plans = await getCommercialPlans\(\)/);
  assert.match(commercialPlans, /\/api\/v1\/commercial-plans\//);
  assert.match(pricing, /plans\.map\(\(plan\)/);
  assert.match(pricing, /plan\.code === "pro"/);
  assert.match(pricing, /MOST POPULAR/);
  assert.match(pricing, /\/month/);
  assert.doesNotMatch(pricing, /annual|yearly/i);
});

test('pricing CTAs use canonical plan codes', () => {
  assert.match(pricing, /\/auth\/register\/\?plan=pro/);
  assert.match(pricing, /href=\{`\/auth\/register\/\?plan=\$\{plan\.code\}`\}/);
  assert.match(pricing, /key=\{plan\.code\}/);
});

test('registration accepts only canonical codes and displays the Basic label for starter', () => {
  assert.match(registerForm, /"starter" \| "pro" \| "enterprise"/);
  assert.match(register, /\['starter', 'pro', 'enterprise'\]/);
  assert.match(register, /starter: 'Basic'/);
  assert.doesNotMatch(registerForm, /"basic"/);
  assert.doesNotMatch(register, /\['basic', 'pro', 'enterprise'\]/);
});

test('backend and Stripe retain starter/pro/enterprise identities and price-only migration', () => {
  assert.match(settings, /'starter': os\.getenv\('STRIPE_PRICE_STARTER'/);
  assert.doesNotMatch(settings, /STRIPE_PRICE_BASIC/);
  assert.match(tenancy, /code='starter'/);
  assert.match(migration, /'starter': \{'name': 'Basic'[\s\S]*?'monthly_price': '15\.00'/);
  assert.match(migration, /'pro':[\s\S]*?'monthly_price': '30\.00'/);
  assert.match(migration, /'enterprise':[\s\S]*?'monthly_price': '60\.00'/);
  assert.doesNotMatch(migration, /code\s*=\s*'basic'|code='basic'|code="basic"/);
  assert.match(stripeService, /price_map\.get\(plan\.code/);
  assert.match(stripeService, /SubscriptionPlan\.objects\.get\(code=matches\[0\]\)/);
});
