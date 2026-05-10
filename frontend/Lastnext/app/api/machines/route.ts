import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG, DEBUG_CONFIG } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    if (DEBUG_CONFIG.logSessions) {
    }
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    
    // Build the API URL
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/machines/${queryString ? `?${queryString}` : ''}`;
    
    if (DEBUG_CONFIG.logApiCalls) {
    }

    // Fetch machines from the external API
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch machines:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch machines' }, 
        { status: response.status }
      );
    }

    const machines = await response.json();
    return NextResponse.json(machines);

  } catch (error) {
    console.error('Error fetching machines:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
