import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function getSessionAccessToken(request: NextRequest): string | null {
  const sessionCookie = request.cookies.get('auth0_session')?.value;
  if (!sessionCookie) return null;

  try {
    const sessionData = JSON.parse(sessionCookie);
    return sessionData?.user?.accessToken || null;
  } catch {
    return null;
  }
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const backendPath = path.map(encodeURIComponent).join('/');
  const search = request.nextUrl.search || '';
  const targetUrl = `${API_CONFIG.baseUrl}/api/v1/${backendPath}/${search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lowerKey) && lowerKey !== 'cookie') {
      headers.set(key, value);
    }
  });

  if (!headers.has('authorization')) {
    const accessToken = getSessionAccessToken(request);
    if (accessToken) {
      headers.set('authorization', `Bearer ${accessToken}`);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body;
    (init as { duplex?: 'half' }).duplex = 'half';
  }

  const backendResponse = await fetch(targetUrl, init);
  const responseHeaders = new Headers();
  const contentType = backendResponse.headers.get('content-type');
  if (contentType) {
    responseHeaders.set('content-type', contentType);
  }

  const body = request.method === 'HEAD' ? null : await backendResponse.arrayBuffer();
  return new NextResponse(body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}
