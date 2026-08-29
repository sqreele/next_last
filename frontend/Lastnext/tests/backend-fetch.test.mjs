import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PRIVATE_API_URL = 'http://backend:8000';

const { backendFetch } = await import('../app/lib/backend-fetch.ts');

test('adds the trusted protocol header to internal requests and preserves headers', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (target, init) => {
    captured = { target, init };
    return new Response(null, { status: 204 });
  };

  try {
    await backendFetch('http://backend:8000/api/v1/jobs/', {
      headers: {
        Authorization: 'Bearer token',
        Cookie: 'session=value',
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Tenant-ID': 'tenant-1',
        'X-Property-ID': 'property-1',
        'X-Request-ID': 'request-1',
        'X-Forwarded-Proto': 'http',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const headers = new Headers(captured.init.headers);
  assert.equal(headers.get('authorization'), 'Bearer token');
  assert.equal(headers.get('cookie'), 'session=value');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('accept'), 'application/json');
  assert.equal(headers.get('x-tenant-id'), 'tenant-1');
  assert.equal(headers.get('x-property-id'), 'property-1');
  assert.equal(headers.get('x-request-id'), 'request-1');
  assert.equal(headers.get('x-forwarded-proto'), 'https');
  assert.equal(captured.init.redirect, undefined);
});

test('does not forward a caller-supplied protocol header to other origins', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (target, init) => {
    captured = { target, init };
    return new Response(null, { status: 204 });
  };

  try {
    await backendFetch('https://staymaint.com/api/v1/jobs/', {
      headers: {
        Authorization: 'Bearer token',
        'X-Forwarded-Proto': 'http',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const headers = new Headers(captured.init.headers);
  assert.equal(headers.get('authorization'), 'Bearer token');
  assert.equal(headers.has('x-forwarded-proto'), false);
});
