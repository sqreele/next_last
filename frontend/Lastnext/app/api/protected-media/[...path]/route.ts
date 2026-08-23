import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';
import { getSessionFromRequest } from '@/app/lib/auth0/session-cookie';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxyProtectedMedia(request: NextRequest, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  const accessToken = session?.user?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ detail: 'Authentication credentials were not provided.' }, { status: 401 });
  }

  const { path } = await context.params;
  const backendPath = path.map(encodeURIComponent).join('/');
  const backendResponse = await fetch(
    `${API_CONFIG.baseUrl}/api/v1/protected-media/${backendPath}/`,
    {
      method: request.method,
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  );

  const headers = new Headers();
  for (const name of ['content-type', 'content-disposition', 'cache-control', 'x-content-type-options', 'x-accel-redirect']) {
    const value = backendResponse.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new NextResponse(request.method === 'HEAD' ? null : backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyProtectedMedia(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return proxyProtectedMedia(request, context);
}
