// Simplified server session that doesn't depend on problematic imports
import type { CompatUser, CompatSession } from './session-compat';
import { cookies } from 'next/headers';
import { readSessionReference } from './session-cookie';
import { logSessionDiagnostic } from './session-diagnostics.mjs';
import { loadServerSession } from './server-session-store';

export async function getCompatServerSession(): Promise<CompatSession | null> {
  let cookieValue: string | undefined;
  try {
    // Production mode: Always use real session data
    
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('auth0_session');
    cookieValue = sessionCookie?.value;
    if (!cookieValue) {
      logSessionDiagnostic(cookieValue, null);
      // Only log in development - this happens frequently for unauthenticated requests
      if (process.env.NODE_ENV === 'development') {
      }
      return null;
    }

    const reference = readSessionReference(cookieValue);
    if (!reference) {
      logSessionDiagnostic(cookieValue, null, { lookup: 'not_attempted' });
      return null;
    }
    const parsed = await loadServerSession(reference);
    logSessionDiagnostic(cookieValue, parsed, { lookup: 'success' });
    if (!parsed?.user || !parsed.user.accessToken) {
      return null;
    }

    if (parsed.user.accessTokenExpires && Date.now() > parsed.user.accessTokenExpires) {
      return null;
    }

    return parsed;
    
  } catch {
    logSessionDiagnostic(cookieValue, null, { lookup: 'failed' });
    console.error('auth_server_session_unavailable', { reason: 'store_unavailable' });
    return { user: undefined, error: 'session_error' };
  }
}

/** Server/BFF-only auth boundary. Browser input is never accepted as a token. */
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
