import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  hasUsableInvitationSession,
  resolveInvitationBackendPath,
} from '../app/lib/invitation-bff.mjs';
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

  assert.equal(
    captureInvitationToken(
      { ...browser.location, hash: '', search: '' },
      browser.history,
      browser.storage,
    ),
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


test('BFF exposes only the invitation allow-list with correct auth policy', () => {
  assert.deepEqual(resolveInvitationBackendPath(['preview'], 'POST'), {
    path: 'invitations/preview', requiresAuth: false,
  });
  assert.deepEqual(resolveInvitationBackendPath(['accept'], 'POST'), {
    path: 'invitations/accept', requiresAuth: true,
  });
  assert.deepEqual(resolveInvitationBackendPath(['manage'], 'GET'), {
    path: 'tenant-invitations', requiresAuth: true,
  });
  assert.deepEqual(resolveInvitationBackendPath(['workspace'], 'GET'), {
    path: 'tenant-invitations/workspace', requiresAuth: true,
  });
  assert.deepEqual(resolveInvitationBackendPath(['manage', '42', 'resend'], 'POST'), {
    path: 'tenant-invitations/42/resend', requiresAuth: true,
  });
  assert.equal(resolveInvitationBackendPath(['manage', '../secrets', 'revoke'], 'POST'), null);
  assert.equal(resolveInvitationBackendPath(['preview'], 'GET'), null);
  assert.equal(resolveInvitationBackendPath(['arbitrary'], 'POST'), null);
});


test('authenticated BFF forwarding fails closed for missing or expired sealed sessions', () => {
  assert.equal(hasUsableInvitationSession(null), false);
  assert.equal(hasUsableInvitationSession({ user: {} }), false);
  assert.equal(hasUsableInvitationSession({ user: { accessToken: 'backend-secret', accessTokenExpires: 99 } }, 100), false);
  assert.equal(hasUsableInvitationSession({ user: { accessToken: 'backend-secret', accessTokenExpires: 101 } }, 100), true);
});


test('BFF obtains Bearer server-side and never forwards browser auth or cookies', async () => {
  const route = await readFile(new URL('app/api/invitations/[...path]/route.ts', root), 'utf8');
  assert.match(route, /getSessionFromRequest\(request\)/);
  assert.match(route, /hasUsableInvitationSession\(session\)/);
  assert.match(route, /headers\.set\('authorization', `Bearer \$\{accessToken\}`\)/);
  assert.match(route, /request\.arrayBuffer\(\)/);
  assert.match(route, /request\.method/);
  assert.doesNotMatch(route, /request\.headers\.forEach/);
  assert.doesNotMatch(route, /headers\.set\(['"]cookie/i);
  assert.doesNotMatch(route, /console\.(log|warn|error).*token/i);
});


test('browser invitation flows use body-only same-origin BFF transport', async () => {
  const acceptance = await readFile(new URL('app/invitations/accept/page.tsx', root), 'utf8');
  const settings = await readFile(new URL('app/dashboard/settings/users/page.tsx', root), 'utf8');
  const callback = await readFile(new URL('app/api/auth/callback/route.ts', root), 'utf8');

  assert.match(acceptance, /\/api\/invitations\/preview/);
  assert.match(acceptance, /\/api\/invitations\/accept/);
  assert.match(acceptance, /body: JSON\.stringify\(\{ token \}\)/);
  assert.match(acceptance, /captureInvitationToken\(window\.location, window\.history, window\.sessionStorage\)/);
  assert.match(acceptance, /clearInvitationToken\(window\.sessionStorage\)/);
  assert.match(acceptance, /\/auth\/login\?redirect=%2Finvitations%2Faccept/);
  assert.match(acceptance, /payload\?\.code === "invitation_email_mismatch"/);
  assert.match(acceptance, /Email does not match this invitation\. Please sign in with the email address that received the invitation\./);
  assert.doesNotMatch(acceptance, /useSearchParams|searchParams\.get\(["']token/);
  assert.doesNotMatch(acceptance, /[?&]token=/);
  assert.doesNotMatch(acceptance, /Authorization|accessToken|Bearer/);

  assert.match(settings, /\/api\/invitations\/manage/);
  assert.match(settings, /\/api\/invitations\/workspace/);
  assert.match(settings, /action: "resend" \| "revoke"/);
  assert.match(settings, /Invitation sent to \$\{invitation\.email\}/);
  assert.match(settings, /submissionRef\.current/);
  assert.match(settings, /active invitation already exists/i);
  assert.doesNotMatch(settings, /Authorization|accessToken|Bearer|token_hash/);

  assert.match(callback, /resolvePostLoginDestination\(requestedRedirect, hasPropertyAccess\)/);
});


test('settings invitation form covers role, property, and submission states', async () => {
  const settings = await readFile(new URL('app/dashboard/settings/users/page.tsx', root), 'utf8');

  assert.match(settings, /const roles = \["owner", "admin", "manager", "supervisor", "technician", "viewer", "billing"\]/);
  assert.match(settings, /const tenantWideRoles = new Set\(\["owner", "admin", "manager"\]\)/);
  assert.match(settings, /const propertyRequiredRoles = new Set\(\["supervisor", "technician", "viewer"\]\)/);
  assert.match(settings, /properties\.filter\(\(property\) => String\(property\.tenant\) === tenantId\)/);
  assert.match(settings, /properties: propertyIds/);
  assert.match(settings, /onCheckedChange=\{\(next\) => setPropertyIds/);
  assert.match(settings, /propertyRequiredRoles\.has\(role\) && propertyIds\.length === 0/);

  assert.match(settings, /setSubmitting\(true\)/);
  assert.match(settings, /setSubmitting\(false\)/);
  assert.match(settings, /submitting \? "Sending…" : "Send invitation"/);
  assert.match(settings, /Invitation sent to \$\{invitation\.email\}/);
  assert.match(settings, /invitation\.email_sent === false/);
  assert.match(settings, /invitation was created, but email delivery failed/i);
  assert.match(settings, /active invitation already exists/i);
  assert.match(settings, /pending invitation already exists/i);

  assert.match(settings, /invitationAction\(invitation, "resend"\)/);
  assert.match(settings, /invitationAction\(invitation, "revoke"\)/);
  assert.match(settings, /actionRequestRef\.current/);
  assert.match(settings, /disabled=\{actionId !== null\}/);
  assert.match(settings, /if \(!tenantId \|\| submissionRef\.current\) return/);
  assert.match(settings, /submissionRef\.current = true/);
  assert.match(settings, /submissionRef\.current = false/);
});


test('invitation user-facing content is StayMaint branded', async () => {
  const acceptance = await readFile(new URL('app/invitations/accept/page.tsx', root), 'utf8');
  assert.match(acceptance, /StayMaint tenant invitation/);
  assert.doesNotMatch(acceptance, /HotelCare Pro|hotelcarepro\.com/i);
});


test('invitation acceptance explains subscription user capacity errors', async () => {
  const acceptance = await readFile(new URL('app/invitations/accept/page.tsx', root), 'utf8');
  assert.match(acceptance, /subscription_user_limit_reached/);
  assert.match(acceptance, /Your plan allows up to \$\{payload\.limit\} users/);
  assert.match(acceptance, /Remove a user or upgrade your plan to add another/);
  assert.match(acceptance, /response\.status === 409 && !capacityReached/);
});
