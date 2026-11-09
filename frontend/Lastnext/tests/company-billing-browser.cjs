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
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
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
        if (pathname.endsWith('/company')) result = { ...company, can_modify: canModify };
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
      assert.ok((await page.locator('body').innerText()).includes('$40.00'));
      assert.equal(confirmations, 0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `Dashboard overflows at ${width}px`);
      await page.screenshot({ path: `${output}/company-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'เพิ่ม Property', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Hotel Phuket', { exact: true }).check();
      await dialog.getByRole('button', { name: 'แสดงยอดก่อนยืนยัน' }).click();
      await dialog.getByText('$60.00', { exact: true }).waitFor();
      assert.equal(previews, 1);
      assert.equal(confirmations, 0, 'Preview must never confirm billing');
      const confirmButton = dialog.getByRole('button', { name: 'ยืนยันการเปลี่ยนแปลง', exact: true });
      assert.equal(await confirmButton.isDisabled(), true);
      await dialog.getByLabel('ยืนยันรายการ จำนวนเงิน และเงื่อนไขข้างต้น').check();
      await page.screenshot({ path: `${output}/proration-${width}.png`, fullPage: true });
      await confirmButton.click();
      await dialog.waitFor({ state: 'hidden' });
      await page.getByText('รอชำระ', { exact: true }).waitFor();
      assert.equal(confirmations, 1);
      assert.equal(company.active_properties, 2, 'Unpaid third Property must not look active');
      canModify = false; company = structuredClone(initial);
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.getByRole('button', { name: 'เพิ่ม Property', exact: true }).isDisabled(), true);
      assert.deepEqual(errors, []);
      await context.close();
      process.stdout.write(`Company dashboard, proration consent and restricted role: ${width}px passed\n`);
    }
  } finally { if (browser) await browser.close(); if (preview) preview.kill('SIGTERM'); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
