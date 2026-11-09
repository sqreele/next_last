/* Isolated UI harness only. The backend authorization/payment contracts have
 * separate DB integration tests. Never point this fixture runner at production. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const baseURL = process.env.COMPANY_BILLING_PREVIEW_URL || 'http://127.0.0.1:3117';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
  throw new Error('Company billing fixture tests require an isolated localhost harness.');
}
const output = process.env.COMPANY_BILLING_SCREENSHOTS || '/tmp/staymaint-company-browser';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  let preview;
  if (process.env.COMPANY_BILLING_START_PREVIEW === '1') {
    preview = spawn(process.execPath, [path.join(__dirname, '../scripts/company-billing-preview.mjs')], {
      env: { ...process.env, COMPANY_BILLING_PREVIEW_PORT: new URL(baseURL).port || '3117' }, stdio: 'inherit',
    });
  }
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      try { ready = (await fetch(baseURL, { signal: AbortSignal.timeout(2000) })).ok; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'Isolated Company billing preview must be ready');
    browser = await chromium.launch({ headless: true });
    for (const locale of ['en', 'th']) for (const width of [320, 390, 1280]) {
      const copy = locale === 'en'
        ? { add: 'Add property', preview: 'Preview charges', confirm: 'Confirm changes', consent: 'I confirm the properties, amounts and terms above', pending: 'Awaiting payment', history: 'Invoices and receipts' }
        : { add: 'เพิ่ม Property', preview: 'แสดงยอดก่อนยืนยัน', confirm: 'ยืนยันการเปลี่ยนแปลง', consent: 'ยืนยันรายการ จำนวนเงิน และเงื่อนไขข้างต้น', pending: 'รอชำระ', history: 'ประวัติบิลและใบเสร็จ' };
      const money = value => new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', { style: 'currency', currency: 'USD' }).format(value);
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      await context.addInitScript(locale => localStorage.setItem('pcms-locale', locale), locale);
      let confirmations = 0;
      let previews = 0;
      let canModify = true;
      const initial = {
        tenant_id: 'TTEST', name: 'ABC Hotel Group', billing_model: 'property_quantity_v1', enabled: true,
        status: 'active', reconciliation_status: 'synced', total_properties: 3, active_properties: 2,
        billing_quantity: 2, desired_quantity: 2, currency: 'USD', unit_amount_minor: 2000, monthly_total_minor: 4000,
        billing_status: 'paid', amount_due_minor: 0, timezone: 'Asia/Bangkok',
        payment_method: 'card', next_billing_at: '2026-12-01T00:00:00Z', cancel_at_period_end: false,
        prices: [{ currency: 'usd', unit_amount_minor: 2000 }, { currency: 'thb', unit_amount_minor: 70000 }],
        properties: [
          { property_id: 'P1', name: 'Hotel Siam', paid: true, billable: true, status: 'active', archived: false },
          { property_id: 'P2', name: 'Hotel Chinatown', paid: true, billable: true, status: 'active', archived: false },
          { property_id: 'P3', name: 'Hotel Phuket', paid: false, billable: false, status: 'draft', archived: false },
        ], can_modify: true, pending_change: null,
      };
      let company = structuredClone(initial);
      const quote = { id: '0f9c04b4-df8e-435e-b1c1-a116bca82c26', action: 'add', state: 'quoted', url: null,
        quote: { currency: 'USD', unit_amount_minor: 2000, old_quantity: 2, quantity: 3,
          monthly_total_minor: 6000, amount_due_now_minor: 1000, credit_minor: 0,
          lines: [{ description: 'Proration for remaining paid cycle', amount_minor: 1000 }], affected_properties: [{ property_id: 'P3', name: 'Hotel Phuket' }] } };
      await context.route('**/api/billing/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname.replace(/\/$/, '');
        let result;
        if (pathname.endsWith('/profile')) result = { profile: { legal_name: 'ABC Hotel Group', address: 'Bangkok', email: 'billing@example.test', tax_id: '', branch: '' }, provider_available: true };
        else if (pathname.endsWith('/invoices')) result = { results: [{ id: 1, number: 'INV-TEST-1', receipt_number: 'RCT-TEST-1', status: 'paid', currency: 'USD', total: '40.00', issued_at: '2026-11-01', due_at: '2026-11-08' }], next_before: null };
        else if (pathname.endsWith('/company')) result = { ...company, can_modify: canModify };
        else if (pathname.endsWith('/preview')) {
          previews++;
          const body = route.request().postDataJSON();
          assert.equal(body.tenant_id, 'TTEST');
          assert.deepEqual(body.property_ids, ['P3']);
          assert.equal(body.quantity, undefined);
          result = quote;
        } else if (pathname.endsWith('/confirm')) {
          confirmations++;
          assert.equal(route.request().postDataJSON().operation_id, quote.id);
          result = { ...quote, state: 'awaiting_payment' };
          company = { ...company, desired_quantity: 3, pending_change: result, billing_status: 'awaiting_payment', amount_due_minor: 1000,
            properties: company.properties.map((p) => p.property_id === 'P3' ? { ...p, billable: false, status: 'pending_payment' } : p) };
        } else throw new Error(`Unexpected billing request ${pathname}`);
        await route.fulfill({ status: 200, json: result });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      await page.getByText('ABC Hotel Group', { exact: true }).waitFor();
      await page.getByText(copy.history, { exact: true }).waitFor();
      await page.locator('#billing-name').fill('Unsaved billing name');
      async function switchLanguage(next) {
        if (await page.getByRole('dialog').isVisible()) {
          // The modal correctly blocks the page header. Exercise the existing
          // cross-tab language update while a financial quote remains open.
          await page.evaluate(next => {
            localStorage.setItem('pcms-locale', next);
            window.dispatchEvent(new StorageEvent('storage', { key: 'pcms-locale', newValue: next }));
          }, next);
        } else {
          await page.locator('button[data-locale]').click();
          await page.getByRole('menuitem', { name: next === 'th' ? /ภาษาไทย/ : /English/ }).click();
        }
        await page.waitForFunction(next => document.documentElement.lang === next, next);
      }
      await switchLanguage(locale === 'en' ? 'th' : 'en');
      await switchLanguage(locale);
      assert.ok((await page.locator('body').innerText()).includes(money(40)));
      assert.equal(confirmations, 0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `Dashboard overflows at ${width}px`);
      await page.screenshot({ path: `${output}/company-${locale}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: copy.add, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Hotel Phuket', { exact: true }).check();
      await dialog.getByRole('button', { name: copy.preview }).click();
      await dialog.getByText(money(60), { exact: true }).waitFor();
      assert.equal(previews, 1);
      assert.equal(confirmations, 0, 'Preview must never confirm billing');
      const confirmButton = dialog.getByRole('button', { name: copy.confirm, exact: true });
      assert.equal(await confirmButton.isDisabled(), true);
      await dialog.getByLabel(copy.consent).check();
      await switchLanguage(locale === 'en' ? 'th' : 'en');
      assert.equal(await page.locator('#billing-name').inputValue(), 'Unsaved billing name', 'Language switching preserves unsaved billing details');
      assert.equal(previews, 1, 'Language switching does not request a new financial quote');
      assert.equal(confirmations, 0, 'Language switching never confirms a charge');
      await switchLanguage(locale);
      assert.equal(await dialog.getByLabel(copy.consent).isChecked(), true, 'Consent and quote survive language switching');
      await page.screenshot({ path: `${output}/proration-${locale}-${width}.png`, fullPage: true });
      await confirmButton.click();
      await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('row').filter({ hasText: 'Hotel Phuket' }).getByText(copy.pending, { exact: true }).waitFor();
      assert.equal(confirmations, 1);
      assert.equal(company.active_properties, 2, 'Unpaid third Property must not look active');
      canModify = false; company = structuredClone(initial);
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.getByRole('button', { name: copy.add, exact: true }).isDisabled(), true);
      assert.deepEqual(errors, []);
      await context.close();
      process.stdout.write(`Company dashboard, proration consent and restricted role: ${locale} ${width}px passed\n`);
    }
  } finally { if (browser) await browser.close(); if (preview) preview.kill('SIGTERM'); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
