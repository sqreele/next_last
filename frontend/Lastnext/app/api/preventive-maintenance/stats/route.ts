import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/auth';
import { API_CONFIG } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get session to verify authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/preventive-maintenance/stats/${queryString ? `?${queryString}` : ''}`;
    
    // Fetch statistics from the external API
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch maintenance statistics:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch maintenance statistics' }, 
        { status: response.status }
      );
    }

    const stats = await response.json();
    return NextResponse.json(stats);

  } catch (error) {
    console.error('Error fetching maintenance statistics:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
