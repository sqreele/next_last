import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    
    // Get authorization header from request
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - No valid authorization header' }, { status: 401 });
    }
    
    const accessToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    // Use the user-profiles detailed endpoint which includes all users with properties
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/user-profiles/detailed/${queryString ? `?${queryString}` : ''}`;
    
    // Fetch detailed user profiles from the external API
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Route: Backend error response:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${response.status} ${response.statusText}` }, 
        { status: response.status }
      );
    }

    const userProfiles = await response.json();
    
    // Transform the data to include first_name, last_name, and properties from the user model
    const detailedUsers = userProfiles.map((profile: any) => ({
      id: profile.id,
      username: profile.username,
      email: profile.email,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      full_name: profile.first_name && profile.last_name 
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : profile.username,
      positions: profile.positions,
      profile_image: profile.profile_image,
      properties: profile.properties || [],
      created_at: profile.created_at
    }));

    return NextResponse.json(detailedUsers);

  } catch (error) {
    console.error('Error fetching detailed users:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
