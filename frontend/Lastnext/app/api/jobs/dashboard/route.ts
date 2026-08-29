import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';
import { getServerSession } from '@/app/lib/session.server';
import { backendFetch } from '@/app/lib/backend-fetch';

const ALLOWED_QUERY_PARAMS = new Set([
  'property_id',
  'page',
  'page_size',
  'search',
  'status',
  'priority',
  'date',
  'ordering',
]);

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const propertyId = request.nextUrl.searchParams.get('property_id')?.trim();
  if (!propertyId) {
    return NextResponse.json(
      { error: 'Select a property to view jobs.' },
      { status: 400 },
    );
  }

  const upstream = new URL('/api/v1/jobs/dashboard/', API_CONFIG.baseUrl);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (ALLOWED_QUERY_PARAMS.has(key)) upstream.searchParams.set(key, value);
  }

  try {
    const response = await backendFetch(upstream, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: request.signal,
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return new NextResponse(null, { status: 499 });
    }
    console.error('Error fetching the Property-scoped Jobs dashboard:', error);
    return NextResponse.json({ error: 'Unable to load jobs.' }, { status: 502 });
  }
}
