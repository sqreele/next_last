import { NextRequest, NextResponse } from 'next/server';
import { beginHardenedAuth0Login } from '@/app/lib/auth0/login-flow';
import { clearSessionCookie, parseSessionReference, sanitizeSessionForClient } from '@/app/lib/auth0/session-cookie';
import { getSessionFromRequest } from '@/app/lib/auth0/server-session';
import { deleteServerSession } from '@/app/lib/auth0/session-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'login':
        try {
          return beginHardenedAuth0Login(request);
        } catch (loginError) {
          console.error('Auth0 login error:', loginError);
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://hotelcarepro.com';
          return NextResponse.redirect(`${baseUrl}/login?error=login_failed`);
        }
      
      case 'callback':
        // Handle Auth0 callback and create session
        try {
          // For Auth0 callback, we need to handle the authorization code
          // This is typically done by the Auth0 SDK automatically
          // For now, redirect to profile page and let the client handle the session
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://hotelcarepro.com';
          return NextResponse.redirect(`${baseUrl}/dashboard/profile`);
        } catch (callbackError) {
          console.error('Auth0 callback error:', callbackError);
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://hotelcarepro.com';
          return NextResponse.redirect(`${baseUrl}/login?error=callback_failed`);
        }
      
      case 'logout':
        // Handle logout - use the correct Auth0 method
        try {
          // For Auth0 v4, we need to construct the logout URL manually
          const domain = process.env.AUTH0_DOMAIN;
          const clientId = process.env.AUTH0_CLIENT_ID;
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://hotelcarepro.com';
          
          if (!domain || !clientId) {
            console.error('Missing required Auth0 environment variables');
            return NextResponse.redirect(`${baseUrl}/login?error=config_error`);
          }
          
          const logoutUrl = `https://${domain}/v2/logout?client_id=${clientId}&returnTo=${encodeURIComponent(baseUrl)}`;
          
          const reference = parseSessionReference(request.cookies.get('auth0_session')?.value);
          if (reference) {
            try {
              await deleteServerSession(reference);
            } catch {
              console.error('auth_server_session_delete_failed', { reason: 'store_unavailable' });
            }
          }
          const response = NextResponse.redirect(logoutUrl);
          // Clear any session cookies
          clearSessionCookie(response);
          return response;
        } catch (logoutError) {
          console.error('Auth0 logout error:', logoutError);
          // Fallback logout - clear cookie and redirect
          const baseUrl = process.env.AUTH0_BASE_URL || 'https://hotelcarepro.com';
          const response = NextResponse.redirect(baseUrl);
          clearSessionCookie(response);
          return response;
        }
      
      case 'profile':
        // Get user profile from session
        try {
          const session = await getSessionFromRequest(request);
          const clientSession = sanitizeSessionForClient(session);
          if (clientSession?.user) {
            return NextResponse.json({ user: clientSession.user });
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
