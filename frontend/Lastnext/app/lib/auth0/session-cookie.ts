import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { CompatSession } from './session-compat';

const COOKIE_NAME = 'auth0_session';
const VERSION = 'v1';

function getSecret(): string {
  const secret =
    process.env.AUTH0_SESSION_SECRET ||
    process.env.AUTH0_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH0_CLIENT_SECRET;

  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH0_SESSION_SECRET or AUTH0_SECRET is required to encrypt auth session cookies.');
  }

  return 'dev-only-auth-session-secret-change-me';
}

function getKey(): Buffer {
  return createHash('sha256').update(getSecret()).digest();
}

function encode(value: Buffer): string {
  return value.toString('base64url');
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export async function sealSession(session: CompatSession): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(session), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, encode(iv), encode(tag), encode(encrypted)].join('.');
}

export async function openSessionCookie(cookieValue?: string | null): Promise<CompatSession | null> {
  if (!cookieValue) return null;

  try {
    const [version, iv, tag, encrypted] = cookieValue.split('.');
    if (version === VERSION && iv && tag && encrypted) {
      const decipher = createDecipheriv('aes-256-gcm', getKey(), decode(iv));
      decipher.setAuthTag(decode(tag));
      const plaintext = Buffer.concat([decipher.update(decode(encrypted)), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8')) as CompatSession;
    }

    // Backward compatibility for pre-encryption cookies. New writes always seal.
    if (cookieValue.trim().startsWith('{')) {
      return JSON.parse(cookieValue) as CompatSession;
    }
  } catch {
    return null;
  }

  return null;
}

export async function getSessionFromRequest(request: NextRequest): Promise<CompatSession | null> {
  return openSessionCookie(request.cookies.get(COOKIE_NAME)?.value);
}

export async function setSessionCookie(
  response: NextResponse,
  session: CompatSession,
  maxAge: number,
): Promise<void> {
  response.cookies.set(COOKIE_NAME, await sealSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
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
  const { refreshToken: _refreshToken, ...userWithoutRefreshToken } = session.user;
  return {
    ...session,
    user: userWithoutRefreshToken as CompatSession['user'],
  };
}
