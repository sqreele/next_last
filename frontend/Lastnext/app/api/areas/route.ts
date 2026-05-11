// app/api/areas/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/areas/${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: 'Failed to fetch areas', details: text },
        { status: response.status }
      );
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching areas:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();

    const response = await fetch(`${API_CONFIG.baseUrl}/api/v1/areas/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error creating area:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
