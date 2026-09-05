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

async function harness(authenticated) {
  const events = [];
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
      return Response.json({ ok: true });
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
  return { route, events, targets };
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
