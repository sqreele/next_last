import { NextRequest, NextResponse } from 'next/server';
import {
  createPkcePair,
  localAppUrl,
  OAUTH_TRANSACTION_COOKIES,
  randomUrlSafeValue,
  sanitizeLocalPath,
} from '@/app/lib/auth0/auth-security.mjs';
import {
  clearSessionCookie,
  getSessionFromRequest,
  sanitizeSessionForClient,
} from '@/app/lib/auth0/session-cookie';

const TRANSACTION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 10 * 60,
};

function resolveAudience(raw?: string | null): string {
  const fallback = 'https://api.hotelcarepro.com';
  if (!raw) return fallback;
  const trimmed = raw.trim().replace(/\/$/, '');
  if (
    [
      'https://api.hotelcarepro.com/api',
      'https://hotelcarepro.com',
      'http://hotelcarepro.com',
      'https://www.hotelcarepro.com',
      'https://hotelcarepro.com/api',
    ].includes(trimmed)
  ) return fallback;
  return trimmed;
}

function appBaseUrl(request: NextRequest): string {
  return process.env.AUTH0_BASE_URL || request.nextUrl.origin;
}

function clearLocalAuthCookies(response: NextResponse) {
  clearSessionCookie(response);
  for (const cookieName of OAUTH_TRANSACTION_COOKIES) response.cookies.delete(cookieName);
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');
  const baseUrl = appBaseUrl(request);

  if (action === 'login') {
    const domain = process.env.AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_CLIENT_ID;
    if (!domain || !clientId) {
      console.error('auth0_login_failed', { reason: 'configuration_missing' });
      return NextResponse.redirect(localAppUrl(baseUrl, '/auth/login?error=config_error'));
    }

    const state = randomUrlSafeValue();
    const nonce = randomUrlSafeValue();
    const { verifier, challenge } = createPkcePair();
    const requestedRedirect = sanitizeLocalPath(
      request.nextUrl.searchParams.get('redirect'),
      '/dashboard',
    );
    const authorizeUrl = new URL(`https://${domain}/authorize`);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: localAppUrl(baseUrl, '/api/auth/callback'),
      scope: 'openid profile email offline_access',
      audience: resolveAudience(process.env.AUTH0_AUDIENCE),
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(request.nextUrl.searchParams.get('screen_hint') === 'signup'
        ? { screen_hint: 'signup' }
        : {}),
    }).toString();

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set('auth0_login_state', state, TRANSACTION_COOKIE_OPTIONS);
    response.cookies.set('auth0_login_nonce', nonce, TRANSACTION_COOKIE_OPTIONS);
    response.cookies.set('auth0_pkce_verifier', verifier, TRANSACTION_COOKIE_OPTIONS);
    response.cookies.set('auth0_login_redirect', requestedRedirect, TRANSACTION_COOKIE_OPTIONS);
    return response;
  }

  if (action === 'logout') {
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
    const session = await getSessionFromRequest(request);
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
