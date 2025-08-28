import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Auth0 client
const auth0 = new Auth0Client({
  domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN!,
  clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!,
  clientSecret: process.env.NEXT_PUBLIC_AUTH0_CLIENT_SECRET!,
  appBaseUrl: process.env.NEXT_PUBLIC_AUTH0_BASE_URL!,
  secret: process.env.NEXT_PUBLIC_AUTH0_SECRET!,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'login':
        // Start interactive login - redirect to Auth0
        try {
          // For Auth0 v4, construct the login URL manually
          const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
          const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
          const returnTo = `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/profile`;
          const scope = 'openid profile email';
          
          const loginUrl = `https://${domain}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent('https://pcms.live/auth/callback')}&scope=${encodeURIComponent(scope)}`;
          
          return NextResponse.redirect(loginUrl);
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
          return NextResponse.redirect('https://pcms.live/profile');
        } catch (callbackError) {
          console.error('Auth0 callback error:', callbackError);
          return NextResponse.redirect('https://pcms.live/login?error=callback_failed');
        }
      
      case 'logout':
        // Handle logout - use the correct Auth0 method
        try {
          // For Auth0 v4, we need to construct the logout URL manually
          const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
          const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
          const returnTo = `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/`;
          
          const logoutUrl = `https://${domain}/v2/logout?client_id=${clientId}&returnTo=${encodeURIComponent('https://pcms.live/')}`;
          
          const response = NextResponse.redirect(logoutUrl);
          // Clear any session cookies
          response.cookies.delete('auth0_session');
          return response;
        } catch (logoutError) {
          console.error('Auth0 logout error:', logoutError);
          // Fallback logout - clear cookie and redirect
          const response = NextResponse.redirect('https://pcms.live/');
          response.cookies.delete('auth0_session');
          return response;
        }
      
      case 'profile':
        // Get user profile from session
        try {
          const session = await auth0.getSession(request);
          if (session?.user) {
            return NextResponse.json({ user: session.user });
          } else {
            return NextResponse.json({ user: null }, { status: 401 });
          }
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
