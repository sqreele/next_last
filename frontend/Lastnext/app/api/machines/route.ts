import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    console.log('🔍 Machines API Debug:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      hasAccessToken: !!session?.user?.accessToken,
      userId: session?.user?.id,
      username: session?.user?.username,
      accessTokenLength: session?.user?.accessToken?.length
    });
    
    if (!session?.user?.accessToken) {
      console.log('❌ No access token in machines session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('property_id');
    
    // Build the API URL
    let apiUrl = `${API_CONFIG.baseUrl}/api/v1/machines/`;
    if (propertyId) {
      apiUrl += `?property_id=${propertyId}`;
    }
    
    console.log('🔍 Machines API calling:', apiUrl);
    console.log('🔍 Machines API headers:', {
      hasAuth: !!session.user.accessToken,
      authLength: session.user.accessToken?.length,
      contentType: 'application/json'
    });

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
