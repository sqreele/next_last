import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('reassign visibility trusts the backend capability and active Job property', async () => {
  const component = await source('app/components/jobs/ReassignJobButton.tsx');

  assert.match(component, /const canAssign = job\.can_assign === true/);
  assert.match(component, /selectedPropertyId === jobPropertyId/);
  assert.match(component, /if \(!canAssign \|\| !propertyMatches\) \{\s*return null;/);
  assert.doesNotMatch(component, /\b(?:owner|admin|manager|supervisor|technician|viewer|billing)\b/);
});

test('authorized reassign uses same-origin BFF paths without browser credentials', async () => {
  const component = await source('app/components/jobs/ReassignJobButton.tsx');

  assert.match(component, /\/api\/v1\/jobs\/\$\{encodeURIComponent\(job\.job_id\)\}\/assignment-candidates\//);
  assert.match(component, /requestWithSession\(\s*`\/api\/v1\/jobs\/\$\{job\.job_id\}\/reassign\//);
  assert.doesNotMatch(component, /Authorization|Bearer|accessToken|refreshToken|NEXT_PUBLIC_API_URL/);
});

test('reassign waits for backend success before refreshing authoritative state', async () => {
  const component = await source('app/components/jobs/ReassignJobButton.tsx');

  assert.match(component, /await requestWithSession\([\s\S]*setOpen\(false\)[\s\S]*onComplete\?\.\(\)[\s\S]*router\.refresh\(\)/);
  assert.match(component, /currently \{currentAssignee\}/);
  assert.match(component, /requestError instanceof Error[\s\S]*Could not load assignment candidates/);
  assert.match(component, /err instanceof Error \? err\.message : "Could not reassign the job\."/);
});
