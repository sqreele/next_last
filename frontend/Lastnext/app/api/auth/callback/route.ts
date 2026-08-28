import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/app/lib/backend-fetch';
import {
  localAppUrl,
  OAUTH_TRANSACTION_COOKIES,
  sanitizeLocalPath,
  verifyAuth0IdToken,
} from '@/app/lib/auth0/auth-security.mjs';
import { setSessionCookie } from '@/app/lib/auth0/session-cookie';

const RAW_AUTH_ID_PATTERN = /^(google-oauth2_|auth0_)/i;
const RAW_AUTH_PIPE_PATTERN = /^(google-oauth2|auth0)\|/i;
const DEFAULT_AUTH0_CLAIM_NAMESPACE = 'https://hotelcarepro.com';

function getAuth0Claim(claims: Record<string, unknown>, claim: string): unknown {
  const namespace = (
    process.env.AUTH0_CLAIM_NAMESPACE || DEFAULT_AUTH0_CLAIM_NAMESPACE
  ).replace(/\/$/, '');
  return claims[`${namespace}/${claim}`] ?? claims[claim];
}

function pickString(claims: Record<string, unknown>, claim: string): string | undefined {
  const value = getAuth0Claim(claims, claim);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickHumanUsername(userInfo: Record<string, unknown>): string {
  const email = pickString(userInfo, 'email');
  const candidates = [
    pickString(userInfo, 'given_name'),
    pickString(userInfo, 'name'),
    pickString(userInfo, 'nickname'),
    email?.split('@')[0],
    email,
  ];
  for (const candidate of candidates) {
    if (
      candidate &&
      !RAW_AUTH_ID_PATTERN.test(candidate) &&
      !RAW_AUTH_PIPE_PATTERN.test(candidate)
    ) return candidate;
  }
  return 'User';
}

function clearTransaction(response: NextResponse): NextResponse {
  for (const cookieName of OAUTH_TRANSACTION_COOKIES) response.cookies.delete(cookieName);
  return response;
}

function callbackFailure(baseUrl: string, reason: string): NextResponse {
  console.error('auth0_callback_failed', { reason });
  return clearTransaction(
    NextResponse.redirect(localAppUrl(baseUrl, `/auth/login?error=${reason}`)),
  );
}

export async function GET(request: NextRequest) {
  const baseUrl = process.env.AUTH0_BASE_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get('auth0_login_state')?.value;
  const expectedNonce = request.cookies.get('auth0_login_nonce')?.value;
  const codeVerifier = request.cookies.get('auth0_pkce_verifier')?.value;
  const requestedRedirect = sanitizeLocalPath(
    request.cookies.get('auth0_login_redirect')?.value,
    '/dashboard',
  );

  if (request.nextUrl.searchParams.has('error')) {
    return callbackFailure(baseUrl, 'provider_error');
  }
  if (!code) return callbackFailure(baseUrl, 'no_code');
  if (!state || !expectedState || state !== expectedState) {
    return callbackFailure(baseUrl, 'invalid_state');
  }
  if (!expectedNonce) return callbackFailure(baseUrl, 'invalid_nonce');
  if (!codeVerifier) return callbackFailure(baseUrl, 'pkce_required');

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    return callbackFailure(baseUrl, 'config_error');
  }

  try {
    const tokenResponse = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: codeVerifier,
        redirect_uri: localAppUrl(baseUrl, '/api/auth/callback'),
      }),
    });
    if (!tokenResponse.ok) {
      console.error('auth0_token_exchange_failed', { status: tokenResponse.status });
      return callbackFailure(baseUrl, 'token_exchange_failed');
    }

    const tokens = await tokenResponse.json() as Record<string, unknown>;
    const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
    const idToken = typeof tokens.id_token === 'string' ? tokens.id_token : '';
    const refreshToken = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : undefined;
    const expiresIn = typeof tokens.expires_in === 'number' && tokens.expires_in > 0
      ? tokens.expires_in
      : 3600;
    if (!accessToken || !idToken) return callbackFailure(baseUrl, 'invalid_token_response');

    let verifiedClaims: Record<string, unknown>;
    try {
      verifiedClaims = await verifyAuth0IdToken(idToken, {
        domain,
        clientId,
        nonce: expectedNonce,
      });
    } catch {
      return callbackFailure(baseUrl, 'id_token_invalid');
    }

    const subject = pickString(verifiedClaims, 'sub');
    const email = pickString(verifiedClaims, 'email');
    if (!subject || !email || getAuth0Claim(verifiedClaims, 'email_verified') !== true) {
      return callbackFailure(baseUrl, 'identity_unverified');
    }

    // /userinfo is optional profile enrichment only. Signed ID-token claims
    // remain authoritative and an inconsistent subject is ignored.
    let profileClaims = verifiedClaims;
    try {
      const userResponse = await fetch(`https://${domain}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userResponse.ok) {
        const userInfo = await userResponse.json() as Record<string, unknown>;
        if (pickString(userInfo, 'sub') === subject) {
          profileClaims = { ...userInfo, ...verifiedClaims };
        } else {
          console.warn('auth0_userinfo_ignored', { reason: 'subject_mismatch' });
        }
      } else {
        console.warn('auth0_userinfo_unavailable', { status: userResponse.status });
      }
    } catch {
      console.warn('auth0_userinfo_unavailable', { reason: 'network_error' });
    }

    const accessTokenExpires = Date.now() + expiresIn * 1000;
    const sessionData = {
      user: {
        id: subject.replace(/\|/g, '_'),
        username: pickHumanUsername(profileClaims),
        email,
        profile_image: pickString(profileClaims, 'picture') || null,
        positions: pickString(profileClaims, 'positions') || 'User',
        properties: [],
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        accessTokenExpires,
        created_at: new Date().toISOString(),
        auth0_profile: {
          sub: subject,
          email,
          email_verified: true,
          name: pickString(profileClaims, 'name'),
          given_name: pickString(profileClaims, 'given_name'),
          family_name: pickString(profileClaims, 'family_name'),
          nickname: pickString(profileClaims, 'nickname'),
          picture: pickString(profileClaims, 'picture'),
          locale: pickString(profileClaims, 'locale'),
          updated_at: pickString(profileClaims, 'updated_at'),
        },
      },
      expires: accessTokenExpires,
    };

    let hasPropertyAccess = false;
    try {
      const backendUrl = process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';
      const propertiesResponse = await backendFetch(`${backendUrl}/api/v1/properties/`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (propertiesResponse.ok) {
        const properties = await propertiesResponse.json();
        hasPropertyAccess = Array.isArray(properties) && properties.length > 0;
      }
    } catch {
      console.warn('auth0_access_probe_failed', { reason: 'backend_unavailable' });
    }

    const invitationReturn = requestedRedirect === '/invitations/accept';
    const destination = hasPropertyAccess || invitationReturn
      ? requestedRedirect
      : '/auth/access-pending';
    const response = NextResponse.redirect(localAppUrl(baseUrl, destination));
    await setSessionCookie(
      response,
      sessionData,
      refreshToken ? 60 * 24 * 60 * 60 : Math.max(expiresIn, 24 * 60 * 60),
    );
    return clearTransaction(response);
  } catch {
    return callbackFailure(baseUrl, 'callback_error');
  }
}
