import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const expectedState = request.cookies.get('auth0_login_state')?.value;
    const baseUrl = process.env.AUTH0_BASE_URL || request.nextUrl.origin;

    if (!code) {
      console.error('No authorization code provided');
      return NextResponse.redirect(`${baseUrl}/login?error=no_code`);
    }

    if (!state || !expectedState || state !== expectedState) {
      console.error('OAuth state validation failed');
      const invalidStateRedirect = NextResponse.redirect(`${baseUrl}/login?error=invalid_state`);
      invalidStateRedirect.cookies.delete('auth0_login_state');
      return invalidStateRedirect;
    }

    // Exchange authorization code for tokens using server-side environment variables
    try {
      const resolveAudience = (raw?: string | null): string => {
        // Use server-side environment variable as fallback
        const fallback = process.env.AUTH0_AUDIENCE || 'https://pcms.live/api';
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

      const audience = resolveAudience(process.env.AUTH0_AUDIENCE);
      
      // Use server-side environment variables for sensitive data
      const domain = process.env.AUTH0_DOMAIN;
      const clientId = process.env.AUTH0_CLIENT_ID;
      const clientSecret = process.env.AUTH0_CLIENT_SECRET;
      const baseUrl = process.env.AUTH0_BASE_URL || request.nextUrl.origin;
      
      if (!domain || !clientId || !clientSecret) {
        console.error('Missing required Auth0 environment variables');
        return NextResponse.redirect(`${baseUrl}/login?error=config_error`);
      }

      const tokenResponse = await fetch(`https://${domain}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: `${baseUrl}/api/auth/callback`,
          audience,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', tokenResponse.status, errorText);
        return NextResponse.redirect(
          `${baseUrl}/login?error=token_exchange_failed`
        );
      }

      const tokens = await tokenResponse.json();
      
      // Get user info using the access token - with retry logic for rate limiting
      let userInfo = null;
      let userResponse = null;
      
      try {
        
        userResponse = await fetch(`https://${domain}/userinfo`, {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
          },
        });

        if (userResponse.ok) {
          userInfo = await userResponse.json();
          
          // Log all available fields from Auth0
        } else if (userResponse.status === 429) {
          // Rate limited - wait a bit and retry once
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          userResponse = await fetch(`https://${domain}/userinfo`, {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
            },
          });
          
          if (userResponse.ok) {
            userInfo = await userResponse.json();
          } else {
            console.error('🔍 Retry failed with status:', userResponse.status);
            const errorText = await userResponse.text();
            console.error('🔍 Retry error response:', errorText);
          }
        } else {
          console.error('🔍 Userinfo request failed with status:', userResponse.status);
          const errorText = await userResponse.text();
          console.error('🔍 Error response:', errorText);
        }
      } catch (userInfoError) {
        console.error('🔍 Error fetching user info:', userInfoError);
        // Continue without user info - we'll create a minimal session
      }

      // If userinfo failed, try to extract basic info from the ID token
      if (!userInfo && tokens.id_token) {
        try {
          // Simple base64 decode of JWT payload (this is safe for public claims)
          const payload = tokens.id_token.split('.')[1];
          if (payload) {
            const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
            
            // Use ID token data as fallback
            userInfo = {
              sub: decoded.sub,
              email: decoded.email,
              name: decoded.name,
              given_name: decoded.given_name,
              family_name: decoded.family_name,
              nickname: decoded.nickname,
              picture: decoded.picture,
              email_verified: decoded.email_verified
            };
          }
        } catch (decodeError) {
          console.error('🔍 Failed to decode ID token:', decodeError);
        }
      }

      // Debug: Log what we have before creating session

      // Create session data with proper user structure
      const sessionData = {
        user: {
          // Use a sanitized ID that's URL-friendly and consistent with backend
          id: userInfo?.sub ? userInfo.sub.replace('|', '_') : `auth0_${Date.now()}`,
          // More reliable username extraction - prioritize human-readable names
          username: userInfo?.given_name || userInfo?.name || userInfo?.nickname || userInfo?.email?.split('@')[0] || 'User',
          email: userInfo?.email || 'unknown@example.com',
          profile_image: userInfo?.picture || null,
          positions: userInfo?.positions || 'User',
          properties: [], // Will be populated by session-compat API
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          accessTokenExpires: Date.now() + (tokens.expires_in * 1000),
          created_at: new Date().toISOString(),
          // Include full Auth0 profile data for backend processing
          auth0_profile: {
            sub: userInfo?.sub,
            email: userInfo?.email,
            email_verified: userInfo?.email_verified,
            name: userInfo?.name,
            given_name: userInfo?.given_name,
            family_name: userInfo?.family_name,
            nickname: userInfo?.nickname,
            picture: userInfo?.picture,
            locale: userInfo?.locale,
            updated_at: userInfo?.updated_at
          }
        },
        expires: Date.now() + (tokens.expires_in * 1000),
      };

      // Ensure we have valid user data - fallback to sub if other fields are missing
      if (!sessionData.user.id || sessionData.user.id === `auth0_${Date.now()}`) {
        sessionData.user.id = userInfo?.sub || 'unknown';
      }
      
      if (!sessionData.user.username || sessionData.user.username === 'User') {
        sessionData.user.username = userInfo?.given_name || userInfo?.name || userInfo?.nickname || userInfo?.email?.split('@')[0] || 'User';
      }

      // Debug log the session data being created

      // Check if user is new by querying the backend for their properties
      let isNewUser = true;
      let userProperties: any[] = [];
      
      try {
        const backendUrl = process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';
        
        const propertiesResponse = await fetch(`${backendUrl}/api/v1/properties/`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (propertiesResponse.ok) {
          userProperties = await propertiesResponse.json();
          
          // User is NOT new if they have properties assigned
          isNewUser = !Array.isArray(userProperties) || userProperties.length === 0;
        } else {
          isNewUser = true;
        }
      } catch (propertiesError) {
        console.error('🔍 Error checking user properties:', propertiesError);
        // If we can't check, assume new user for safety
        isNewUser = true;
      }

      // Determine redirect destination
      let redirectUrl = `${baseUrl}/dashboard`;
      
      if (isNewUser) {
        // New user - redirect to onboarding
        redirectUrl = `${baseUrl}/auth/onboarding`;
      } else {
      }

      // Redirect with session cookie
      const response = NextResponse.redirect(redirectUrl);
      
      // Set session cookie
      response.cookies.set('auth0_session', JSON.stringify(sessionData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: tokens.refresh_token ? 60 * 24 * 60 * 60 : Math.max(tokens.expires_in || 0, 24 * 60 * 60),
      });
      response.cookies.delete('auth0_login_state');

      return response;

    } catch (tokenError) {
      console.error('Token exchange error:', tokenError);
      const tokenErrorRedirect = NextResponse.redirect(
        `${process.env.AUTH0_BASE_URL || request.nextUrl.origin}/login?error=token_exchange_error`
      );
      tokenErrorRedirect.cookies.delete('auth0_login_state');
      return tokenErrorRedirect;
    }

  } catch (error) {
    console.error('Auth0 callback error:', error);
    const callbackErrorRedirect = NextResponse.redirect(
      `${process.env.AUTH0_BASE_URL || request.nextUrl.origin}/login?error=callback_error`
    );
    callbackErrorRedirect.cookies.delete('auth0_login_state');
    return callbackErrorRedirect;
  }
}
