import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import jwt from 'jsonwebtoken';

import {
  createPkcePair,
  localAppUrl,
  pickAuth0HumanUsername,
  resolvePostLoginDestination,
  sanitizeLocalPath,
  sanitizeLogoutPath,
  verifyAuth0IdToken,
} from '../app/lib/auth0/auth-security.mjs';
import { createSessionDiagnostic } from '../app/lib/auth0/session-diagnostics.mjs';

const root = new URL('../', import.meta.url);

test('Auth0 human username follows presentation claim priority and never uses sub', () => {
  const claims = {
    sub: 'google-oauth2_110208545241072621955',
    preferred_username: 'preferred',
    name: 'Full Name',
    nickname: 'nickname',
    given_name: 'Given',
    email: 'person@example.com',
  };

  assert.equal(pickAuth0HumanUsername(claims), 'preferred');
  assert.equal(pickAuth0HumanUsername({ ...claims, preferred_username: '' }), 'Full Name');
  assert.equal(
    pickAuth0HumanUsername({ ...claims, preferred_username: '', name: '' }),
    'nickname',
  );
  assert.equal(
    pickAuth0HumanUsername({ ...claims, preferred_username: '', name: '', nickname: '' }),
    'Given',
  );
  assert.equal(
    pickAuth0HumanUsername({
      ...claims,
      preferred_username: '',
      name: '',
      nickname: '',
      given_name: '',
    }),
    'person',
  );
  assert.equal(pickAuth0HumanUsername({ sub: claims.sub, email: '' }), 'User');
  assert.equal(pickAuth0HumanUsername({ preferred_username: claims.sub }), 'User');
  assert.equal(pickAuth0HumanUsername({ preferred_username: 'auth0|abc123' }), 'User');
  assert.equal(pickAuth0HumanUsername({ preferred_username: 'github|12345' }), 'User');
  assert.equal(pickAuth0HumanUsername({ preferred_username: 'Anne-Marie 2' }), 'Anne-Marie 2');
  assert.equal(
    pickAuth0HumanUsername({
      preferred_username: '   ',
      name: '\t',
      nickname: '',
      given_name: '  Given  ',
      email: 'person@example.com',
    }),
    'Given',
  );
});

test('redirect sanitizer accepts local paths and rejects external variants', () => {
  assert.equal(sanitizeLocalPath('/dashboard/jobs?tab=open', '/'), '/dashboard/jobs?tab=open');
  for (const unsafe of [
    'https://evil.example',
    '//evil.example',
    '%2F%2Fevil.example',
    'https%3A%2F%2Fevil.example',
    '/\\evil.example',
  ]) {
    assert.equal(sanitizeLocalPath(unsafe, '/'), '/');
  }
  assert.equal(localAppUrl('https://staymaint.com/base', '//evil.example'), 'https://staymaint.com/');
});

test('post-login redirects preserve the invitation acceptance security boundary', () => {
  assert.equal(resolvePostLoginDestination('/dashboard', false), '/auth/access-pending');
  assert.equal(resolvePostLoginDestination('/invitations/accept', false), '/invitations/accept');
  assert.equal(resolvePostLoginDestination('/dashboard', true), '/dashboard');
  assert.equal(resolvePostLoginDestination('https://evil.example', true), '/dashboard');
  assert.equal(resolvePostLoginDestination('/invitations/accept-evil', false), '/auth/access-pending');
  assert.equal(resolvePostLoginDestination('%2Finvitations%2Faccept', false), '/invitations/accept');
  assert.equal(resolvePostLoginDestination('/invitations/accept/', false), '/invitations/accept');
});

test('logout returnTo is restricted to known local destinations', () => {
  assert.equal(sanitizeLogoutPath('/auth/login'), '/auth/login');
  assert.equal(sanitizeLogoutPath('/auth/access-pending'), '/auth/access-pending');
  assert.equal(sanitizeLogoutPath('/dashboard'), '/');
  assert.equal(sanitizeLogoutPath('https://evil.example'), '/');
  assert.equal(sanitizeLogoutPath('//evil.example'), '/');
});

test('PKCE uses an S256 challenge derived from a non-empty verifier', async () => {
  const { verifier, challenge } = createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  const expected = Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  ).toString('base64url');
  assert.equal(challenge, expected);
});

