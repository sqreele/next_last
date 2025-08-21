import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward token request to Django backend
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/token/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error('Token request failed:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Authentication failed' }, 
        { status: response.status }
      );
    }

    const tokens = await response.json();
    return NextResponse.json(tokens);

  } catch (error) {
    console.error('Error in token route:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
