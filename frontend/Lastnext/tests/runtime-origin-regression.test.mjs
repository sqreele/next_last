import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const oldOrigin = `https://${'hotelcare' + 'pro.com'}`;
const oldAudience = `https://api.${'hotelcare' + 'pro.com'}`;

async function runtimeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await runtimeFiles(path));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test('production runtime cannot resolve HotelCarePro API/Auth0 origins', async () => {
  const appDirectory = fileURLToPath(new URL('app/', root));
  const files = [
    ...await runtimeFiles(appDirectory),
    new URL('middleware.ts', root),
    new URL('next.config.mjs', root),
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.equal(source.includes(oldOrigin), false, `${file} retains old production origin`);
    assert.equal(source.includes(oldAudience), false, `${file} retains old Auth0 audience`);
  }
});

test('notification polling uses the canonical public API origin', async () => {
  const source = await readFile(new URL('app/components/notifications/NotificationBell.tsx', root), 'utf8');
  assert.match(source, /process\.env\.NEXT_PUBLIC_API_URL/);
  assert.match(source, /"https:\/\/staymaint\.com"/);
  assert.match(source, /\$\{API_BASE_URL\}\/api\/v1\/notifications\/all\//);
});

test('Auth0 login uses the StayMaint audience fallback', async () => {
  const source = await readFile(new URL('app/lib/auth0/login-flow.ts', root), 'utf8');
  assert.match(source, /const fallback = 'https:\/\/api\.staymaint\.com'/);
  assert.doesNotMatch(source, /api\.hotelcarepro\.com/);
});
