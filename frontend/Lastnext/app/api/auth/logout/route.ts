import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, readSessionReference } from '@/app/lib/auth0/session-cookie';
import { deleteServerSession } from '@/app/lib/auth0/server-session-store';
import {
  localAppUrl,
  OAUTH_TRANSACTION_COOKIES,
  sanitizeLogoutPath,
} from '@/app/lib/auth0/auth-security.mjs';

function clearLocalAuthCookies(response: NextResponse) {
  clearSessionCookie(response);
  for (const cookieName of OAUTH_TRANSACTION_COOKIES) response.cookies.delete(cookieName);
}

export async function GET(request: NextRequest) {
  try {
    const reference = readSessionReference(request.cookies.get('auth0_session')?.value);
    if (reference) {
      try { await deleteServerSession(reference); }
      catch { console.error('auth_server_session_delete_failed', { reason: 'store_unavailable' }); }
    }
    const { searchParams } = new URL(request.url);
    const returnTo = sanitizeLogoutPath(searchParams.get('returnTo'), '/');
    
    // Use server-side environment variables
    const baseUrl = process.env.AUTH0_BASE_URL || 'https://staymaint.com';
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_CLIENT_ID;
    
    if (!auth0Domain || !clientId) {
      console.error('Missing Auth0 configuration');
      const response = NextResponse.redirect(localAppUrl(baseUrl, '/auth/login'));
      clearLocalAuthCookies(response);
      return response;
    }
    
    // Build Auth0 logout URL
    const auth0LogoutUrl = `https://${auth0Domain}/v2/logout?` + new URLSearchParams({
      client_id: clientId,
      returnTo: localAppUrl(baseUrl, returnTo),
    });
    
    // Create response and clear session cookie
    const response = NextResponse.redirect(auth0LogoutUrl);
    clearLocalAuthCookies(response);
    
    return response;
    
  } catch {
    console.error('auth0_logout_failed', { reason: 'unexpected_error' });
    const baseUrl = process.env.AUTH0_BASE_URL || 'https://staymaint.com';
    const response = NextResponse.redirect(localAppUrl(baseUrl, '/auth/login'));
    clearLocalAuthCookies(response);
    return response;
  }
}
