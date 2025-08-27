import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/next-auth-compat';
import { API_CONFIG } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/user-profiles/${queryString ? `?${queryString}` : ''}`;
    
    // Fetch user profiles from the external API
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch user profiles:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch user profiles' }, 
        { status: response.status }
      );
    }

    const userProfiles = await response.json();
    return NextResponse.json(userProfiles);

  } catch (error) {
    console.error('Error fetching user profiles:', error);
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
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Create user profile in the external API
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/user-profiles/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.user.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error('Failed to create user profile:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to create user profile' }, 
        { status: response.status }
      );
    }

    const userProfile = await response.json();
    return NextResponse.json(userProfile);

  } catch (error) {
    console.error('Error creating user profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
