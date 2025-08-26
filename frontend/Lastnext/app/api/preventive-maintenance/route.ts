import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/auth';
import { API_CONFIG } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get session to verify authentication
    const session = await getServerSession(authOptions);
    
    console.log('🔍 Preventive Maintenance API Debug:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      hasAccessToken: !!session?.user?.accessToken,
      userId: session?.user?.id,
      username: session?.user?.username,
      accessTokenLength: session?.user?.accessToken?.length
    });
    
    if (!session?.user?.accessToken) {
      console.log('❌ No access token in preventive maintenance session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    
    // Build the API URL
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/preventive-maintenance/${queryString ? `?${queryString}` : ''}`;
    
    console.log('🔍 Preventive Maintenance API calling:', apiUrl);
    console.log('🔍 Preventive Maintenance API headers:', {
      hasAuth: !!session.user.accessToken,
      authLength: session.user.accessToken?.length,
      contentType: 'application/json'
    });

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

// Handle create (multipart/form-data forwarding)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Read multipart form data from the incoming request
    const formData = await request.formData();

    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/preventive-maintenance/`;

    // Forward to backend without setting Content-Type so the boundary is preserved
    const backendResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
      },
      body: formData,
    });

    const contentType = backendResponse.headers.get('content-type') || '';

    if (!backendResponse.ok) {
      let errorPayload: any = { error: 'Failed to create preventive maintenance' };
      try {
        if (contentType.includes('application/json')) {
          errorPayload = await backendResponse.json();
        } else {
          errorPayload.detail = await backendResponse.text();
        }
      } catch {}
      return NextResponse.json(errorPayload, { status: backendResponse.status });
    }

    if (contentType.includes('application/json')) {
      const data = await backendResponse.json();
      return NextResponse.json(data, { status: backendResponse.status });
    } else {
      const text = await backendResponse.text();
      return new NextResponse(text, {
        status: backendResponse.status,
        headers: { 'Content-Type': contentType },
      });
    }
  } catch (error) {
    console.error('Error creating preventive maintenance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
