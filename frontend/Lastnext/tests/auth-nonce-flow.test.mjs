import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import jwt from 'jsonwebtoken';

import {
  createAuth0AuthorizationTransaction,
  validateOAuthCallbackTransaction,
  verifyAuth0IdToken,
} from '../app/lib/auth0/auth-security.mjs';

const root = new URL('../', import.meta.url);

function createTransaction() {
  return createAuth0AuthorizationTransaction({
    domain: 'tenant.auth0.com',
    clientId: 'client-id',
    baseUrl: 'https://staymaint.com',
    audience: 'https://api.staymaint.com',
  });
}

function installTestJwks(t) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    keys: [{ ...publicJwk, kid: 'test-key', use: 'sig', alg: 'RS256' }],
  }), { status: 200 });
  t.after(() => { globalThis.fetch = originalFetch; });
  return (claims) => jwt.sign(claims, privateKey, {
    algorithm: 'RS256',
    keyid: 'test-key',
    issuer: 'https://tenant.auth0.com/',
    audience: 'client-id',
    expiresIn: '5m',
  });
}

test('generated transaction nonce equals authorize-request nonce', () => {
  const transaction = createTransaction();
  assert.equal(transaction.authorizeUrl.searchParams.get('nonce'), transaction.nonce);
  assert.equal(transaction.authorizeUrl.searchParams.getAll('nonce').length, 1);
  assert.equal(transaction.authorizeUrl.searchParams.get('state'), transaction.state);
  assert.equal(transaction.authorizeUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(transaction.authorizeUrl.searchParams.get('redirect_uri'), 'https://staymaint.com/api/auth/callback');
  assert.equal(transaction.authorizeUrl.searchParams.get('client_id'), 'client-id');
  assert.equal(transaction.authorizeUrl.searchParams.get('response_type'), 'code');
  assert.equal(transaction.authorizeUrl.searchParams.get('scope'), 'openid profile email offline_access');
});

test('matching ID-token nonce passes', async (t) => {
  const sign = installTestJwks(t);
  const claims = await verifyAuth0IdToken(sign({ sub: 'auth0|user', nonce: 'expected' }), {
    domain: 'tenant.auth0.com', clientId: 'client-id', nonce: 'expected',
  });
  assert.equal(claims.nonce, 'expected');
});

test('mismatched ID-token nonce fails closed', async (t) => {
  const sign = installTestJwks(t);
  await assert.rejects(() => verifyAuth0IdToken(
    sign({ sub: 'auth0|user', nonce: 'actual' }),
    { domain: 'tenant.auth0.com', clientId: 'client-id', nonce: 'expected' },
  ));
});

test('missing ID-token nonce fails closed when nonce was required', async (t) => {
  const sign = installTestJwks(t);
  await assert.rejects(() => verifyAuth0IdToken(
    sign({ sub: 'auth0|user' }),
    { domain: 'tenant.auth0.com', clientId: 'client-id', nonce: 'expected' },
  ));
});

test('callback transaction selected by returned state contains the expected nonce', () => {
  const transaction = createTransaction();
  assert.equal(validateOAuthCallbackTransaction({
    callbackState: transaction.state,
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
    codeVerifier: transaction.verifier,
  }), null);
});

test('a second fixed-cookie login cannot authenticate the first transaction', () => {
  const first = createTransaction();
  const second = createTransaction();
  assert.notEqual(first.state, second.state);
  assert.equal(validateOAuthCallbackTransaction({
    callbackState: first.state,
    expectedState: second.state,
    expectedNonce: second.nonce,
    codeVerifier: second.verifier,
  }), 'invalid_state');
});

test('an expired browser transaction cannot authenticate', async () => {
  const loginFlow = await readFile(new URL('app/lib/auth0/login-flow.ts', root), 'utf8');
  assert.match(loginFlow, /maxAge: 10 \* 60/);
  assert.equal(validateOAuthCallbackTransaction({
    callbackState: 'returned-state',
    expectedState: undefined,
    expectedNonce: undefined,
    codeVerifier: undefined,
  }), 'invalid_state');
});

test('invalid nonce is rejected before an app session can be issued', async () => {
  assert.equal(validateOAuthCallbackTransaction({
    callbackState: 'state',
    expectedState: 'state',
    expectedNonce: undefined,
    codeVerifier: 'verifier',
  }), 'invalid_nonce');

  const callback = await readFile(new URL('app/api/auth/callback/route.ts', root), 'utf8');
  assert.ok(callback.indexOf('if (transactionFailure)') < callback.indexOf('createServerSession('));
  assert.ok(callback.indexOf('verifyAuth0IdToken(') < callback.indexOf('createServerSession('));
});

test('every login entry point uses the canonical hardened constructor', async () => {
  for (const path of [
    'app/api/auth/login/route.ts',
    'app/api/auth/route.ts',
    'app/api/auth/[...auth0]/route.ts',
  ]) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.match(source, /beginHardenedAuth0Login\(request\)/);
    assert.doesNotMatch(source, /new URLSearchParams\(\{[\s\S]*response_type: 'code'/);
  }
});
