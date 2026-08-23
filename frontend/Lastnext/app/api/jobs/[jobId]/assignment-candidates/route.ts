import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';
import { getServerSession } from '@/app/lib/session.server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const propertyId = request.nextUrl.searchParams.get('property_id')?.trim();
  if (!propertyId) {
    return NextResponse.json(
      { error: 'An active property is required.' },
      { status: 400 },
    );
  }

  const { jobId } = await params;
  try {
    const upstream = new URL(
      `/api/v1/jobs/${encodeURIComponent(jobId)}/assignment-candidates/`,
      API_CONFIG.baseUrl,
    );
    upstream.searchParams.set('property_id', propertyId);
    const response = await fetch(upstream, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : [];
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching job assignment candidates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
