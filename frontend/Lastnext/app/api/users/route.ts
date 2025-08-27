import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/next-auth-compat.server';
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

    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/users/${queryString ? `?${queryString}` : ''}`;
    
    // Fetch users from the external API
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch users:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch users' }, 
        { status: response.status }
      );
    }

    const users = await response.json();
    return NextResponse.json(users);

  } catch (error) {
    console.error('Error fetching users:', error);
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

    // Create user in the external API
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/users/`,
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
      console.error('Failed to create user:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to create user' }, 
        { status: response.status }
      );
    }

    const user = await response.json();
    return NextResponse.json(user);

  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
