import { NextResponse } from 'next/server';
import { getCompatServerSession } from '@/app/lib/auth0/server-session';
import { fetchProperties } from '@/app/lib/data.server';
import { updateUserProfile } from '@/app/lib/data.server';
import { Property } from '@/app/lib/types';

export async function GET() {
  try {
    const session = await getCompatServerSession();
    
    if (!session?.user) {
      return NextResponse.json({ user: undefined }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Fetch properties for the user if they have an access token
    let properties: Property[] = [];
    if (session.user.accessToken) {
      try {
        console.log('🔍 Fetching properties for session user:', session.user.username);
        properties = await fetchProperties(session.user.accessToken);
        console.log('✅ Properties fetched for session:', properties.length);
      } catch (error) {
        console.error('❌ Error fetching properties for session:', error);
        // Continue with empty properties if fetch fails
      }
    }

    // Update user profile with Auth0 data if available
    // Note: Profile updates should be done explicitly, not automatically
    // This prevents issues with session cookie access and unnecessary updates
    if (session.user.auth0_profile) {
      console.log('ℹ️ Auth0 profile data available for user:', session.user.username);
      console.log('ℹ️ Profile updates should be done explicitly via edit profile page');
    }

    // Update the session with properties data
    const updatedSession = {
      ...session,
      user: {
        ...session.user,
        properties: properties
      }
    };

    console.log('🔍 Session response with properties:', {
      userId: updatedSession.user.id,
      username: updatedSession.user.username,
      propertiesCount: updatedSession.user.properties.length
    });

    return NextResponse.json(updatedSession ?? { user: undefined }, { 
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
