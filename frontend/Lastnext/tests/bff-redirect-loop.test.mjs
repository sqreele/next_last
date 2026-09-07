import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import config from '../next.config.mjs';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
async function load(path, env, imports = {}, globals = {}) {
  const exports = {};
  const js = ts.transpileModule(await source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, require: (name) => {
      assert.ok(name in imports, `Unexpected dependency: ${name}`);
      return imports[name];
    },
    process: { env }, URL, Headers, Request, Response, ...globals,
  });
  return exports;
}

test('production and development rewrites cannot bypass the dynamic /api/v1 BFF', async () => {
  const previous = process.env.NODE_ENV;
  try {
    for (const mode of ['production', 'development']) {
      process.env.NODE_ENV = mode;
      const rewrites = await config.rewrites();
      assert.equal(rewrites.some(r => r.source.startsWith('/api/v1')), false);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('BFF defaults internally and rejects public, frontend, and malformed upstreams', async () => {
  const fallback = await load('app/lib/bff-upstream.ts', { NEXT_PUBLIC_API_URL: 'https://staymaint.com' });
  assert.equal(fallback.buildBffUpstream(['properties'], '').href, 'http://backend:8000/api/v1/properties/');
  for (const value of ['https://staymaint.com', 'http://frontend:3000', 'http://localhost:3000', 'http://backend:8000/other', 'http://backend:8000?x=1', 'http://example.test']) {
    const helper = await load('app/lib/bff-upstream.ts', { NEXT_PRIVATE_API_URL: value });
    assert.throws(() => helper.buildBffUpstream(['jobs'], ''), /internal backend origin/);
  }
});

async function harness(authenticated, upstreamResponse = () => Response.json({ ok: true })) {
  const events = [];
  const forwardedRequests = [];
  const env = { NEXT_PRIVATE_API_URL: 'http://backend:8000', NEXT_PUBLIC_API_URL: 'https://staymaint.com' };
  const upstream = await load('app/lib/bff-upstream.ts', env);
  const backend = await load('app/lib/backend-fetch.ts', env, {}, {
    fetch: async (url, init) => {
      events.push('fetch');
      assert.equal(url.origin, 'http://backend:8000');
      assert.equal(init.headers.get('cookie'), null);
      assert.equal(init.headers.get('host'), null);
      assert.equal(init.headers.get('authorization'), 'Bearer synthetic-server-credential');
      assert.equal(init.headers.get('x-forwarded-proto'), 'https');
      forwardedRequests.push({
        method: init.method,
        contentType: init.headers.get('content-type'),
        contentLength: init.headers.get('content-length'),
        transferEncoding: init.headers.get('transfer-encoding'),
        body: init.body === undefined
          ? null
          : [...new Uint8Array(await new Response(init.body).arrayBuffer())],
      });
      return upstreamResponse();
    },
  });
  const targets = [];
  const route = await load('app/api/v1/[...path]/route.ts', env, {
    'next/server': { NextResponse: Response },
    '@/app/lib/bff-upstream': upstream,
    '@/app/lib/auth0/server-session': { requireServerAccessToken: async () => {
      events.push('session');
      return authenticated ? 'synthetic-server-credential' : null;
    } },
    '@/app/lib/backend-fetch': { backendFetch: (url, init) => {
      targets.push(url.href);
      return backend.backendFetch(url, init);
    } },
  });
  return { route, events, forwardedRequests, targets };
}

for (const path of [
  '/api/v1/jobs/?page=1&property_id=example',
  '/api/v1/jobs/stats/?property_id=example',
  '/api/v1/properties/',
  '/api/v1/tenant-subscriptions/entitlement/',
]) {
  test(`BFF forwards once internally after session lookup: ${path}`, async () => {
    const { route, events, targets } = await harness(true);
    const url = new URL(path, 'https://staymaint.com');
    const response = await route.GET({
      method: 'GET', nextUrl: url,
      headers: new Headers({ authorization: 'Bearer synthetic-browser-credential', cookie: 'synthetic=unused', host: 'staymaint.com', 'x-forwarded-proto': 'http' }),
    }, { params: Promise.resolve({ path: url.pathname.slice('/api/v1/'.length).split('/').filter(Boolean) }) });
    assert.equal(response.status, 200);
    assert.deepEqual(events, ['session', 'fetch']);
    assert.deepEqual(targets, [`http://backend:8000${path}`]);
    assert.equal(response.headers.get('authorization'), null);
    assert.equal(response.headers.get('location'), null);
  });
}

test('missing server session returns 401 without any upstream request', async () => {
  const { route, events, targets } = await harness(false);
  const response = await route.GET({
    method: 'GET', nextUrl: new URL('https://staymaint.com/api/v1/jobs/'),
    headers: new Headers({ authorization: 'Bearer synthetic-browser-credential' }),
  }, { params: Promise.resolve({ path: ['jobs'] }) });
  assert.equal(response.status, 401);
  assert.deepEqual(events, ['session']);
  assert.deepEqual(targets, []);
});

test('BFF preserves raw bodies and headers for every supported non-GET method', async () => {
  const json = new TextEncoder().encode('{"status":"in_progress"}');
  const binary = new Uint8Array([0, 255, 16, 128, 65]);
  const multipart = new TextEncoder().encode(
    '--staymaint-boundary\r\nContent-Disposition: form-data; name="file"; filename="x.bin"\r\nContent-Type: application/octet-stream\r\n\r\nbytes\r\n--staymaint-boundary--\r\n',
  );
  const cases = [
    { method: 'PATCH', contentType: 'application/json', body: json },
    { method: 'POST', contentType: 'multipart/form-data; boundary=staymaint-boundary', body: multipart },
    { method: 'PUT', contentType: 'application/octet-stream', body: binary },
    { method: 'DELETE', contentType: null, body: null },
  ];

  for (const testCase of cases) {
    const { route, forwardedRequests } = await harness(true);
    const url = new URL(
      '/api/v1/jobs/j2639C2BF/update_status/?property_id=PE17D8D2C',
      'https://staymaint.com',
    );
    const headers = new Headers({ 'content-length': '999' });
    if (testCase.contentType) headers.set('content-type', testCase.contentType);
    const request = new Request(url, {
      method: testCase.method,
      headers,
      body: testCase.body,
    });
    Object.defineProperty(request, 'nextUrl', { value: url });

    const response = await route[testCase.method](request, {
      params: Promise.resolve({ path: ['jobs', 'j2639C2BF', 'update_status'] }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(forwardedRequests, [{
      method: testCase.method,
      contentType: testCase.contentType,
      contentLength: null,
      transferEncoding: null,
      body: [...(testCase.body || new Uint8Array())],
    }]);
  }
});

test('BFF does not add bodies to GET or HEAD requests', async () => {
  for (const method of ['GET', 'HEAD']) {
    const { route, forwardedRequests } = await harness(true);
    const url = new URL('/api/v1/properties/', 'https://staymaint.com');
    const response = await route[method]({
      method,
      nextUrl: url,
      headers: new Headers(),
    }, { params: Promise.resolve({ path: ['properties'] }) });
    assert.equal(response.status, 200);
    assert.equal(forwardedRequests[0].body, null);
  }
});

test('BFF preserves upstream error status and response bytes', async () => {
  const { route } = await harness(
    true,
    () => new Response('{"detail":"upstream validation"}', {
      status: 422,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const url = new URL('/api/v1/jobs/example/', 'https://staymaint.com');
  const response = await route.PATCH(Object.assign(
    new Request(url, { method: 'PATCH', body: new Uint8Array() }),
    { nextUrl: url },
  ), { params: Promise.resolve({ path: ['jobs', 'example'] }) });

  assert.equal(response.status, 422);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(await response.text(), '{"detail":"upstream validation"}');
});
