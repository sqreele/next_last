import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import config from '../next.config.mjs';

const CANONICAL_CONTACT_PATH = '/api/contact/';
const DJANGO_CONTACT_PATH = '/api/v1/public/contact/';
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function loadRoute(backendFetch) {
  const exports = {};
  const js = ts.transpileModule(await source('app/api/contact/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: (name) => {
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/app/lib/backend-fetch') return { backendFetch };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: {
      env: { NEXT_PRIVATE_API_URL: 'http://backend:8000' },
    },
    URL,
    Headers,
    Request,
    Response,
  });
  return exports;
}

function contactRequest(payload) {
  const body = JSON.stringify(payload);
  return new Request(`https://staymaint.com${CANONICAL_CONTACT_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
      'x-real-ip': '203.0.113.25',
    },
    body,
  });
}

const validPayload = {
  name: 'Route Test',
  email: 'operator@example.com',
  company: 'StayMaint',
  category: 'general',
  subject: 'Contact route regression',
  message: 'This request is handled only by mocked provider-safe test code.',
};

test('Contact uses the global trailing-slash convention without a custom redirect', async () => {
  assert.equal(config.trailingSlash, true);
  assert.equal(CANONICAL_CONTACT_PATH, '/api/contact/');

  const redirects = await config.redirects();
  const rewrites = await config.rewrites();
  assert.equal(redirects.some(({ source }) => source.includes('contact')), false);
  assert.equal(rewrites.some(({ source }) => source.includes('contact')), false);
});

test('canonical Contact POST reaches the BFF and forwards its body to canonical Django URL', async () => {
  const received = [];
  const route = await loadRoute(async (url, init) => {
    received.push({
      url: url.href,
      method: init.method,
      contentType: init.headers.get('content-type'),
      forwardedFor: init.headers.get('x-forwarded-for'),
      body: new TextDecoder().decode(init.body),
    });
    return Response.json({ detail: 'Message sent.' }, { status: 201 });
  });

  const response = await route.POST(contactRequest(validPayload));

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('location'), null);
  assert.deepEqual(JSON.parse(await response.text()), { detail: 'Message sent.' });
  assert.deepEqual(received, [{
    url: `http://backend:8000${DJANGO_CONTACT_PATH}`,
    method: 'POST',
    contentType: 'application/json',
    forwardedFor: '203.0.113.25',
    body: JSON.stringify(validPayload),
  }]);
});

for (const upstream of [
  { name: 'validation', status: 400, detail: 'Expected a JSON object.' },
  { name: 'provider failure', status: 503, detail: 'Unable to send your message right now.' },
]) {
  test(`Contact BFF passes through Django ${upstream.name} response`, async () => {
    let djangoReached = false;
    const route = await loadRoute(async (url, init) => {
      djangoReached = true;
      assert.equal(url.pathname, DJANGO_CONTACT_PATH);
      assert.equal(init.method, 'POST');
      return Response.json({ detail: upstream.detail }, { status: upstream.status });
    });

    const response = await route.POST(contactRequest(validPayload));

    assert.equal(djangoReached, true);
    assert.equal(response.status, upstream.status);
    assert.equal(response.headers.get('location'), null);
    assert.deepEqual(JSON.parse(await response.text()), { detail: upstream.detail });
  });
}
