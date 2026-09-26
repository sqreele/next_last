export class RequestTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number);
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response>;

export function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number | undefined,
  consumeResponse: (response: Response) => T | Promise<T>,
): Promise<T>;
