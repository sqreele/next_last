import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMyJobStatusUpdate,
  buildMyJobStatusUpdateUrl,
  requestMyJobStatusUpdate,
} from '../app/lib/hooks/my-job-status-update.mjs';

describe('My Job status update contract', () => {
  it('uses the dedicated action with active Property context and a status-only payload', async () => {
    let captured;
    const updatedJob = {
      job_id: 'j1',
      property_id: 'PA',
      status: 'in_progress',
    };
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return Response.json(updatedJob);
    };

    const result = await requestMyJobStatusUpdate({
      jobId: 'j1',
      propertyId: 'PA',
      status: 'in_progress',
      fetchImpl,
    });

    assert.equal(
      captured.url,
      '/api/v1/jobs/j1/update_status/?property_id=PA',
    );
    assert.equal(captured.init.method, 'PATCH');
    assert.equal(captured.init.credentials, 'include');
    assert.equal(captured.init.cache, 'no-store');
    assert.deepEqual(JSON.parse(captured.init.body), { status: 'in_progress' });
    assert.deepEqual(result, updatedJob);
  });

  it('rejects a cross-Property or stale response', async () => {
    const fetchImpl = async () => Response.json({
      job_id: 'j1',
      property_id: 'PB',
      status: 'in_progress',
    });
    await assert.rejects(
      requestMyJobStatusUpdate({
        jobId: 'j1',
        propertyId: 'PA',
        status: 'in_progress',
        fetchImpl,
      }),
      /did not match the active Job and Property/,
    );
  });

  it('replaces the rendered Job with the updated status after success', () => {
    const jobs = [
      { job_id: 'j1', status: 'pending' },
      { job_id: 'j2', status: 'pending' },
    ];
    const next = applyMyJobStatusUpdate(jobs, {
      job_id: 'j1',
      status: 'in_progress',
    });
    assert.equal(next[0].status, 'in_progress');
    assert.equal(next[1], jobs[1]);
  });

  it('requires both identities when building the scoped action URL', () => {
    assert.equal(buildMyJobStatusUpdateUrl('j1', ''), null);
    assert.equal(buildMyJobStatusUpdateUrl('', 'PA'), null);
  });
});
