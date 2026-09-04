import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('Phase 1 providers use safe session identity and BFF profile loading', async () => {
  const userProvider = await source('app/lib/ providers/user-provider.tsx');
  const storeProvider = await source('app/lib/providers/StoreProvider.tsx');
  assert.match(userProvider, /fetch\('\/api\/v1\/user-profiles\/me\//);
  assert.doesNotMatch(userProvider, /session\?\.user\?\.accessToken|Authorization:/);
  assert.doesNotMatch(storeProvider, /setAuthTokens|accessToken/);
});

test('Phase 1 jobs browser paths use same-origin BFF requests without bearer headers', async () => {
  const dashboard = await source('app/lib/hooks/useJobsDashboard.ts');
  const jobsApi = await source('app/lib/api/jobsApi.ts');
  const myJobs = await source('app/dashboard/myJobs/myJobs.tsx');
  const create = await source('app/components/jobs/CreateJobButton.tsx');
  const batch = await source('app/components/jobs/JobBatchActionBar.tsx');
  for (const file of [dashboard, jobsApi, myJobs, create, batch]) {
    assert.doesNotMatch(file, /session\.user\.accessToken|Authorization:\s*`Bearer/);
  }
  assert.match(jobsApi, /`\/api\/v1\/jobs/);
  assert.match(myJobs, /fetch\(`\/api\/v1\/jobs/);
  assert.match(create, /baseURL:\s*'\/api'/);
  assert.match(batch, /fetch\(`\/api\/v1\/jobs/);
});

test('primary BFF discards inbound authorization and sources bearer credentials server-side', async () => {
  const route = await source('app/api/v1/[...path]/route.ts');
  const serverSession = await source('app/lib/auth0/server-session.ts');
  assert.match(route, /headers\.delete\('authorization'\)/);
  assert.match(route, /requireServerAccessToken\(\)/);
  assert.match(route, /if \(!accessToken\)[\s\S]*status: 401/);
  assert.match(route, /headers\.set\('authorization', `Bearer \$\{accessToken\}`\)/);
  assert.match(serverSession, /requireServerAccessToken/);
});

test('session compatibility response strips bearer credentials and OAuth remains top-level', async () => {
  const cookie = await source('app/lib/auth0/session-cookie.ts');
  const login = await source('app/auth/login/page.tsx');
  assert.match(cookie, /delete .*accessToken/);
  assert.match(cookie, /delete userWithoutRefreshToken\.refreshToken/);
  assert.match(login, /window\.location\.assign/);
  assert.doesNotMatch(login, /router\.(?:push|replace)\([^)]*\/api\/auth\/login/);
});
