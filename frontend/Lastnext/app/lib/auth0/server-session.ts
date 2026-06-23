// Simplified server session that doesn't depend on problematic imports
import type { CompatUser, CompatSession } from './session-compat';
import { cookies } from 'next/headers';
import { openSessionCookie } from './session-cookie';

export async function getCompatServerSession(): Promise<CompatSession | null> {
  try {
    // Production mode: Always use real session data
    
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('auth0_session');
    if (!sessionCookie?.value) {
      // Only log in development - this happens frequently for unauthenticated requests
      if (process.env.NODE_ENV === 'development') {
      }
      return null;
    }

    const parsed = await openSessionCookie(sessionCookie.value);
    if (!parsed?.user || !parsed.user.accessToken) {
      return null;
    }

    if (parsed.user.accessTokenExpires && Date.now() > parsed.user.accessTokenExpires) {
      return null;
    }

    return parsed;
    
  } catch (error) {
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
