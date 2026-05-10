import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG, DEBUG_CONFIG } from '@/app/lib/config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pm_id: string }> }
) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    const { pm_id } = await params;
    
    if (DEBUG_CONFIG.logSessions) {
    }
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the request body
    const body = await request.json();
    
    // Build the API URL
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/preventive-maintenance/${pm_id}/complete/`;
    
    if (DEBUG_CONFIG.logApiCalls) {
    }

    // Forward the request to the Django backend
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('Failed to complete preventive maintenance:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to complete preventive maintenance' }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error completing preventive maintenance:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
