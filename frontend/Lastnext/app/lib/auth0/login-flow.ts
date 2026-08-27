import { NextRequest, NextResponse } from 'next/server';
import {
  createPkcePair,
  localAppUrl,
  randomUrlSafeValue,
  sanitizeLocalPath,
} from '@/app/lib/auth0/auth-security.mjs';

const TRANSACTION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 10 * 60,
};

function resolveAudience(raw?: string | null): string {
  const fallback = 'https://api.staymaint.com';
  if (!raw) return fallback;
  const trimmed = raw.trim().replace(/\/$/, '');
  if (
    [
      'https://api.staymaint.com/api',
      'https://staymaint.com',
      'http://staymaint.com',
      'https://www.staymaint.com',
      'https://staymaint.com/api',
    ].includes(trimmed)
  ) return fallback;
  return trimmed;
}

function appBaseUrl(request: NextRequest): string {
  return process.env.AUTH0_BASE_URL || request.nextUrl.origin;
}

// This is the sole OAuth/OIDC authorization-request constructor. Every login
// route must call it directly so state, nonce, and PKCE are always created as
// one transaction.
export function beginHardenedAuth0Login(request: NextRequest): NextResponse {
  const baseUrl = appBaseUrl(request);
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
