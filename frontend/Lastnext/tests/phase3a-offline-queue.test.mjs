import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('offline records whitelist only safe same-origin BFF paths and omit credentials', async () => {
  const queue = await source('app/lib/offline-queue.ts');
  assert.match(queue, /endpoint\.startsWith\('\/api\/v1\/'\)/);
  assert.match(queue, /Offline queue accepts only same-origin \/api\/v1\/ paths/);
  assert.doesNotMatch(queue, /accessToken|refreshToken|Authorization/);
  assert.match(queue, /function sanitizeQueueItem/);
  assert.match(queue, /endpoint: item\.endpoint/);
});

test('legacy queue credentials are discarded and 401 has no bearer fallback', async () => {
  const queue = await source('app/lib/offline-queue.ts');
  assert.match(queue, /function sanitizeQueueItem/);
  assert.match(queue, /if \(response\.status === 401\)/);
  assert.match(queue, /bumpRetry\(item\.id\)/);
  assert.doesNotMatch(queue, /Bearer\s*\$|Authorization/);
});

test('replay uses cookie-authenticated same-origin fetch without browser token access', async () => {
  const hook = await source('app/lib/hooks/useOfflineQueue.ts');
  assert.match(hook, /fetch\(item\.endpoint/);
  assert.match(hook, /credentials: 'include'/);
  assert.match(hook, /'Content-Type': 'application\/json'/);
  assert.doesNotMatch(hook, /session\.user\.accessToken|Authorization|accessToken|Bearer/);
});

test('logout durably clears authenticated queued mutations before navigation', async () => {
  const logout = await source('app/lib/logout.ts');
  const queue = await source('app/lib/offline-queue.ts');
  assert.match(logout, /await clearQueue\(\)/);
  assert.match(logout, /offline_queue_clear_failed_before_logout/);
  assert.match(queue, /export async function clearQueue/);
  assert.match(queue, /await clearIndexedDb\(\)/);
});

test('every discovered browser logout initiator delegates to the safe logout core', async () => {
  const [button, sessionClient, pending, logoutPage, apiClient] = await Promise.all([
    source('app/components/auth/LogoutButton.tsx'),
    source('app/lib/session.client.ts'),
    source('app/auth/access-pending/page.tsx'),
    source('app/auth/logout/page.tsx'),
    source('app/lib/api-client.ts'),
  ]);
  for (const text of [button, sessionClient, pending, logoutPage]) {
    assert.match(text, /appSignOut\(/);
  }
  assert.match(apiClient, /function terminateSessionSafely/);
  assert.match(apiClient, /terminalLogoutPromise/);
  assert.match(apiClient, /await terminateSessionSafely\(\)/);
  assert.doesNotMatch(apiClient, /window\.location\.href\s*=\s*'\/auth\/logout/);
});

test('safe logout goes directly to the server endpoint after durable queue clearing', async () => {
  const logout = await source('app/lib/logout.ts');
  assert.match(logout, /await clearQueue\(\)/);
  assert.match(logout, /`\/api\/auth\/logout\?returnTo=/);
  assert.doesNotMatch(logout, /`\/auth\/logout\?returnTo=/);
});
