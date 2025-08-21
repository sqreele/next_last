import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/auth';
import { API_CONFIG } from '@/app/lib/config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pm_id: string }> }
) {
  try {
    // Get session to verify authentication
    const session = await getServerSession(authOptions);
    
    const { pm_id } = await params;
    
    console.log('🔍 Complete Preventive Maintenance API Debug:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      hasAccessToken: !!session?.user?.accessToken,
      userId: session?.user?.id,
      username: session?.user?.username,
      pm_id: pm_id
    });
    
    if (!session?.user?.accessToken) {
      console.log('❌ No access token in complete preventive maintenance session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the request body
    const body = await request.json();
    
    // Build the API URL
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/preventive-maintenance/${pm_id}/complete/`;
    
    console.log('🔍 Complete Preventive Maintenance API calling:', apiUrl);
    console.log('🔍 Complete Preventive Maintenance API headers:', {
      hasAuth: !!session.user.accessToken,
      authLength: session.user.accessToken?.length,
      contentType: 'application/json'
    });

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
