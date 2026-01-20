import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';

export async function GET() {
  const session = await getServerSession();

  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(`${API_CONFIG.baseUrl}/api/v1/roster-leaves/`, {
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch roster leaves' },
      { status: response.status },
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();

  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  const response = await fetch(`${API_CONFIG.baseUrl}/api/v1/roster-leaves/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      { error: 'Failed to create roster leave', detail: errorBody },
      { status: response.status },
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
