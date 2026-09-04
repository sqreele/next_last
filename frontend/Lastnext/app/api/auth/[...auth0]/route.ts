import { NextRequest, NextResponse } from 'next/server';
import {
  localAppUrl,
  OAUTH_TRANSACTION_COOKIES,
} from '@/app/lib/auth0/auth-security.mjs';
import { beginHardenedAuth0Login } from '@/app/lib/auth0/login-flow';
import {
  clearSessionCookie,
  readSessionReference,
  sanitizeSessionForClient,
} from '@/app/lib/auth0/session-cookie';
import { getCompatServerSession } from '@/app/lib/auth0/server-session';
import { deleteServerSession } from '@/app/lib/auth0/server-session-store';

function clearLocalAuthCookies(response: NextResponse) {
  clearSessionCookie(response);
  for (const cookieName of OAUTH_TRANSACTION_COOKIES) response.cookies.delete(cookieName);
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'login') {
    return beginHardenedAuth0Login(request);
  }

  const baseUrl = process.env.AUTH0_BASE_URL || request.nextUrl.origin;

  if (action === 'logout') {
    const reference = readSessionReference(request.cookies.get('auth0_session')?.value);
    if (reference) {
      try { await deleteServerSession(reference); }
      catch { console.error('auth_server_session_delete_failed', { reason: 'store_unavailable' }); }
    }
    const domain = process.env.AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_CLIENT_ID;
    if (!domain || !clientId) {
      const response = NextResponse.redirect(localAppUrl(baseUrl, '/auth/login'));
      clearLocalAuthCookies(response);
      return response;
    }
    const logoutUrl = new URL(`https://${domain}/v2/logout`);
    logoutUrl.search = new URLSearchParams({
      client_id: clientId,
      returnTo: localAppUrl(baseUrl, '/'),
    }).toString();
    const response = NextResponse.redirect(logoutUrl);
    clearLocalAuthCookies(response);
    return response;
  }

  if (action === 'profile') {
    const session = await getCompatServerSession();
    const clientSession = sanitizeSessionForClient(session);
    return clientSession?.user
      ? NextResponse.json({ user: clientSession.user })
      : NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function POST() {
  return NextResponse.json({ error: 'Unsupported authentication action' }, { status: 405 });
}
