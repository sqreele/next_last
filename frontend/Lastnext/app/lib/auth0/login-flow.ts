import { NextRequest, NextResponse } from 'next/server';
import {
  createAuth0AuthorizationTransaction,
  localAppUrl,
  sanitizeLocalPath,
} from '@/app/lib/auth0/auth-security.mjs';

export const TRANSACTION_COOKIE_OPTIONS = {
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

// This is the sole OAuth/OIDC authorization-request constructor. Every login
// route calls it directly so state, nonce, and PKCE form one transaction.
export function beginHardenedAuth0Login(request: NextRequest): NextResponse {
  const baseUrl = appBaseUrl(request);
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  if (!domain || !clientId) {
    console.error('auth0_login_failed', { reason: 'configuration_missing' });
    return NextResponse.redirect(localAppUrl(baseUrl, '/auth/login?error=config_error'));
  }

  const requestedRedirect = sanitizeLocalPath(
    request.nextUrl.searchParams.get('redirect'),
    '/dashboard',
  );
  const transaction = createAuth0AuthorizationTransaction({
    domain,
    clientId,
    baseUrl,
    audience: resolveAudience(process.env.AUTH0_AUDIENCE),
    redirectPath: requestedRedirect,
    screenHint: request.nextUrl.searchParams.get('screen_hint'),
  });

  const response = NextResponse.redirect(transaction.authorizeUrl);
  response.cookies.set('auth0_login_state', transaction.state, TRANSACTION_COOKIE_OPTIONS);
  response.cookies.set('auth0_login_nonce', transaction.nonce, TRANSACTION_COOKIE_OPTIONS);
  response.cookies.set('auth0_pkce_verifier', transaction.verifier, TRANSACTION_COOKIE_OPTIONS);
  response.cookies.set('auth0_login_redirect', transaction.redirectPath, TRANSACTION_COOKIE_OPTIONS);
  return response;
}
