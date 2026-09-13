import type { CompatSession } from './session-compat';

export type SessionLookup = 'not_attempted' | 'success' | 'failed' | 'edge_deferred';

export function createSessionDiagnostic(
  cookieValue: string | undefined,
  session: CompatSession | null,
  options?: { lookup?: SessionLookup } | number,
  now?: number,
): Record<string, string | number>;
export function logSessionDiagnostic(
  cookieValue: string | undefined,
  session: CompatSession | null,
  options?: { lookup?: SessionLookup },
): void;
