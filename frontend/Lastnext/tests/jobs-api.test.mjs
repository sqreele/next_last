import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function loadService(fetchImpl) {
  const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
  const contracts = {};
  const typesSource = await readFile(new URL('../app/lib/api/types.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(typesSource, { compilerOptions }).outputText, { exports: contracts });
  const exports = {};
  const source = await readFile(new URL('../app/lib/api/jobsApi.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions }).outputText, {
    exports, fetch: fetchImpl, FormData, URLSearchParams, AbortController,
    setTimeout, clearTimeout, console,
    require(name) {
      if (name === './types') return contracts;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return new exports.JobsApiService();
}

test('Jobs updates send JSON through the same-origin BFF', async () => {
  const service = await loadService(async (url, init) => {
    assert.equal(url, '/api/v1/jobs/job-a/');
    assert.equal(init.method, 'PATCH');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), { status: 'completed' });
    assert.equal(init.headers.Authorization, undefined);
    return Response.json({ id: 1, job_id: 'job-a', status: 'completed' });
  });
  assert.equal((await service.updateJob('job-a', { status: 'completed' })).status, 'completed');
});

test('Jobs uploads leave multipart boundaries to the browser', async () => {
  const body = new FormData();
  body.append('description', 'Repair');
  const service = await loadService(async (_url, init) => {
    assert.equal(init.body, body);
    assert.equal(init.headers['Content-Type'], undefined);
    return Response.json({ job_id: 'new-job' });
  });
  assert.equal((await service.createJob(body)).job_id, 'new-job');
});

test('204 deletion succeeds once and invalidates job and list caches', async () => {
  let detailReads = 0;
  let listReads = 0;
  let deletes = 0;
  const service = await loadService(async (url, init) => {
    if (init.method === 'DELETE') {
      deletes++;
      return new Response(null, { status: 204 });
    }
    if (url.includes('?')) {
      listReads++;
      return Response.json({ results: [], count: 0 });
    }
    detailReads++;
    return Response.json({ job_id: 'job-a' });
  });
  await service.getJobs();
  await service.getJobs();
  await service.getJob('job-a');
  await service.getJob('job-a');
  assert.equal(listReads, 1);
  assert.equal(detailReads, 1);
  await service.deleteJob('job-a');
  await service.getJobs();
  await service.getJob('job-a');
  assert.equal(deletes, 1);
  assert.equal(listReads, 2);
  assert.equal(detailReads, 2);
});

test('Jobs cache separates property filters and explicit invalidation refreshes them', async () => {
  const requests = [];
  const service = await loadService(async (url) => {
    requests.push(url);
    return Response.json({ results: [], count: 0 });
  });
  await service.getJobs({ property: 'property-a' });
  await service.getJobs({ property: 'property-b' });
  await service.getJobs({ property: 'property-a' });
  assert.equal(requests.length, 2);
  assert.match(requests[0], /property_id=property-a/);
  assert.match(requests[1], /property_id=property-b/);
  service.clearCache();
  await service.getJobs({ property: 'property-a' });
  assert.equal(requests.length, 3);
});
