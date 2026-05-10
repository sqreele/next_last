// app/api/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG, DEBUG_CONFIG } from '@/app/lib/config';
import { getErrorMessage } from '@/app/lib/utils/error-utils';

export async function GET(request: NextRequest) {
  try {
    if (DEBUG_CONFIG.logApiCalls) {
    }

    // ✅ Get session with proper error handling
    const session = await getServerSession();
    
    if (DEBUG_CONFIG.logSessions) {
    }

    if (!session?.user?.accessToken) {
      return NextResponse.json({ 
        error: 'Unauthorized',
        debug: DEBUG_CONFIG.logSessions ? {
          hasSession: !!session,
          hasUser: !!session?.user,
          sessionKeys: session ? Object.keys(session) : [],
          userKeys: session?.user ? Object.keys(session.user) : [],
          sessionError: session?.error
        } : undefined
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('property');
    
    // ✅ Use the config for API URL construction
    const apiUrl = propertyId
      ? `${API_CONFIG.baseUrl}/api/v1/rooms/?property=${encodeURIComponent(propertyId)}`
      : `${API_CONFIG.baseUrl}/api/v1/rooms/`;
    
    if (DEBUG_CONFIG.logApiCalls) {
    }

    // Fetch rooms from the external API
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'NextJS-Server/1.0',
      },
      // Add timeout
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (DEBUG_CONFIG.logApiCalls) {
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to fetch rooms:', response.status, response.statusText, errorText);
      return NextResponse.json(
        { 
          error: 'Failed to fetch rooms', 
          details: errorText, 
          status: response.status,
          apiUrl: DEBUG_CONFIG.logApiCalls ? apiUrl : undefined
        }, 
        { status: response.status }
      );
    }

    const rooms = await response.json();
    
    if (DEBUG_CONFIG.logApiCalls) {
    }
    
    return NextResponse.json(rooms);

  } catch (error) {
    console.error('❌ Error in rooms API:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: DEBUG_CONFIG.logApiCalls ? error.stack : undefined
      });
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: getErrorMessage(error),
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}
