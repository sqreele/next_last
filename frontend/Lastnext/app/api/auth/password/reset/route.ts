import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward password reset request to Django backend
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/auth/password/reset/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error('Password reset request failed:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Password reset failed' }, 
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in password reset route:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}