import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CONTACT_CATEGORIES,
  CONTACT_ENDPOINT,
  sendContactSubmission,
  validateContactValues,
} from '../app/contact/contact-form.mjs';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const component = await source('app/contact/ContactPageClient.tsx');
const dictionary = await source('app/lib/i18n/dictionary.ts');

const messages = {
  nameMin: 'name min', nameMax: 'name max', emailRequired: 'email required',
  emailMax: 'email max', emailInvalid: 'email invalid', companyMax: 'company max',
  categoryInvalid: 'category invalid', subjectMin: 'subject min', subjectMax: 'subject max',
  subjectLines: 'subject lines', messageMin: 'message min', messageMax: 'message max',
};

const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  company: 'Example Hotel',
  category: 'product',
  subject: 'Product workflow question',
  message: 'We would like to discuss our preventive maintenance workflow.',
  website: '',
};

test('Contact page renders a semantic form and all expected controls', () => {
  assert.match(component, /<main className=/);
  assert.match(component, /<form[\s\S]*?className=/);
  for (const field of ['name', 'email', 'company', 'category', 'subject', 'message']) {
    assert.match(component, new RegExp(`htmlFor="contact-${field}"`));
    assert.match(component, new RegExp(`(?:Input|select|Textarea) id="contact-${field}"`));
  }
});

test('required fields are validated after trimming', () => {
  const { errors } = validateContactValues({ ...valid, name: ' ', email: ' ', subject: ' ', message: ' ' }, messages);
  assert.deepEqual(errors, {
    name: 'name min', email: 'email required', subject: 'subject min', message: 'message min',
  });
});

test('invalid email is rejected', () => {
  assert.equal(validateContactValues({ ...valid, email: 'not-an-email' }, messages).errors.email, 'email invalid');
});

test('short message is rejected', () => {
  assert.equal(validateContactValues({ ...valid, message: 'Too short' }, messages).errors.message, 'message min');
});

test('successful HTTP 201 uses the canonical endpoint and exact request contract', async () => {
  const calls = [];
  const result = await sendContactSubmission(valid, async (url, init) => {
    calls.push({ url, init });
    return Response.json({ detail: 'Message sent.' }, { status: 201 });
  });
  assert.equal(result.status, 201);
  assert.equal(CONTACT_ENDPOINT, '/api/contact/');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/contact/');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json', Accept: 'application/json' });
  assert.deepEqual(JSON.parse(calls[0].init.body), valid);
});

test('form clears only after confirmed 201 success', () => {
  assert.match(component, /if \(result\.status === 201\) \{[\s\S]*?setValues\(INITIAL_VALUES\)/);
  const nonSuccessBranch = component.slice(component.indexOf("if (result.status === 400)"), component.indexOf('} catch {'));
  assert.doesNotMatch(nonSuccessBranch, /setValues\(/);
});

for (const status of [400, 413, 429, 503]) {
  test(`HTTP ${status} is handled without changing submitted content`, async () => {
    const snapshot = structuredClone(valid);
    const result = await sendContactSubmission(valid, async () => Response.json({ detail: 'safe error' }, { status }));
    assert.equal(result.status, status);
    assert.deepEqual(valid, snapshot);
    assert.match(component, new RegExp(`result\\.status === ${status}`));
  });
}

test('network failure is caught and mapped to localized copy', async () => {
  await assert.rejects(sendContactSubmission(valid, async () => { throw new TypeError('offline'); }), /offline/);
  assert.match(component, /catch \{[\s\S]*?contact\.error\.network/);
});

test('submit is disabled and exposes a loading state while pending', () => {
  assert.match(component, /disabled=\{isSubmitting\}/);
  assert.match(component, /isLoading=\{isSubmitting\}/);
  assert.match(component, /loadingText=\{t\('contact\.submitting'\)\}/);
});

test('duplicate submission is guarded before the API request', () => {
  assert.match(component, /if \(submittingRef\.current\) return;/);
  assert.match(component, /submittingRef\.current = true;[\s\S]*?sendContactSubmission/);
  assert.match(component, /finally \{[\s\S]*?submittingRef\.current = false/);
});

test('category options preserve exact backend values', () => {
  assert.deepEqual(CONTACT_CATEGORIES, ['general', 'product', 'support', 'billing', 'partnership', 'other']);
  assert.match(component, /value=\{category\}/);
});

test('English labels and status messages are complete', () => {
  for (const text of ['Contact StayMaint', 'Send us a message', 'Company / Organization', 'Too many requests.', 'Unable to connect.']) {
    assert.ok(dictionary.includes(text), `missing EN copy: ${text}`);
  }
});

test('Thai labels and status messages are complete', () => {
  for (const text of ['ติดต่อ StayMaint', 'ส่งข้อความถึงเรา', 'บริษัท / องค์กร', 'มีการส่งคำขอมากเกินไป', 'ไม่สามารถเชื่อมต่อได้']) {
    assert.ok(dictionary.includes(text), `missing TH copy: ${text}`);
  }
});

test('async status and field errors are accessible', () => {
  assert.match(component, /aria-live=\{submissionState === 'error' \? 'assertive' : 'polite'\}/);
  assert.match(component, /aria-atomic="true"/);
  assert.match(component, /aria-invalid=\{Boolean\(fieldError/);
  assert.match(component, /aria-describedby=\{describedBy/);
});

test('honeypot stays out of visual and keyboard flow', () => {
  assert.match(component, /name="website"/);
  assert.match(component, /tabIndex=\{-1\}/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(component, /-left-\[10000px\]/);
});
