import { NextRequest, NextResponse } from 'next/server';

import { proxyDemoRequest } from '@/app/lib/demo-api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await params;
  if (!/^\d+$/.test(imageId)) {
    return NextResponse.json({ detail: 'Invalid demo image ID.' }, { status: 400 });
  }
  return proxyDemoRequest(request, `/api/v1/demo/images/${imageId}/`, 'GET');
}
