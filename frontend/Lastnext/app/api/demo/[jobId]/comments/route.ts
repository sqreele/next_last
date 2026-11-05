import { NextRequest, NextResponse } from 'next/server';

import { proxyDemoRequest } from '@/app/lib/demo-api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  if (!/^(?:DEMO-CT-|DWEB)[A-Z0-9-]+$/.test(jobId)) {
    return NextResponse.json({ detail: 'Invalid demo job ID.' }, { status: 400 });
  }
  return proxyDemoRequest(
    request,
    `/api/v1/demo/jobs/${encodeURIComponent(jobId)}/comments/`,
    'POST',
  );
}
