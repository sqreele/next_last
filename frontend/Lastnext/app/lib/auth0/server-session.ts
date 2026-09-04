// Simplified server session that doesn't depend on problematic imports
import type { CompatUser, CompatSession } from './session-compat';
import { cookies } from 'next/headers';
import { openSessionCookie } from './session-cookie';
import { logSessionDiagnostic } from './session-diagnostics.mjs';

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

    const parsed = await openSessionCookie(cookieValue);
    logSessionDiagnostic(cookieValue, parsed);
    if (!parsed?.user || !parsed.user.accessToken) {
      return null;
    }

    if (parsed.user.accessTokenExpires && Date.now() > parsed.user.accessTokenExpires) {
      return null;
    }

    return parsed;
    
  } catch (error) {
    logSessionDiagnostic(cookieValue, null);
    console.error('❌ Error in getCompatServerSession:', error);
    return { user: undefined, error: 'session_error' };
  }
}

export async function getUserProfile(userId: string): Promise<CompatUser | null> {
  try {
    return null;
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return null;
  }
}
