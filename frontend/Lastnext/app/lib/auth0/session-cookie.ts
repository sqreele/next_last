import 'server-only';

import type { NextResponse } from 'next/server';
import type { CompatSession } from './session-compat';
import {
  createSessionReference,
  OPAQUE_SESSION_REFERENCE,
  parseSessionReference,
} from './session-reference.mjs';

export { createSessionReference, OPAQUE_SESSION_REFERENCE, parseSessionReference };

export const AUTH0_SESSION_COOKIE = 'auth0_session';
export function setSessionReferenceCookie(
  response: NextResponse,
  reference: string,
  maxAge: number,
): number {
  if (!parseSessionReference(reference)) throw new Error('Invalid server session reference.');
  response.cookies.set(AUTH0_SESSION_COOKIE, reference, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  return Buffer.byteLength(reference, 'utf8');
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(AUTH0_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function sanitizeSessionForClient(session: CompatSession | null): CompatSession | null {
  if (!session?.user) return session;
  const safeUser: Partial<NonNullable<CompatSession['user']>> = { ...session.user };
  delete safeUser.accessToken;
  delete safeUser.refreshToken;
  return {
    ...session,
    user: safeUser as CompatSession['user'],
  };
}
