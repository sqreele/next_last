import type { CompatSession } from './auth0/session-compat';

export type InvitationBackendTarget = {
  path: string;
  requiresAuth: boolean;
};

export function resolveInvitationBackendPath(
  segments: string[],
  method: string,
): InvitationBackendTarget | null;

export function hasUsableInvitationSession(
  session: CompatSession | null,
  now?: number,
): boolean;
