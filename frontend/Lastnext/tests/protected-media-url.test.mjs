import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getProtectedMediaPath } from '../app/lib/protected-media-url.mjs';

describe('protected media browser URLs', () => {
  it('preserves the same-origin authenticated proxy path', () => {
    assert.equal(
      getProtectedMediaPath('/api/protected-media/job-image/42/image/'),
      '/api/protected-media/job-image/42/image/',
    );
  });

  it('strips backend origins without reverting to a raw media URL', () => {
    assert.equal(
      getProtectedMediaPath('http://backend:8000/api/protected-media/machine/7/image/'),
      '/api/protected-media/machine/7/image/',
    );
  });

  it('does not classify legacy raw storage URLs as protected', () => {
    assert.equal(getProtectedMediaPath('/media/machine_images/private.jpg'), null);
  });
});
