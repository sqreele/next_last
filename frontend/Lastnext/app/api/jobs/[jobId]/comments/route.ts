// app/api/jobs/[jobId]/comments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { jobId } = await params;
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/jobs/${jobId}/comments/`,
      {
        headers: {
          'Authorization': `Bearer ${session.user.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching job comments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { jobId } = await params;
    const body = await request.json();
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/jobs/${jobId}/comments/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.user.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error creating job comment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
