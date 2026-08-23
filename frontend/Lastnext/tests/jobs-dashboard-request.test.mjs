import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertJobsDashboardPropertyBoundary,
  buildJobsDashboardUrl,
  getJobsDashboardDetailHref,
  isCurrentJobsDashboardRequest,
  isJobsDashboardAbortError,
  requestJobsDashboardPage,
} from '../app/lib/hooks/jobs-dashboard-request.mjs';

describe('Jobs dashboard active Property contract', () => {
  it('does not issue a request without an active Property', () => {
    assert.equal(buildJobsDashboardUrl({ propertyId: null }), null);
  });

  it('preserves the external Property identity and server-side filters', () => {
    const url = buildJobsDashboardUrl({
      propertyId: 'P00A12BC',
      page: 2,
      filters: { status: 'pending', priority: 'high', search: 'room 101' },
    });
    assert.match(url, /property_id=P00A12BC/);
    assert.match(url, /page=2/);
    assert.match(url, /status=pending/);
    assert.match(url, /priority=high/);
    assert.match(url, /search=room\+101/);
  });

  it('rejects stale requests and cross-Property rows', () => {
    assert.equal(isCurrentJobsDashboardRequest({
      requestId: 1, currentRequestId: 2,
      requestPropertyId: 'PA', currentPropertyId: 'PB',
    }), false);
    assert.throws(
      () => assertJobsDashboardPropertyBoundary([{ property_id: 'PB' }], 'PA'),
      /crossed the active Property boundary/,
    );
  });

  it('recognizes expected cancellation', () => {
    assert.equal(isJobsDashboardAbortError(new DOMException('cancelled', 'AbortError')), true);
    assert.equal(isJobsDashboardAbortError(new Error('server failed')), false);
  });

  it('builds detail links from external Job and Property identities', () => {
    assert.equal(
      getJobsDashboardDetailHref('j257DE99E', 'P00A12BC'),
      '/dashboard/jobs/j257DE99E?property_id=P00A12BC',
    );
  });

  it('surfaces server errors and accepts only a matching response scope', async () => {
    const failedFetch = async () => Response.json({ detail: 'Forbidden' }, { status: 403 });
    await assert.rejects(
      requestJobsDashboardPage({ propertyId: 'PA', fetchImpl: failedFetch }),
      /Forbidden/,
    );

    const successfulFetch = async () => Response.json({
      property_id: 'PA',
      results: [{ property_id: 'PA', job_id: 'j1' }],
    });
    const result = await requestJobsDashboardPage({ propertyId: 'PA', fetchImpl: successfulFetch });
    assert.equal(result.results[0].job_id, 'j1');
  });
});
