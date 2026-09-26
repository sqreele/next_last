const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class RequestTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Request timed out after ${timeoutMs}ms.`);
    this.name = "RequestTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * A fetch wrapper with a deadline. Pass consumeResponse when the deadline must
 * include reading the response body; fetch itself resolves as soon as response
 * headers arrive.
 */
export async function fetchWithTimeout(
  input,
  init = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  consumeResponse,
) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) {
    abortFromCaller();
  } else {
    init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return consumeResponse ? await consumeResponse(response) : response;
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}
