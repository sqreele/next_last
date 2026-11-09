import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function loadRoute(backendFetch, session = { user: { accessToken: 'server-token' } }) {
  const exports = {};
  const source = await readFile(new URL('../app/api/billing/[action]/route.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, URL, Headers, Request, Response,
    require(name) {
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/app/lib/backend-fetch') return { backendFetch };
      if (name === '@/app/lib/config') return { API_CONFIG: { baseUrl: 'http://backend:8000' } };
      if (name === '@/app/lib/auth0/server-session') return { getCompatServerSession: async () => session };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return exports;
}

function request(action, method = 'GET', body) {
  const url = new URL(`https://staymaint.test/api/billing/${action}?tenant_id=tenant-a&document_id=12&kind=receipt`);
  const req = new Request(url, {
    method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
  req.nextUrl = url;
  return req;
}
const context = (action) => ({ params: Promise.resolve({ action }) });

test('billing PDF proxy preserves bytes and filename and prohibits caching', async () => {
  const pdf = new TextEncoder().encode('%PDF-1.4\nprivate document\n');
  const route = await loadRoute(async (url, init) => {
    assert.equal(url, 'http://backend:8000/api/v1/billing/document/?tenant_id=tenant-a&document_id=12&kind=receipt');
    assert.equal(init.headers.get('Authorization'), 'Bearer server-token');
    assert.equal(init.cache, 'no-store');
    return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="RCT-00000012.pdf"' } });
  });
  const response = await route.GET(request('document'), context('document'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="RCT-00000012.pdf"');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdf);
});

test('billing document and PromptPay routes require an authenticated server session', async () => {
  let calls = 0;
  const route = await loadRoute(async () => { calls++; return Response.json({}); }, null);
  for (const action of ['document', 'profile', 'invoices', 'promptpay']) {
    const response = await route.GET(request(action), context(action));
    assert.equal(response.status, 401);
  }
  assert.equal(calls, 0);
});

test('PromptPay POST forwards only the request body and server access token', async () => {
  const payload = { tenant_id: 'tenant-a', plan: 1 };
  const route = await loadRoute(async (url, init) => {
    assert.equal(new URL(url).pathname, '/api/v1/billing/promptpay/');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(new TextDecoder().decode(init.body)), payload);
    assert.equal(init.headers.get('Authorization'), 'Bearer server-token');
    return Response.json({ url: 'https://invoice.stripe.com/i/test' });
  });
  const response = await route.POST(request('promptpay', 'POST', payload), context('promptpay'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: 'https://invoice.stripe.com/i/test' });
});

test('document authorization and unavailable receipt errors survive the BFF', async () => {
  for (const status of [400, 403, 404]) {
    const route = await loadRoute(async () => Response.json({ detail: 'Unavailable document.' }, { status }));
    const response = await route.GET(request('document'), context('document'));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.deepEqual(await response.json(), { detail: 'Unavailable document.' });
  }
});

test('billing BFF restricts actions to the explicit route map', async () => {
  let calls = 0;
  const route = await loadRoute(async () => { calls++; return Response.json({}); });
  const response = await route.GET(request('arbitrary'), context('arbitrary'));
  assert.equal(response.status, 404);
  assert.equal(calls, 0);
});

test('Company preview and confirmation use separate authenticated routes', async () => {
  const calls = [];
  const route = await loadRoute(async (url, init) => {
    calls.push({ path: new URL(url).pathname, body: JSON.parse(new TextDecoder().decode(init.body)) });
    assert.equal(init.headers.get('Authorization'), 'Bearer server-token');
    return Response.json({ id: 'approved-quote', state: 'quoted' });
  });
  await route.POST(request('preview', 'POST', { tenant_id: 'tenant-a', action: 'add', property_ids: ['P3'] }), context('preview'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/v1/billing/preview/');
  await route.POST(request('confirm', 'POST', { tenant_id: 'tenant-a', operation_id: 'approved-quote' }), context('confirm'));
  assert.equal(calls[1].path, '/api/v1/billing/confirm/');
  assert.equal(calls[1].body.operation_id, 'approved-quote');
});

test('Company billing routes cannot forward a client-supplied bearer identity', async () => {
  const route = await loadRoute(async (url, init) => {
    assert.equal(init.headers.get('Authorization'), 'Bearer server-token');
    return Response.json({ name: 'Company A' });
  });
  const req = request('company');
  req.headers.set('Authorization', 'Bearer forged-browser-token');
  const response = await route.GET(req, context('company'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
