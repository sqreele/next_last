// Simplified server session that doesn't depend on problematic imports
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import type { CompatUser, CompatSession } from './session-compat';
import { AUTH0_SESSION_COOKIE, parseSessionReference } from './session-cookie';
import { logSessionDiagnostic } from './session-diagnostics.mjs';
import { readServerSession } from './session-store';
import { isUsableServerSession } from './session-validity.mjs';

async function openSessionReference(
  cookieValue?: string,
): Promise<CompatSession | null> {
  const reference = parseSessionReference(cookieValue);
  if (!reference) {
    logSessionDiagnostic(cookieValue, null, { lookup: 'not_attempted' });
    return null;
  }
  const session = await readServerSession(reference);
  logSessionDiagnostic(cookieValue, session, { lookup: 'success' });
  return isUsableServerSession(session) ? session : null;
}

async function openSessionFailClosed(cookieValue?: string): Promise<CompatSession | null> {
  if (!cookieValue) {
    logSessionDiagnostic(cookieValue, null);
    return null;
  }
  try {
    return await openSessionReference(cookieValue);
  } catch {
    logSessionDiagnostic(cookieValue, null, { lookup: 'failed' });
    console.error('auth_server_session_unavailable', { reason: 'store_unavailable' });
    return { user: undefined, error: 'session_error' };
  }
}

export async function getSessionFromRequest(request: NextRequest): Promise<CompatSession | null> {
  return openSessionFailClosed(request.cookies.get(AUTH0_SESSION_COOKIE)?.value);
}

export async function getCompatServerSession(): Promise<CompatSession | null> {
  const cookieStore = await cookies();
  return openSessionFailClosed(cookieStore.get(AUTH0_SESSION_COOKIE)?.value);
}

export async function requireServerAccessToken(): Promise<string | null> {
  const session = await getCompatServerSession();
  return session?.user?.accessToken || null;
}

export async function getUserProfile(userId: string): Promise<CompatUser | null> {
  try {
    return null;
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return null;
  }
}
