import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG, DEBUG_CONFIG } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    if (DEBUG_CONFIG.logSessions) {
      console.log('🔍 Properties API Debug:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        hasAccessToken: !!session?.user?.accessToken,
        userId: session?.user?.id,
        username: session?.user?.username,
        accessTokenLength: session?.user?.accessToken?.length
      });
    }
    
    if (!session?.user?.accessToken) {
      console.log('❌ No access token in properties session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/properties/`;
    if (DEBUG_CONFIG.logApiCalls) {
      console.log('🔍 Properties API calling:', apiUrl);
      console.log('🔍 Properties API headers:', {
        hasAuth: !!session.user.accessToken,
        authLength: session.user.accessToken?.length,
        contentType: 'application/json'
      });
    }

    // Fetch properties from the external API
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch properties:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch properties' }, 
        { status: response.status }
      );
    }

    const properties = await response.json();
    return NextResponse.json(properties);

  } catch (error) {
    console.error('Error fetching properties:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 