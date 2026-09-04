import { NextRequest, NextResponse } from 'next/server';

import { backendFetch } from '@/app/lib/backend-fetch';
import { getCompatServerSession } from '@/app/lib/auth0/server-session';
import {
  hasUsableInvitationSession,
  resolveInvitationBackendPath,
} from '@/app/lib/invitation-bff.mjs';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function jsonError(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

async function proxyInvitationRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const target = resolveInvitationBackendPath(path, request.method);
  if (!target) return jsonError(404, 'Invitation endpoint unavailable.');

  // Invitation secrets are body-only. Even the public preview route rejects a
  // token query parameter instead of creating an obsolete compatibility path.
  if (request.nextUrl.searchParams.has('token')) {
    return jsonError(400, 'Invitation tokens must be sent in the request body.');
  }

  const session = target.requiresAuth ? await getCompatServerSession() : null;
  if (target.requiresAuth && !hasUsableInvitationSession(session)) {
    return jsonError(401, 'Authentication required.');
  }

  const accessToken = target.requiresAuth ? session?.user?.accessToken : null;
  const headers = new Headers({ Accept: 'application/json' });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

  const backendBaseUrl = process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';
  const backendUrl = new URL(`/api/v1/${target.path}/`, backendBaseUrl);
  if (request.method === 'GET') {
    request.nextUrl.searchParams.forEach((value, key) => {
      backendUrl.searchParams.append(key, value);
    });
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };
  if (request.method === 'POST') {
    const body = await request.arrayBuffer();
    if (body.byteLength) init.body = body;
  }

  try {
    const backendResponse = await backendFetch(backendUrl, init);
    const responseHeaders = new Headers();
    const responseContentType = backendResponse.headers.get('content-type');
    if (responseContentType) responseHeaders.set('content-type', responseContentType);
    return new NextResponse(await backendResponse.arrayBuffer(), {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return jsonError(502, 'Invitation service unavailable.');
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyInvitationRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyInvitationRequest(request, context);
}
