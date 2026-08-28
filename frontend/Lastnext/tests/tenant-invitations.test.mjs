import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';


const root = new URL('../', import.meta.url);


test('invitation UI uses the existing API proxy and Auth0 return path', async () => {
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
  assert.match(acceptance, /\/auth\/login\?redirect=/);
  assert.match(settings, /\/api\/v1\/tenant-invitations\//);
  assert.match(settings, /tenant-invitations\/\$\{invitation\.id\}\/\$\{action\}\//);
  assert.match(settings, /action: "resend" \| "revoke"/);
  assert.match(callback, /requestedRedirect\.startsWith\('\/invitations\/accept\?'/);
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
  assert.doesNotMatch(settings, /token_hash|plaintext token/i);
});