test('ID token verification enforces signature, issuer, audience, expiry, and nonce', async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    keys: [{ ...publicJwk, kid: 'test-key', use: 'sig', alg: 'RS256' }],
  }), { status: 200 });
  t.after(() => { globalThis.fetch = originalFetch; });

  const sign = (overrides = {}, options = {}) => jwt.sign(
    {
      sub: 'auth0|verified',
      email: 'person@example.com',
      email_verified: true,
      nonce: 'expected-nonce',
      ...overrides,
    },
    privateKey,
    {
      algorithm: 'RS256',
      keyid: 'test-key',
      issuer: 'https://tenant.auth0.com/',
      audience: 'client-id',
      expiresIn: '5m',
      ...options,
    },
  );

  const claims = await verifyAuth0IdToken(sign(), {
    domain: 'tenant.auth0.com', clientId: 'client-id', nonce: 'expected-nonce',
  });
  assert.equal(claims.sub, 'auth0|verified');

  await assert.rejects(() => verifyAuth0IdToken(sign(), {
    domain: 'tenant.auth0.com', clientId: 'client-id', nonce: 'wrong-nonce',
  }));
  await assert.rejects(() => verifyAuth0IdToken(sign(), {
    domain: 'tenant.auth0.com', clientId: 'wrong-client', nonce: 'expected-nonce',
  }));
  await assert.rejects(() => verifyAuth0IdToken(sign({}, { expiresIn: -60 }), {
    domain: 'tenant.auth0.com', clientId: 'client-id', nonce: 'expected-nonce',
  }));
  await assert.rejects(() => verifyAuth0IdToken(
    jwt.sign({ sub: 'unsigned' }, 'not-an-rsa-key'),
    { domain: 'tenant.auth0.com', clientId: 'client-id', nonce: 'expected-nonce' },
  ));
});

