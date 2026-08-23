import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDetailedUsersAbortError,
  requestDetailedUsers,
} from '../app/lib/hooks/detailed-users-request.mjs';

describe('requestDetailedUsers', () => {
  it('represents an optional 403 as unavailable without throwing', async () => {
    const fetchImpl = async () =>
      new Response('{"detail":"Forbidden"}', {
        status: 403,
        statusText: 'Forbidden',
      });

    const result = await requestDetailedUsers({
      accessToken: 'token',
      optional: true,
      fetchImpl,
    });
    assert.deepEqual(result, { availability: 'unavailable', users: [] });
  });

  it('surfaces a 500 response as a real failure', async () => {
    const fetchImpl = async () =>
      new Response('{"detail":"broken"}', {
        status: 500,
        statusText: 'Internal Server Error',
      });

    await assert.rejects(
      requestDetailedUsers({ accessToken: 'token', optional: true, fetchImpl }),
      /Failed to fetch users: 500 Internal Server Error/,
    );
  });

  it('surfaces malformed successful payloads', async () => {
    const fetchImpl = async () => Response.json({ results: [] });

    await assert.rejects(
      requestDetailedUsers({ accessToken: 'token', optional: true, fetchImpl }),
      /Detailed users response is not an array/,
    );
  });

  it('recognizes AbortError so cancellation remains silent in the hook', () => {
    assert.equal(
      isDetailedUsersAbortError(new DOMException('aborted', 'AbortError')),
      true,
    );
    assert.equal(isDetailedUsersAbortError(new Error('network failure')), false);
  });
});
