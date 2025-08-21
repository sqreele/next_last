import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward token refresh request to Django backend
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/token/refresh/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error('Token refresh failed:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Token refresh failed' }, 
        { status: response.status }
      );
    }

    const tokens = await response.json();
    return NextResponse.json(tokens);

  } catch (error) {
    console.error('Error in token refresh route:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
