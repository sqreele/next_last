import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const browserTokenPattern = /session\.user\.accessToken|Authorization\s*:\s*`Bearer|Authorization.*Bearer/;

test('PM service uses canonical same-origin BFF paths and retains request semantics', async () => {
  const text = await source('app/lib/PreventiveMaintenanceService.ts');
  assert.match(text, /baseUrl: string = "\/api\/v1\/preventive-maintenance"/);
  assert.match(text, /params: cleanParams/);
  assert.match(text, /formData\.append\("property_id", data\.property_id\)/);
  assert.match(text, /formData\.append\("machine_ids", String\(id\)\)/);
  assert.match(text, /apiClient\.put<PreventiveMaintenance>\(/);
  assert.match(text, /apiClient\.delete\(`\$\{this\.baseUrl\}\/\$\{id\}\/`/);
  assert.doesNotMatch(text, browserTokenPattern);
  assert.doesNotMatch(text, /createPreventiveMaintenanceService = \(accessToken/);
});

test('PM hooks and context have no browser bearer-token dependency', async () => {
  const paths = [
    'app/lib/hooks/usePreventiveMaintenanceJobs.ts',
    'app/lib/hooks/usePreventiveMaintenanceActions.ts',
    'app/lib/PreventiveContext.tsx',
  ];
  for (const path of paths) assert.doesNotMatch(await source(path), browserTokenPattern, path);
  const jobs = await source(paths[0]);
  assert.match(jobs, /params\.property_id = propertyId/);
  assert.match(jobs, /fetchData<\{ jobs: Job\[\]; count: number \}>\(pmUrl\)/);
  const actions = await source(paths[1]);
  assert.match(actions, /createPreventiveMaintenanceService\(\)/);
  assert.match(actions, /property_id: selectedProperty/);
});

test('machine and topic services keep property query contracts without browser Authorization', async () => {
  const machines = await source('app/lib/MachineService.ts');
  assert.match(machines, /"\/api\/v1\/machines\/"/);
  assert.match(machines, /property_id: propertyId/);
  assert.match(machines, /page_size: String\(DEFAULT_MACHINE_PAGE_SIZE\)/);
  assert.doesNotMatch(machines, browserTokenPattern);
  const topics = await source('app/lib/TopicService.ts');
  assert.match(topics, /fetch\(`\/api\/v1\/topics\/\$\{query\}`/);
  assert.match(topics, /\?property=\$\{encodeURIComponent\(propertyId\)\}/);
  assert.doesNotMatch(topics, browserTokenPattern);
});

test('canonical BFF ignores browser Authorization and relies on the server session', async () => {
  const bff = await source('app/api/v1/[...path]/route.ts');
  assert.match(bff, /headers\.delete\('authorization'\)/);
  assert.match(bff, /requireServerAccessToken\(\)/);
  assert.match(bff, /headers\.set\('authorization', `Bearer \$\{accessToken\}`\)/);
  assert.match(bff, /status: 401/);
});

test('session-compat response remains sanitized of access and refresh tokens', async () => {
  const route = await source('app/api/auth/session-compat/route.ts');
  const sanitizer = await source('app/lib/auth0/session-cookie.ts');
  assert.match(route, /sanitizeSessionForClient\(updatedSession\)/);
  assert.match(sanitizer, /delete \(userWithoutRefreshToken as Partial<typeof session\.user>\)\.accessToken/);
  assert.match(sanitizer, /delete userWithoutRefreshToken\.refreshToken/);
});
