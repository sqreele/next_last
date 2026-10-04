import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('dashboard session expiry clears stale auth and redirects to Login', async () => {
  const [guard, logout, layout, sessionClient, login, middleware] = await Promise.all([
    source('app/lib/hooks/useSessionGuard.ts'),
    source('app/lib/logout.ts'),
    source('app/dashboard/DashboardLayoutClient.tsx'),
    source('app/lib/auth-client.ts'),
    source('app/auth/login/page.tsx'),
    source('middleware.ts'),
  ]);

  assert.match(guard, /expireSession\(currentPath\)/);
  assert.match(logout, /window\.location\.replace\(`\/api\/auth\/logout\?returnTo=/);
  assert.match(logout, /message=session_expired/);
  assert.match(layout, /useSessionGuard\(\{/);
  assert.match(sessionClient, /refreshInterval: 60_000/);
  assert.match(sessionClient, /revalidateOnFocus: true/);
  assert.match(login, /message === 'session_expired'/);
  assert.match(middleware, /`\$\{pathname\}\$\{request\.nextUrl\.search\}`/);
});
