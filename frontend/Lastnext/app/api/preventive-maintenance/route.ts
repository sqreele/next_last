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
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/preventive-maintenance/${queryString ? `?${queryString}` : ''}`;
    
    if (DEBUG_CONFIG.logApiCalls) {
    }

    // Fetch preventive maintenance from the external API
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch preventive maintenance:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch preventive maintenance' }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching preventive maintenance:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    if (DEBUG_CONFIG.logSessions) {
    }
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build the API URL
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/preventive-maintenance/`;
    
    if (DEBUG_CONFIG.logApiCalls) {
    }
    
    // Get the form data from the request
    const formData = await request.formData();
    
    // Log form data entries for debugging
    if (DEBUG_CONFIG.logApiCalls) {
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
        } else {
        }
      }
    }

    // Forward the request to the backend API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        // Don't set Content-Type - let fetch set it with boundary for multipart/form-data
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create preventive maintenance:', response.status, response.statusText, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Failed to create preventive maintenance' };
      }
      
      return NextResponse.json(
        errorData, 
        { status: response.status }
      );
    }

    const data = await response.json();
    if (DEBUG_CONFIG.logApiCalls) {
    }
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Error creating preventive maintenance:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' }, 
      { status: 500 }
    );
  }
}
