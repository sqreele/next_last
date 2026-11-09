import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { formatBillingDate, formatBillingDateTime, getBillingLifecycleMessage } from '../app/lib/billing-ui.mjs';
import { interpolateTranslation } from '../app/lib/i18n/runtime.mjs';

const exports = {};
const source = readFileSync(new URL('../app/lib/i18n/dictionary.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { getDictionary } = exports;
const translate = locale => (key, values) => interpolateTranslation(getDictionary(locale)[key], values);

test('every billing translation exists in both languages with matching interpolation fields', () => {
  const en = getDictionary('en');
  const th = getDictionary('th');
  const keys = Object.keys(en).filter(key => key.startsWith('billing.'));
  assert.ok(keys.length > 100);
  const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const key of keys) {
    assert.equal(typeof th[key], 'string', key);
    assert.ok(en[key].trim() && th[key].trim(), key);
    assert.deepEqual(placeholders(en[key]), placeholders(th[key]), key);
  }
  assert.equal(translate('en')('billing.addProperty'), 'Add property');
  assert.equal(translate('th')('billing.addProperty'), 'เพิ่ม Property');
});

test('billing dates follow the selected locale while preserving the instant and timezone', () => {
  const value = '2026-12-01T00:00:00Z';
  for (const locale of ['en', 'th']) {
    const intlLocale = locale === 'th' ? 'th-TH' : 'en-GB';
    assert.equal(formatBillingDate(value, locale), new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)));
    assert.equal(formatBillingDateTime(value, 'Asia/Bangkok', locale), new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value)));
  }
  assert.equal(formatBillingDate(null, 'th'), '—');
  assert.equal(formatBillingDateTime('invalid', undefined, 'en'), '—');
});

test('renewal, trial, grace and cancellation messages localize without changing billing state', () => {
  for (const locale of ['en', 'th']) {
    const t = translate(locale);
    const state = { status: 'active', reason_code: 'subscription_active', current_period_end: '2026-12-01', entitlement_level: 'FULL', cancel_at_period_end: false };
    const original = structuredClone(state);
    assert.equal(getBillingLifecycleMessage(state, locale, t).message, t('billing.lifecycle.renews', { date: formatBillingDate(state.current_period_end, locale) }));
    assert.equal(getBillingLifecycleMessage({ ...state, cancel_at_period_end: true }, locale, t).message, t('billing.lifecycle.until', { date: formatBillingDate(state.current_period_end, locale) }));
    assert.equal(getBillingLifecycleMessage({ ...state, status: 'trialing', trial_ends_at: null }, locale, t).message, t('billing.lifecycle.unavailable'));
    assert.equal(getBillingLifecycleMessage({ ...state, status: 'past_due', grace_period_ends_at: '2026-12-08T00:00:00Z' }, locale, t).message, t('billing.lifecycle.grace', { date: formatBillingDateTime('2026-12-08T00:00:00Z', undefined, locale) }));
    assert.equal(getBillingLifecycleMessage({ ...state, status: 'cancelled', reason_code: 'cancelled_period_ended' }, locale, t).message, t('billing.lifecycle.ended', { date: formatBillingDate(state.current_period_end, locale) }));
    assert.deepEqual(state, original);
  }
});
