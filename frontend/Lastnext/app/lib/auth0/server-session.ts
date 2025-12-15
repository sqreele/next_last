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
        console.log('❌ No auth0_session cookie found');
      }
      return null;
    }

    try {
      const parsed = JSON.parse(sessionCookie.value);
      
      // Validate that we have a proper session with user and access token
      if (!parsed?.user || !parsed.user.accessToken) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Invalid session data - missing user or access token');
        }
        return null;
      }
      
      // Check if the access token has expired
      if (parsed.user.accessTokenExpires && Date.now() > parsed.user.accessTokenExpires) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Access token has expired');
        }
        return null;
      }
      
      // Only log in development to avoid flooding production logs
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Valid session found for user:', parsed.user.username);
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

// Function to get user profile by ID
export async function getUserProfile(userId: string): Promise<CompatUser | null> {
  try {
    // Production mode: Fetch real user profile from database or Auth0
    // TODO: Implement real user profile fetching
    return null;
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return null;
  }
}
