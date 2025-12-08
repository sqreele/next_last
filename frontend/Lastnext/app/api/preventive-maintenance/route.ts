import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
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

export async function POST(request: NextRequest) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    console.log('🔍 Preventive Maintenance POST API Debug:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      hasAccessToken: !!session?.user?.accessToken,
      userId: session?.user?.id,
      username: session?.user?.username,
      accessTokenLength: session?.user?.accessToken?.length
    });
    
    if (!session?.user?.accessToken) {
      console.log('❌ No access token in preventive maintenance POST session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build the API URL
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/preventive-maintenance/`;
    
    console.log('🔍 Preventive Maintenance POST API calling:', apiUrl);
    
    // Get the form data from the request
    const formData = await request.formData();
    
    // Log form data entries for debugging
    console.log('🔍 FormData entries:');
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(`  ${key}: File - ${value.name} (${value.size} bytes, ${value.type})`);
      } else {
        console.log(`  ${key}: ${value}`);
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
    console.log('✅ Preventive maintenance created successfully:', data);
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Error creating preventive maintenance:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' }, 
      { status: 500 }
    );
  }
}
