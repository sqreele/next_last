import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('notifications use the canonical BFF without browser bearer credentials', async () => {
  const [api, bell, push] = await Promise.all([
    source('app/lib/api/notificationsApi.ts'),
    source('app/components/notifications/NotificationBell.tsx'),
    source('app/components/pwa/PushNotificationsToggle.tsx'),
  ]);
  assert.match(api, /\/api\/v1\/notifications\/all\//);
  assert.match(bell, /\/api\/v1\/notifications\/all\/\?\$\{params\.toString\(\)\}/);
  assert.match(bell, /const READ_KEY = "pcms-notifications-read"/);
  assert.match(bell, /saveReadSet\(next\)/);
  assert.match(bell, /!readSet\.has\(n\.pm_id\)/);
  assert.match(push, /\/api\/v1\/push\/subscribe\//);
  for (const text of [api, bell, push]) {
    assert.match(text, /credentials:\s*["']include["']/);
    assert.doesNotMatch(text, /session\.user\.accessToken|Authorization|Bearer|NEXT_PUBLIC_API_URL/);
  }
});

test('CSV import keeps FormData and routes uploads through the BFF', async () => {
  const [csv, inventory] = await Promise.all([
    source('app/components/import/CsvImportDialog.tsx'),
    source('app/components/inventory/InventoryCsvImport.tsx'),
  ]);
  for (const text of [csv, inventory]) {
    assert.match(text, /new FormData\(\)/);
    assert.match(text, /body: formData/);
    assert.match(text, /credentials:\s*["']include["']/);
    assert.doesNotMatch(text, /Authorization|Bearer|accessToken|NEXT_PUBLIC_API_URL/);
  }
  assert.match(csv, /property_id=\$\{encodeURIComponent\(currentPropertyId\)\}/);
  assert.match(inventory, /\/api\/v1\/inventory\/bulk-import\//);
});

test('CSV downloads use the BFF and preserve content-disposition filenames', async () => {
  const [exportButton, bff] = await Promise.all([
    source('app/components/properties/PropertyExportButton.tsx'),
    source('app/api/v1/[...path]/route.ts'),
  ]);
  assert.match(exportButton, /fetch\(['"]\/api\/v1\/properties\/export\//);
  assert.match(exportButton, /res\.headers\.get\(['"]Content-Disposition['"]\)/);
  assert.match(exportButton, /res\.blob\(\)/);
  assert.match(bff, /backendResponse\.headers\.get\(['"]content-disposition['"]\)/);
  assert.match(bff, /responseHeaders\.set\(['"]content-disposition['"]/);
});

test('search keeps encoded query and property scope on canonical BFF paths', async () => {
  const search = await source('app/dashboard/search/SearchContent.tsx');
  assert.match(search, /new URLSearchParams\(\)/);
  assert.match(search, /jobsParams\.set\(["']search["'], query\)/);
  assert.match(search, /\/api\/v1\/jobs\//);
  assert.match(search, /\/api\/v1\/rooms\/\?property=\$\{encodeURIComponent\(selectedProperty\)\}/);
  assert.match(search, /searchRequestIdRef/);
  assert.doesNotMatch(search, /session\.user\.accessToken|Authorization|Bearer/);
});

test('canonical BFF strips browser authorization and fails closed without a server session', async () => {
  const bff = await source('app/api/v1/[...path]/route.ts');
  assert.match(bff, /headers\.delete\(['"]authorization['"]\)/);
  assert.match(bff, /Authentication required/);
  assert.match(bff, /headers\.set\(['"]authorization['"], `Bearer \$\{accessToken\}`\)/);
});

test('Phase 3B browser sources have no browser token dependency', async () => {
  const files = await Promise.all([
    source('app/lib/api/notificationsApi.ts'),
    source('app/components/notifications/NotificationBell.tsx'),
    source('app/components/pwa/PushNotificationsToggle.tsx'),
    source('app/components/import/CsvImportDialog.tsx'),
    source('app/components/properties/PropertyExportButton.tsx'),
    source('app/components/inventory/InventoryCsvImport.tsx'),
    source('app/dashboard/search/SearchContent.tsx'),
  ]);
  for (const text of files) {
    assert.doesNotMatch(text, /session\.user\.accessToken|Authorization.*Bearer|NEXT_PUBLIC_API_URL/);
  }
});
