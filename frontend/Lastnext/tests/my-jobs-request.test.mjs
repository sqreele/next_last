import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMyJobsPropertyBoundary,
  buildMyJobsUrl,
  canMutateMyJob,
  getMyJobDetailHref,
  isCurrentMyJobsRequest,
  isMyJobsAbortError,
  requestMyJobsPage,
} from '../app/lib/hooks/my-jobs-request.mjs';

describe('My Jobs active Property contract', () => {
  it('does not build a request without an active Property', () => {
    assert.equal(buildMyJobsUrl({ propertyId: null }), null);
  });

  it('preserves the external Property identity without numeric parsing', () => {
    const url = buildMyJobsUrl({ propertyId: 'P00A12BC', page: 2 });
    assert.match(url, /property_id=P00A12BC/);
    assert.match(url, /page=2/);
  });

  it('rejects stale request generations and Property switches', () => {
    assert.equal(isCurrentMyJobsRequest({
      requestId: 2,
      currentRequestId: 3,
      requestPropertyId: 'PA',
      currentPropertyId: 'PB',
    }), false);
  });

  it('recognizes expected cancellation without treating server failures as aborts', () => {
    assert.equal(isMyJobsAbortError(new DOMException('aborted', 'AbortError')), true);
    assert.equal(isMyJobsAbortError(new Error('server failed')), false);
  });

  it('rejects jobs outside the response Property boundary', () => {
    assert.throws(
      () => assertMyJobsPropertyBoundary([{ property_id: 'PB' }], 'PA'),
      /crossed the active Property boundary/,
    );
  });

  it('shows mutation capability only when backend capability and Property agree', () => {
    assert.equal(canMutateMyJob({ can_operate: true, property_id: 'PA' }, 'PA'), true);
    assert.equal(canMutateMyJob({ can_operate: false, property_id: 'PA' }, 'PA'), false);
    assert.equal(canMutateMyJob({ can_operate: true, property_id: 'PB' }, 'PA'), false);
  });

  it('navigates with external Job and Property identities', () => {
    assert.equal(
      getMyJobDetailHref('j257DE99E', 'P00A12BC'),
      '/dashboard/jobs/j257DE99E?property_id=P00A12BC',
    );
  });

  it('surfaces server errors while accepting a valid scoped page', async () => {
    const failedFetch = async () => Response.json({ detail: 'Forbidden' }, { status: 403 });
    await assert.rejects(
      requestMyJobsPage({ propertyId: 'PA', fetchImpl: failedFetch }),
      /Forbidden/,
    );

    const successfulFetch = async () => Response.json({
      property_id: 'PA',
      results: [{ property_id: 'PA', job_id: 'j1' }],
    });
    const result = await requestMyJobsPage({ propertyId: 'PA', fetchImpl: successfulFetch });
    assert.equal(result.results[0].job_id, 'j1');
  });
});
