import { NextRequest, NextResponse } from 'next/server';

import { backendFetch } from '@/app/lib/backend-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// `trailingSlash: true` makes POST /api/contact/ the canonical public route.
// Browser callers must use it directly so POST bodies never depend on redirects.
const MAX_CONTACT_BODY_BYTES = 16 * 1024;

function jsonError(status: number, detail: string) {
  return NextResponse.json({ detail }, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CONTACT_BODY_BYTES) {
    return jsonError(413, 'Request body is too large.');
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_CONTACT_BODY_BYTES) {
    return jsonError(413, 'Request body is too large.');
  }

  const backendBaseUrl = process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';
  const backendUrl = new URL('/api/v1/public/contact/', backendBaseUrl);
  const headers = new Headers({
    accept: 'application/json',
    'content-type': request.headers.get('content-type') || 'application/json',
    'content-length': String(body.byteLength),
  });
  const clientIp = request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim();
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  try {
    const response = await backendFetch(backendUrl, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
    });
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        'cache-control': 'no-store',
        'content-type': response.headers.get('content-type') || 'application/json',
      },
    });
  } catch {
    return jsonError(503, 'Contact service unavailable.');
  }
}
