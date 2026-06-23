import { NextResponse } from 'next/server';
import { getCompatServerSession } from '@/app/lib/auth0/server-session';
import { fetchProperties } from '@/app/lib/data.server';
import { Property } from '@/app/lib/types';
import { DEBUG_CONFIG } from '@/app/lib/config';
import { API_CONFIG } from '@/app/lib/config';
import { sanitizeSessionForClient } from '@/app/lib/auth0/session-cookie';

interface UserProfileResponse {
  profile_image?: string | null;
  positions?: string | null;
  properties?: Property[];
  user_property_name?: string | null;
  user_property_id?: string | null;
  profile_property_name?: string | null;
  profile_property_id?: string | null;
}

export async function GET() {
  try {
    const session = await getCompatServerSession();
    
    if (!session?.user) {
      return NextResponse.json({ user: undefined }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Debug: Log session structure
    if (DEBUG_CONFIG.logSessions) {
    }

    // Fetch properties for the user if they have an access token.
    // Backend property access can come from either Property.users or UserProfile.properties,
    // so we merge both sources to keep frontend session data complete.
    let properties: Property[] = [];
    let profileData: UserProfileResponse | null = null;
    if (session.user.accessToken) {
      try {
        if (DEBUG_CONFIG.logApiCalls) {
        }
        properties = await fetchProperties(session.user.accessToken);
        if (DEBUG_CONFIG.logApiCalls) {
        }
      } catch (error) {
        console.error('❌ Error fetching properties for session:', error);
        // Continue with empty properties if fetch fails
      }

      try {
        const profileResponse = await fetch(`${API_CONFIG.baseUrl}/api/v1/user-profiles/me/`, {
          headers: {
            Authorization: `Bearer ${session.user.accessToken}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        });

        if (profileResponse.ok) {
          profileData = (await profileResponse.json()) as UserProfileResponse;
        } else if (DEBUG_CONFIG.logApiCalls) {
          console.warn('⚠️ Failed to fetch /user-profiles/me for session-compat:', profileResponse.status);
        }
      } catch (profileError) {
        console.error('❌ Error fetching user profile for session:', profileError);
      }
    } else if (DEBUG_CONFIG.logSessions) {
    }

    const profileProperties = Array.isArray(profileData?.properties) ? profileData.properties : [];
    const mergedProperties = [...properties];
    for (const profileProp of profileProperties) {
      const profilePropId = String(profileProp?.property_id || profileProp?.id || '');
      if (!profilePropId) continue;
      const exists = mergedProperties.some((existingProp) => {
        const existingId = String(existingProp?.property_id || existingProp?.id || '');
        return existingId === profilePropId;
      });
      if (!exists) {
        mergedProperties.push(profileProp);
      }
    }

    // Update user profile with Auth0 data if available
    // Note: Profile updates should be done explicitly, not automatically
    // This prevents issues with session cookie access and unnecessary updates
    if (session.user.auth0_profile && DEBUG_CONFIG.logAuth) {
    }

    // Update the session with properties data
    const updatedSession = {
      ...session,
      user: {
        ...session.user,
        profile_image: profileData?.profile_image ?? session.user.profile_image ?? null,
        positions: profileData?.positions ?? session.user.positions ?? 'User',
        user_property_name: profileData?.user_property_name ?? null,
        user_property_id: profileData?.user_property_id ?? null,
        profile_property_name: profileData?.profile_property_name ?? null,
        profile_property_id: profileData?.profile_property_id ?? null,
        properties: mergedProperties
      }
    };

    if (DEBUG_CONFIG.logSessions) {
    }

    return NextResponse.json(sanitizeSessionForClient(updatedSession) ?? { user: undefined }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('❌ Error in session-compat API:', error);
    return NextResponse.json({ user: undefined, error: 'session_error' }, { 
      status: 200, 
      headers: { 'Cache-Control': 'no-store' } 
    });
  }
}
