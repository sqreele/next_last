import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

async function clientSources(directory = new URL('../app/', import.meta.url)) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return clientSources(target);
    if (!/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) return [];
    const text = await readFile(target, 'utf8');
    return /^\s*["']use client["'];/m.test(text)
      ? [{ name: path.relative(new URL('../', import.meta.url).pathname, target.pathname), text }]
      : [];
  }));
  return nested.flat();
}

test('rooms, properties, detailed users, and job actions use session BFF transport', async () => {
  const files = await Promise.all([
    source('app/lib/hooks/detailed-users-request.mjs'),
    source('app/components/jobs/JobAuditTimeline.tsx'),
    source('app/components/jobs/ReassignJobButton.tsx'),
    source('app/components/jobs/UpdateStatusModal.tsx'),
    source('app/dashboard/rooms/page.tsx'),
    source('app/dashboard/properties/page.tsx'),
  ]);
  assert.match(files[0], /\/api\/v1\/users\/detailed\//);
  assert.match(files[1], /\/api\/v1\/jobs\/\$\{jobId\}\/audit-log\//);
  assert.match(files[2], /\/api\/v1\/jobs\/\$\{job\.job_id\}\/reassign\//);
  assert.match(files[3], /\/api\/v1\/jobs\/\$\{job\.job_id\}\//);
  for (const text of files) {
    assert.doesNotMatch(text, /session\.user\.accessToken|Authorization.*Bearer|NEXT_PUBLIC_API_URL/);
  }
});

test('client session compatibility state exposes no token fields', async () => {
  const files = await Promise.all([
    source('app/lib/auth-client.ts'),
    source('app/lib/hooks/useAuth.ts'),
    source('app/lib/hooks/useSessionGuard.ts'),
    source('app/lib/stores/mainStore.ts'),
    source('app/components/auth/ProtectedRoute.tsx'),
  ]);
  for (const text of files) {
    assert.doesNotMatch(text, /accessToken|refreshToken/);
  }
});

test('canonical BFF remains the sole browser bearer boundary', async () => {
  const bff = await source('app/api/v1/[...path]/route.ts');
  assert.match(bff, /headers\.delete\(['"]authorization['"]\)/);
  assert.match(bff, /Authentication required/);
  assert.match(bff, /headers\.set\(['"]authorization['"], `Bearer \$\{accessToken\}`\)/);
});

test('browser helper preserves BFF transport, multipart handling, and report cancellation', async () => {
  const apiClient = await source('app/lib/api-client.ts');
  assert.match(apiClient, /export async function requestWithSession/);
  assert.match(apiClient, /baseURL:[\s\S]*return ''/);
  assert.match(apiClient, /delete config\.headers\.Authorization/);
  assert.match(apiClient, /config\.data instanceof FormData/);
  assert.match(apiClient, /const requestConfig = \{ signal \}/);
  assert.doesNotMatch(apiClient, /getAccessToken|Bearer \$\{|session\.user\.accessToken/);
});

test('server data access is explicitly server-only and has no browser fallback', async () => {
  const serverData = await source('app/lib/data.server.ts');
  assert.match(serverData, /import 'server-only';/);
  assert.match(serverData, /requireServerAccessToken/);
  assert.match(serverData, /await backendFetch\(absoluteUrl/);
  assert.doesNotMatch(serverData, /typeof window/);
});

test('repository client sources have no tokens or server-only imports', async () => {
  const files = await clientSources();
  assert.ok(files.length > 0);
  for (const { name, text } of files) {
    if (name.endsWith('app/lib/logout.ts')) {
      // Deletion of historic local keys is not readable token state.
      assert.match(text, /safeClearLocalStorageKeys\([\s\S]*["']accessToken["'][\s\S]*["']refreshToken["']/);
    } else if (!name.endsWith('app/lib/api-client.ts')) {
      assert.doesNotMatch(text, /session\.user\.accessToken|Authorization.*Bearer|Bearer \$|\baccessToken\b|\brefreshToken\b/, name);
    }
    assert.doesNotMatch(text, /data\.server|server-session|next\/headers|next\/cookies/, name);
  }
});
