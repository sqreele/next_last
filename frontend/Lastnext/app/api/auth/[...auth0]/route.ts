import { NextRequest, NextResponse } from 'next/server';

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
          // Use server-side environment variables for sensitive data
          const domain = process.env.AUTH0_DOMAIN;
          const clientId = process.env.AUTH0_CLIENT_ID;
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
          const scope = 'openid profile email';
          const audience = resolveAudience(process.env.AUTH0_AUDIENCE);
          
          if (!domain || !clientId) {
            console.error('Missing required Auth0 environment variables');
            return NextResponse.redirect(`${baseUrl}/login?error=config_error`);
          }
          
          const loginUrl = `https://${domain}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback`)}&scope=${encodeURIComponent(scope)}&audience=${encodeURIComponent(audience)}`;
          
          return NextResponse.redirect(loginUrl);
        } catch (loginError) {
          console.error('Auth0 login error:', loginError);
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
          return NextResponse.redirect(`${baseUrl}/login?error=login_failed`);
        }
      
      case 'callback':
        // Handle Auth0 callback and create session
        try {
          // For Auth0 callback, we need to handle the authorization code
          // This is typically done by the Auth0 SDK automatically
          // For now, redirect to profile page and let the client handle the session
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
          return NextResponse.redirect(`${baseUrl}/dashboard/profile`);
        } catch (callbackError) {
          console.error('Auth0 callback error:', callbackError);
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
          return NextResponse.redirect(`${baseUrl}/login?error=callback_failed`);
        }
      
      case 'logout':
        // Handle logout - use the correct Auth0 method
        try {
          // For Auth0 v4, we need to construct the logout URL manually
          const domain = process.env.AUTH0_DOMAIN;
          const clientId = process.env.AUTH0_CLIENT_ID;
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
          
          if (!domain || !clientId) {
            console.error('Missing required Auth0 environment variables');
            return NextResponse.redirect(`${baseUrl}/login?error=config_error`);
          }
          
          const logoutUrl = `https://${domain}/v2/logout?client_id=${clientId}&returnTo=${encodeURIComponent(baseUrl)}`;
          
          const response = NextResponse.redirect(logoutUrl);
          // Clear any session cookies
          response.cookies.delete('auth0_session');
          return response;
        } catch (logoutError) {
          console.error('Auth0 logout error:', logoutError);
          // Fallback logout - clear cookie and redirect
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
          const response = NextResponse.redirect(baseUrl);
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
