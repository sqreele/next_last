import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle Auth0 errors
    if (error) {
      console.error('Auth0 callback error:', error, errorDescription);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/login?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || '')}`
      );
    }

    // Check if we have the authorization code
    if (!code) {
      console.error('Auth0 callback missing authorization code');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/login?error=missing_code`
      );
    }

    // Exchange authorization code for tokens
    try {
      const resolveAudience = (raw?: string | null): string => {
        // Use environment variable as fallback, or default to localhost for development
        const fallback = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE || 'http://localhost:8000';
        if (!raw) return fallback;
        const trimmed = raw.trim().replace(/\/$/, '');
        if (
          trimmed === 'https://pcms.live' ||
          trimmed === 'http://pcms.live' ||
          trimmed === 'https://www.pcms.live'
        ) {
          return 'https://pcms.live/api';
        }
        if (trimmed.endsWith('/api')) return trimmed;
        try {
          const u = new URL(trimmed);
          if (u.hostname.endsWith('pcms.live') && u.pathname === '') {
            return `${trimmed}/api`;
          }
        } catch {}
        return trimmed;
      };

      const audience = resolveAudience(process.env.NEXT_PUBLIC_AUTH0_AUDIENCE);
      const tokenResponse = await fetch(`https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID,
          client_secret: process.env.NEXT_PUBLIC_AUTH0_CLIENT_SECRET,
          code: code,
          redirect_uri: `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/api/auth/callback`,
          audience,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', tokenResponse.status, errorText);
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/login?error=token_exchange_failed`
        );
      }

      const tokens = await tokenResponse.json();
      
      // Get user info using the access token
      const userResponse = await fetch(`https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/userinfo`, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      });

      if (!userResponse.ok) {
        console.error('User info fetch failed:', userResponse.status);
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/login?error=user_info_failed`
        );
      }

      const userInfo = await userResponse.json();

      // Create session data
      const sessionData = {
        user: {
          ...userInfo,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          accessTokenExpires: Date.now() + (tokens.expires_in * 1000),
        },
        expires: Date.now() + (tokens.expires_in * 1000),
      };

      // Redirect to profile page with session cookie
              const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/dashboard/profile`);
      
      // Set session cookie
      response.cookies.set('auth0_session', JSON.stringify(sessionData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: tokens.expires_in, // Use token expiry time
      });

      return response;

    } catch (tokenError) {
      console.error('Token exchange error:', tokenError);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/login?error=token_exchange_error`
      );
    }

  } catch (error) {
    console.error('Auth0 callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/login?error=callback_error`
    );
  }
}
