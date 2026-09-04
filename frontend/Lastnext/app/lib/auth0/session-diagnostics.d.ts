import type { CompatSession } from './session-compat';

export interface SessionDiagnostic {
  auth0_session_cookie_present: 'yes' | 'no';
  auth0_session_cookie_bytes: number;
  session_open_succeeded: 'yes' | 'no';
  required_user_id_present: 'yes' | 'no';
  access_token_present: 'yes' | 'no';
  access_token_expired: 'yes' | 'no';
}

export function createSessionDiagnostic(
  cookieValue: string | undefined,
  session: CompatSession | null,
  now?: number,
): SessionDiagnostic;

export function logSessionDiagnostic(
  cookieValue: string | undefined,
  session: CompatSession | null,
): void;