test('login and callback retain state, require nonce and PKCE, and fail closed', async () => {
  const rootLogin = await readFile(new URL('app/api/auth/route.ts', root), 'utf8');
  const canonicalLogin = await readFile(new URL('app/api/auth/login/route.ts', root), 'utf8');
  const catchAllLogin = await readFile(new URL('app/api/auth/[...auth0]/route.ts', root), 'utf8');
  const loginFlow = await readFile(new URL('app/lib/auth0/login-flow.ts', root), 'utf8');
  const callback = await readFile(new URL('app/api/auth/callback/route.ts', root), 'utf8');
  assert.match(rootLogin, /beginHardenedAuth0Login\(request\)/);
  assert.match(canonicalLogin, /\/api\/auth/);
  assert.match(catchAllLogin, /beginHardenedAuth0Login\(request\)/);
  assert.match(loginFlow, /auth0_login_state/);
  assert.match(loginFlow, /auth0_login_nonce/);
  assert.match(loginFlow, /auth0_pkce_verifier/);
  assert.match(loginFlow, /code_challenge/);
  assert.match(loginFlow, /code_challenge_method: 'S256'/);
  assert.match(loginFlow, /httpOnly: true/);
  assert.match(loginFlow, /sameSite: 'lax'/);
  assert.match(loginFlow, /maxAge: 10 \* 60/);
  assert.doesNotMatch(rootLogin, /\/authorize/);
  assert.doesNotMatch(rootLogin, /randomUUID/);
  assert.match(callback, /state !== expectedState/);
  assert.match(callback, /nonce: expectedNonce/);
  assert.match(callback, /code_verifier: codeVerifier/);
  assert.match(callback, /verifyAuth0IdToken/);
  assert.doesNotMatch(callback, /Buffer\.from\(payload/);
  assert.match(callback, /resolvePostLoginDestination\(requestedRedirect, hasPropertyAccess\)/);
});

test('sessions use an opaque v2 reference and logout clears the session cookie', async () => {
  const session = await readFile(new URL('app/lib/auth0/session-cookie.ts', root), 'utf8');
  const store = await readFile(new URL('app/lib/auth0/server-session-store.ts', root), 'utf8');
  const middleware = await readFile(new URL('middleware.ts', root), 'utf8');
  const logout = await readFile(new URL('app/api/auth/logout/route.ts', root), 'utf8');
  assert.match(session, /randomBytes\(32\)/);
  assert.match(session, /SESSION_ID_PATTERN/);
  assert.doesNotMatch(session, /sealSession/);
  assert.match(store, /aes-256-gcm/);
  assert.match(store, /auth:session:/);
  assert.match(session, /httpOnly: true/);
  assert.match(session, /secure: process\.env\.NODE_ENV === 'production'/);
  assert.match(session, /sameSite: 'lax'/);
  assert.doesNotMatch(session, /ALLOW_LEGACY_PLAINTEXT_AUTH_SESSION/);
  assert.match(middleware, /OPAQUE_SESSION_REFERENCE/);
  assert.match(logout, /clearSessionCookie\(response\)/);
});

test('OAuth login actions use top-level navigation without Next router or prefetch', async () => {
  const loginPage = await readFile(new URL('app/auth/login/page.tsx', root), 'utf8');
  const legacyLoginPage = await readFile(new URL('app/login/page.tsx', root), 'utf8');
  const accessPendingPage = await readFile(new URL('app/auth/access-pending/page.tsx', root), 'utf8');
  const registerForm = await readFile(new URL('app/components/profile/RegisterForm.tsx', root), 'utf8');
  const interactiveSources = [loginPage, legacyLoginPage, accessPendingPage, registerForm];

  assert.match(loginPage, /window\.location\.assign\(loginUrl\)/);
  assert.match(loginPage, /encodeURIComponent\(redirect\)/);
  assert.match(legacyLoginPage, /window\.location\.assign\('\/api\/auth\/login'\)/);
  assert.match(legacyLoginPage, /loginStarted\.current/);

  for (const source of interactiveSources) {
    assert.doesNotMatch(source, /router\.(?:push|replace)\([^)]*\/api\/auth\/login/);
    assert.doesNotMatch(source, /<Link[^>]+href=["']\/api\/auth\/login/);
    assert.doesNotMatch(source, /prefetch[^\n]*\/api\/auth\/login/);
  }
});

test('session diagnostics distinguish absent, open-failed, invalid, expired, and valid sessions', () => {
  const now = 2_000;
  assert.deepEqual(createSessionDiagnostic(undefined, null, now), {
    auth0_session_cookie_present: 'no',
    auth0_session_cookie_bytes: 0,
    session_open_succeeded: 'no',
    required_user_id_present: 'no',
    access_token_present: 'no',
    access_token_expired: 'no',
  });

  const openFailed = createSessionDiagnostic('sealed-cookie', null, now);
  assert.equal(openFailed.auth0_session_cookie_present, 'yes');
  assert.equal(openFailed.auth0_session_cookie_bytes, 13);
  assert.equal(openFailed.session_open_succeeded, 'no');

  const invalid = createSessionDiagnostic('sealed-cookie', { user: {} }, now);
  assert.equal(invalid.session_open_succeeded, 'yes');
  assert.equal(invalid.required_user_id_present, 'no');
  assert.equal(invalid.access_token_present, 'no');

  const expired = createSessionDiagnostic('sealed-cookie', {
    user: { id: 'present', accessToken: 'present', accessTokenExpires: now - 1 },
  }, now);
  assert.equal(expired.required_user_id_present, 'yes');
  assert.equal(expired.access_token_present, 'yes');
  assert.equal(expired.access_token_expired, 'yes');

  const valid = createSessionDiagnostic('sealed-cookie', {
    user: { id: 'present', accessToken: 'present', accessTokenExpires: now + 1 },
  }, now);
  assert.equal(valid.session_open_succeeded, 'yes');
  assert.equal(valid.required_user_id_present, 'yes');
  assert.equal(valid.access_token_present, 'yes');
  assert.equal(valid.access_token_expired, 'no');
});

test('callback and session readers emit metadata-only auth diagnostics', async () => {
  const callback = await readFile(new URL('app/api/auth/callback/route.ts', root), 'utf8');
  const serverSession = await readFile(new URL('app/lib/auth0/server-session.ts', root), 'utf8');
  const middleware = await readFile(new URL('middleware.ts', root), 'utf8');

  assert.match(callback, /auth_callback_success/);
  assert.match(callback, /session_cookie_bytes/);
  assert.match(callback, /set_cookie/);
  assert.doesNotMatch(callback, /console\.(?:info|log)\([^\n]*(?:accessToken|refreshToken|sealedSession)/);
  assert.match(serverSession, /logSessionDiagnostic\(cookieValue, parsed, \{ lookup: 'success' \}\)/);
  assert.match(middleware, /logSessionDiagnostic\(auth0SessionCookie, null, \{ lookup: 'edge_deferred' \}\)/);
});

test('legacy token proxy is retired and refresh uses only the server-side Auth0 session', async () => {
  const issue = await readFile(new URL('app/api/auth/token/route.ts', root), 'utf8');
  const refresh = await readFile(new URL('app/api/auth/token/refresh/route.ts', root), 'utf8');
  assert.match(issue, /status: 410/);
  assert.doesNotMatch(issue, /api\/v1\/token/);
  assert.match(refresh, /session\?\.user\?\.refreshToken/);
  assert.match(refresh, /updateServerSession/);
  assert.doesNotMatch(refresh, /NextResponse\.json\(\{ access,/);
  assert.match(refresh, /https:\/\/\$\{domain\}\/oauth\/token/);
  assert.doesNotMatch(refresh, /request\.json/);
  assert.doesNotMatch(refresh, /api\/v1\/token\/refresh/);
});

test('legacy frontend password recovery proxies are retired', async () => {
  for (const path of [
    'app/api/auth/password/forgot/route.ts',
    'app/api/auth/password/reset/route.ts',
  ]) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.match(source, /status: 410/);
    assert.doesNotMatch(source, /api\/v1\/auth\/password/);
  }
});
