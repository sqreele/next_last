// Simplified server session that doesn't depend on problematic imports
import type { CompatUser, CompatSession } from './session-compat';
import { cookies } from 'next/headers';
import { fetchProperties } from '../data.server';
import { updateUserProfile } from '../data.server';

export async function getCompatServerSession(): Promise<CompatSession | null> {
  try {
    // Production mode: Always use real session data
    
    // Read session from auth0_session cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('auth0_session');
    if (!sessionCookie?.value) {
      // Only log in development - this happens frequently for unauthenticated requests
      if (process.env.NODE_ENV === 'development') {
      }
      return null;
    }

    try {
      const parsed = JSON.parse(sessionCookie.value);
      
      // Validate that we have a proper session with user and access token
      if (!parsed?.user || !parsed.user.accessToken) {
        if (process.env.NODE_ENV === 'development') {
        }
        return null;
      }
      
      // Check if the access token has expired
      if (parsed.user.accessTokenExpires && Date.now() > parsed.user.accessTokenExpires) {
        if (process.env.NODE_ENV === 'development') {
        }
        return null;
      }
      
      // Only log in development to avoid flooding production logs
      if (process.env.NODE_ENV === 'development') {
      }
      return parsed as CompatSession;
    } catch (e) {
      console.error('❌ Failed to parse auth0_session cookie:', e);
      return null;
    }
    
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
