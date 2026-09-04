import 'server-only';

import { randomBytes } from 'crypto';
import type { NextResponse } from 'next/server';
import type { CompatSession } from './session-compat';

const COOKIE_NAME = 'auth0_session';
const VERSION = 'v2';
const SESSION_ID_PATTERN = /^v2\.[A-Za-z0-9_-]{43}$/;

/** A 256-bit random opaque reference. It contains no identity or token data. */
export function createSessionReference(): string {
  return `${VERSION}.${randomBytes(32).toString('base64url')}`;
}

/** Old sealed and plaintext cookies intentionally do not have a compatibility path. */
export function readSessionReference(cookieValue?: string | null): string | null {
  return cookieValue && SESSION_ID_PATTERN.test(cookieValue) ? cookieValue : null;
}

export function setSessionCookie(
  response: NextResponse,
  reference: string,
  maxAge: number,
): number {
  if (!readSessionReference(reference)) throw new Error('Invalid server session reference.');
  response.cookies.set(COOKIE_NAME, reference, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  return Buffer.byteLength(reference, 'utf8');
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function sanitizeSessionForClient(session: CompatSession | null): CompatSession | null {
  if (!session?.user) return session;
  const userWithoutRefreshToken = { ...session.user };
  // Access and refresh tokens are server-only. Browser callers use BFF routes.
  delete (userWithoutRefreshToken as Partial<typeof session.user>).accessToken;
  delete userWithoutRefreshToken.refreshToken;
  return {
    ...session,
    user: userWithoutRefreshToken as CompatSession['user'],
  };
}
