import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';

function resolveAudience(raw?: string | null): string {
  const fallback = 'https://pcms.live/api';
  if (!raw) {
    return fallback;
  }
  const trimmed = raw.trim().replace(/\/$/, '');
  // Explicit fixes for common misconfigurations
  if (
    trimmed === 'https://pcms.live' ||
    trimmed === 'http://pcms.live' ||
    trimmed === 'https://www.pcms.live'
  ) {
    return 'https://pcms.live/api';
  }
  if (trimmed.endsWith('/api')) {
    return trimmed;
  }
  // If value is our domain without path, append /api
  try {
    const u = new URL(trimmed);
    if (u.hostname.endsWith('pcms.live') && u.pathname === '') {
      return `${trimmed}/api`;
    }
  } catch {
    // ignore URL parse errors and return as-is
  }
  return trimmed;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'login':
        // Start interactive login - redirect to Auth0
        try {
          // For Auth0 v4, construct the login URL manually
          const domain = process.env.AUTH0_DOMAIN;
          const clientId = process.env.AUTH0_CLIENT_ID;
          const returnTo = `${process.env.AUTH0_BASE_URL}/dashboard/profile`;
          const scope = 'openid profile email';
          const audience = resolveAudience(process.env.AUTH0_AUDIENCE);
          // PKCE: generate code_verifier and code_challenge (S256)
          const codeVerifier = randomBytes(32).toString('base64url');
          const codeChallenge = createHash('sha256')
            .update(codeVerifier)
            .digest()
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
          // CSRF protection: generate state
          const state = randomBytes(16).toString('base64url');
          
          const loginUrl = `https://${domain}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(`${process.env.AUTH0_BASE_URL}/api/auth/callback`)}&scope=${encodeURIComponent(scope)}&audience=${encodeURIComponent(audience)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&state=${encodeURIComponent(state)}`;

          const response = NextResponse.redirect(loginUrl);
          // Store code_verifier and state in httpOnly cookies for callback
          response.cookies.set('auth0_code_verifier', codeVerifier, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 10 * 60, // 10 minutes
          });
          response.cookies.set('auth0_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 10 * 60, // 10 minutes
          });
          return response;
        } catch (loginError) {
          console.error('Auth0 login error:', loginError);
          return NextResponse.redirect('https://pcms.live/login?error=login_failed');
        }
      
      case 'callback':
        // Handle Auth0 callback and create session
        try {
          // For Auth0 callback, we need to handle the authorization code
          // This is typically done by the Auth0 SDK automatically
          // For now, redirect to profile page and let the client handle the session
          return NextResponse.redirect(`${process.env.AUTH0_BASE_URL}/dashboard/profile`);
        } catch (callbackError) {
          console.error('Auth0 callback error:', callbackError);
          return NextResponse.redirect('https://pcms.live/login?error=callback_failed');
        }
      
      case 'logout':
        // Handle logout - use the correct Auth0 method
        try {
          // For Auth0 v4, we need to construct the logout URL manually
          const domain = process.env.AUTH0_DOMAIN;
          const clientId = process.env.AUTH0_CLIENT_ID;
          const returnTo = `${process.env.AUTH0_BASE_URL}/`;
          
          const logoutUrl = `https://${domain}/v2/logout?client_id=${clientId}&returnTo=${encodeURIComponent(returnTo)}`;
          
          const response = NextResponse.redirect(logoutUrl);
          // Clear any session cookies
          response.cookies.delete('auth0_session');
          return response;
        } catch (logoutError) {
          console.error('Auth0 logout error:', logoutError);
          // Fallback logout - clear cookie and redirect
          const response = NextResponse.redirect(`${process.env.AUTH0_BASE_URL}/`);
          response.cookies.delete('auth0_session');
          return response;
        }
      
      case 'profile':
        // Get user profile from session
        try {
          const cookie = request.cookies.get('auth0_session');
          if (cookie?.value) {
            try {
              const parsed = JSON.parse(cookie.value);
              if (parsed?.user) {
                return NextResponse.json({ user: parsed.user });
              }
            } catch (e) {
              console.error('Failed to parse auth0_session cookie in profile:', e);
            }
          }
          return NextResponse.json({ user: null }, { status: 401 });
        } catch (profileError) {
          console.error('Auth0 profile error:', profileError);
          return NextResponse.json({ user: null, error: 'profile_failed' }, { status: 500 });
        }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Auth0 error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'refresh':
        // Handle token refresh - Auth0 handles this automatically
        // For now, return success as the SDK manages token refresh
        return NextResponse.json({ success: true, message: 'Token refresh handled by Auth0 SDK' });
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Auth0 POST error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
