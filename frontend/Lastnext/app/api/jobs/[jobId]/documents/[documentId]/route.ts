import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';
import { backendFetch } from '@/app/lib/backend-fetch';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; documentId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { jobId, documentId } = await params;
  if (!/^\d+$/.test(documentId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const url = new URL(
    `/api/v1/jobs/${encodeURIComponent(jobId)}/documents/${documentId}/`,
    API_CONFIG.baseUrl,
  );
  const propertyId = request.nextUrl.searchParams.get('property_id');
  if (propertyId) url.searchParams.set('property_id', propertyId);
  try {
    const response = await backendFetch(url.toString(), {
      headers: { Authorization: `Bearer ${session.user.accessToken}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Document unavailable' }, { status: response.status });
    }
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': response.headers.get('content-disposition') || 'attachment',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unable to download document' }, { status: 502 });
  }
}
