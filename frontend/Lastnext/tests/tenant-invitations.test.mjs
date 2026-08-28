import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  INVITATION_TOKEN_STORAGE_KEY,
  captureInvitationToken,
  clearInvitationToken,
} from '../app/lib/invitation-token.mjs';


const root = new URL('../', import.meta.url);


function browserState({ hash = '', search = '' } = {}) {
  const values = new Map();
  const replacements = [];
  return {
    location: { hash, search, pathname: '/invitations/accept' },
    history: {
      state: { test: true },
      replaceState(state, title, url) { replacements.push({ state, title, url }); },
    },
    storage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); },
    },
    replacements,
    values,
  };
}


test('fragment token is captured, hidden, retained through Auth0, and removable', () => {
  const browser = browserState({ hash: '#token=secret-value' });
  assert.equal(
    captureInvitationToken(browser.location, browser.history, browser.storage),
    'secret-value',
  );
  assert.equal(browser.values.get(INVITATION_TOKEN_STORAGE_KEY), 'secret-value');
  assert.deepEqual(browser.replacements.map(({ url }) => url), ['/invitations/accept']);

  const afterAuth = {
    ...browser.location,
    hash: '',
    search: '',
  };
  assert.equal(
    captureInvitationToken(afterAuth, browser.history, browser.storage),
    'secret-value',
  );

  clearInvitationToken(browser.storage);
  assert.equal(browser.values.has(INVITATION_TOKEN_STORAGE_KEY), false);
});


test('query token is stripped and never accepted as a fallback', () => {
  const browser = browserState({ search: '?token=query-secret' });
  assert.equal(captureInvitationToken(browser.location, browser.history, browser.storage), '');
  assert.equal(browser.values.size, 0);
  assert.deepEqual(browser.replacements.map(({ url }) => url), ['/invitations/accept']);
});


test('invitation UI uses body-only API transport and a secret-free Auth0 return path', async () => {
  const acceptance = await readFile(
    new URL('app/invitations/accept/page.tsx', root),
    'utf8',
  );
  const settings = await readFile(
    new URL('app/dashboard/settings/users/page.tsx', root),
    'utf8',
  );
  const callback = await readFile(
    new URL('app/api/auth/callback/route.ts', root),
    'utf8',
  );

  assert.match(acceptance, /\/api\/v1\/invitations\/preview\//);
  assert.match(acceptance, /\/api\/v1\/invitations\/accept\//);
  assert.match(acceptance, /method: "POST"/);
  assert.match(acceptance, /body: JSON\.stringify\(\{ token \}\)/);
  assert.match(acceptance, /captureInvitationToken\(window\.location, window\.history, window\.sessionStorage\)/);
  assert.match(acceptance, /clearInvitationToken\(window\.sessionStorage\)/);
  assert.match(acceptance, /\/auth\/login\?redirect=%2Finvitations%2Faccept/);
  assert.doesNotMatch(acceptance, /useSearchParams|searchParams\.get\("token"\)/);
  assert.doesNotMatch(acceptance, /preview\/\?token=/);
  assert.match(settings, /\/api\/v1\/tenant-invitations\//);
  assert.match(settings, /tenant-invitations\/\$\{invitation\.id\}\/\$\{action\}\//);
  assert.match(settings, /action: "resend" \| "revoke"/);
  assert.match(callback, /requestedRedirect === '\/invitations\/accept'/);
  assert.match(callback, /hasPropertyAccess \|\| invitationReturn/);
});


test('invitation frontend does not log or render stored token hashes', async () => {
  const acceptance = await readFile(
    new URL('app/invitations/accept/page.tsx', root),
    'utf8',
  );
  const settings = await readFile(
    new URL('app/dashboard/settings/users/page.tsx', root),
    'utf8',
  );

  assert.doesNotMatch(acceptance, /console\.(log|warn|error).*token/i);
  assert.doesNotMatch(acceptance, /[?&]token=/);
  assert.doesNotMatch(settings, /token_hash|plaintext token/i);
});
