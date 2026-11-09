import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function load(backendFetch, session = { user: { accessToken: 'server-token' } }) {
  const exports = {};
  const source = await readFile(new URL('../app/api/properties/[propertyId]/route.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, require(name) {
    if (name === 'next/server') return { NextResponse: Response };
    if (name === '@/app/lib/backend-fetch') return { backendFetch };
    if (name === '@/app/lib/config') return { API_CONFIG: { baseUrl: 'http://backend:8000' } };
    if (name === '@/app/lib/session.server') return { getServerSession: async () => session };
    throw new Error(name);
  } });
  return exports;
}
const context = () => ({ params: Promise.resolve({ propertyId: 'P123' }) });
const request = body => new Request('https://staymaint.test/api/properties/P123', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer untrusted' }, body: JSON.stringify(body),
});

test('property edit requires the authenticated server session', async () => {
  const route = await load(() => { throw new Error('Must not call backend'); }, null);
  assert.equal((await route.PATCH(request({ name: 'Hotel', description: '' }), context())).status, 401);
});
test('edit forwards only profile fields and the server token without caching', async () => {
  const route = await load(async (url, init) => {
    assert.equal(url, 'http://backend:8000/api/v1/properties/P123/');
    assert.equal(init.method, 'PATCH');
    assert.equal(init.headers.Authorization, 'Bearer server-token');
    assert.equal(init.cache, 'no-store');
    assert.deepEqual(JSON.parse(init.body), { name: 'Hotel', description: 'Description' });
    return Response.json({ name: 'Hotel' });
  });
  const response = await route.PATCH(request({ name: ' Hotel ', description: ' Description ', tenant: 999, property_id: 'replacement', subscription_status: 'active' }), context());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
test('validation and permission errors survive the proxy', async () => {
  for (const status of [400, 403, 404]) {
    const route = await load(async () => Response.json({ detail: 'Denied' }, { status }));
    const response = await route.PATCH(request({ name: 'Hotel', description: '' }), context());
    assert.equal(response.status, status);
    assert.equal((await response.json()).detail, 'Denied');
  }
});
test('invalid inputs never reach the backend', async () => {
  const route = await load(() => { throw new Error('Must not call backend'); });
  for (const body of [null, { name: ' ', description: '' }, { name: 'a'.repeat(256), description: '' }, { name: 'Hotel', description: 42 }]) {
    assert.equal((await route.PATCH(request(body), context())).status, 400);
  }
});
