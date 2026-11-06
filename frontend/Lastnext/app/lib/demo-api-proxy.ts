import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

const MAX_BODY_BYTES = 4 * 1024 * 1024;

function errorResponse(status: number, detail: string) {
  return NextResponse.json({ detail }, { status, headers: { 'cache-control': 'no-store' } });
}

export async function proxyDemoRequest(
  request: NextRequest,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
) {
  const baseUrl = process.env.DEMO_API_URL || 'http://demo-backend:8000';
  const upstream = new URL(path, baseUrl);
  const headers = new Headers({
    accept: 'application/json',
    'x-forwarded-proto': 'https',
  });
  const clientIp = request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim();
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  const init: RequestInit = { method, headers, cache: 'no-store' };
  if (method !== 'GET') {
    const declaredLength = Number(request.headers.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return errorResponse(413, 'Request body is too large.');
    }
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return errorResponse(413, 'Request body is too large.');
    const contentType = request.headers.get('content-type') || 'application/json';
    headers.set('content-type', contentType);
    init.body = body;
  }

  try {
    const response = await fetch(upstream, init);
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        'cache-control': 'no-store',
        'content-type': response.headers.get('content-type') || 'application/json',
        ...(response.headers.get('content-disposition') ? { 'content-disposition': response.headers.get('content-disposition')! } : {}),
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return errorResponse(503, 'Demo service is temporarily unavailable.');
  }
}
