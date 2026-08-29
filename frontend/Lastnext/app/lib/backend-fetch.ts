type BackendFetchTarget = RequestInfo | URL;

const INTERNAL_BACKEND_URL =
  process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';

function targetUrl(target: BackendFetchTarget): URL {
  if (typeof target === 'string') {
    return new URL(target);
  }

  if (target instanceof URL) {
    return target;
  }

  return new URL(target.url);
}

function mergedHeaders(target: BackendFetchTarget, init?: RequestInit): Headers {
  const headers = new Headers(target instanceof Request ? target.headers : undefined);

  if (init?.headers) {
    new Headers(init.headers).forEach((value, name) => {
      headers.set(name, value);
    });
  }

  return headers;
}

/**
 * Fetch a trusted internal Django URL from the Next.js server.
 *
 * The browser must continue to use the public API transport. Keep the runtime
 * guard because some legacy client modules still import data.server.ts.
 */
export function backendFetch(
  target: BackendFetchTarget,
  init: RequestInit = {},
): Promise<Response> {
  if (typeof window !== 'undefined') {
    throw new Error('backendFetch is only available on the server');
  }

  const configuredBackendUrl = new URL(INTERNAL_BACKEND_URL);
  const requestedUrl = targetUrl(target);
  const isTrustedInternalRequest =
    configuredBackendUrl.protocol === 'http:' &&
    requestedUrl.origin === configuredBackendUrl.origin;

  const headers = mergedHeaders(target, init);
  const options: RequestInit = {
    ...init,
    headers,
  };

  // Never trust a protocol assertion supplied by a browser or another caller.
  headers.delete('X-Forwarded-Proto');
  if (isTrustedInternalRequest) {
    headers.set('X-Forwarded-Proto', 'https');
  }

  return fetch(target, options);
}
