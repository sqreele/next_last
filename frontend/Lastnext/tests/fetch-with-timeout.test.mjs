import assert from 'node:assert/strict';
import test from 'node:test';

const { fetchWithTimeout, RequestTimeoutError } = await import(
  '../app/lib/fetch-with-timeout.mjs'
);

test('aborts a stalled request at the configured deadline', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

  try {
    await assert.rejects(
      fetchWithTimeout('https://example.test/stalled', {}, 20),
      (error) => error instanceof RequestTimeoutError && error.timeoutMs === 20,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preserves cancellation from a caller-provided signal', async () => {
  const originalFetch = globalThis.fetch;
  const caller = new AbortController();
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

  try {
    const request = fetchWithTimeout(
      'https://example.test/cancelled',
      { signal: caller.signal },
      1_000,
    );
    caller.abort();
    await assert.rejects(request, (error) => error.name === 'AbortError');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps the deadline active while the response body is consumed', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input, init) => {
    const body = new ReadableStream({
      start(controller) {
        init.signal.addEventListener('abort', () => {
          controller.error(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      },
    });
    return Promise.resolve(new Response(body, {
      headers: { 'Content-Type': 'application/json' },
    }));
  };

  try {
    await assert.rejects(
      fetchWithTimeout(
        'https://example.test/stalled-body',
        {},
        20,
        (response) => response.json(),
      ),
      (error) => error instanceof RequestTimeoutError && error.timeoutMs === 20,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
