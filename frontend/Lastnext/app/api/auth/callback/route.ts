import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      console.error('No authorization code provided');
      return NextResponse.redirect('/login?error=no_code');
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
      const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
      
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
        console.log('🔍 Attempting to fetch user info from Auth0...');
        console.log('🔍 Domain:', domain);
        console.log('🔍 Access token length:', tokens.access_token?.length);
        
        userResponse = await fetch(`https://${domain}/userinfo`, {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
          },
        });

        console.log('🔍 Userinfo response status:', userResponse.status);
        console.log('🔍 Userinfo response headers:', Object.fromEntries(userResponse.headers.entries()));

        if (userResponse.ok) {
          userInfo = await userResponse.json();
          console.log('🔍 Auth0 user info received:', {
            sub: userInfo?.sub,
            nickname: userInfo?.nickname,
            name: userInfo?.name,
            email: userInfo?.email,
            picture: userInfo?.picture,
            positions: userInfo?.positions
          });
          
          // Log all available fields from Auth0
          console.log('🔍 All Auth0 user fields:', Object.keys(userInfo));
          console.log('🔍 Full Auth0 user data:', JSON.stringify(userInfo, null, 2));
        } else if (userResponse.status === 429) {
          // Rate limited - wait a bit and retry once
          console.log('Rate limited by Auth0, waiting 2 seconds before retry...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          userResponse = await fetch(`https://${domain}/userinfo`, {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
            },
          });
          
          if (userResponse.ok) {
            userInfo = await userResponse.json();
            console.log('🔍 Auth0 user info received (retry):', {
              sub: userInfo?.sub,
              nickname: userInfo?.nickname,
              name: userInfo?.name,
              email: userInfo?.email
            });
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
          console.log('🔍 Attempting to decode ID token for user info...');
          // Simple base64 decode of JWT payload (this is safe for public claims)
          const payload = tokens.id_token.split('.')[1];
          if (payload) {
            const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
            console.log('🔍 ID token payload:', decoded);
            
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
            console.log('🔍 Using ID token data as fallback:', userInfo);
          }
        } catch (decodeError) {
          console.error('🔍 Failed to decode ID token:', decodeError);
        }
      }

      // Debug: Log what we have before creating session
      console.log('🔍 Before creating session - available data:', {
        hasUserInfo: !!userInfo,
        userInfoKeys: userInfo ? Object.keys(userInfo) : [],
        sub: userInfo?.sub,
        nickname: userInfo?.nickname,
        name: userInfo?.name,
        email: userInfo?.email,
        picture: userInfo?.picture,
        profile_image_mapping: userInfo?.picture || 'No picture field',
        tokens: {
          hasAccessToken: !!tokens.access_token,
          accessTokenLength: tokens.access_token?.length,
          hasRefreshToken: !!tokens.refresh_token,
          hasIdToken: !!tokens.id_token
        }
      });

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
      console.log('🔍 Creating session with user data:', {
        id: sessionData.user.id,
        username: sessionData.user.username,
        email: sessionData.user.email,
        profile_image: sessionData.user.profile_image,
        hasProfileImage: !!sessionData.user.profile_image,
        hasAccessToken: !!sessionData.user.accessToken,
        accessTokenLength: sessionData.user.accessToken?.length,
        note: 'Properties will be fetched by session-compat API'
      });

      // Redirect to dashboard with session cookie
      const response = NextResponse.redirect(`${baseUrl}/dashboard`);
      
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
        `${process.env.AUTH0_BASE_URL || 'https://pcms.live'}/login?error=token_exchange_error`
      );
    }

  } catch (error) {
    console.error('Auth0 callback error:', error);
    return NextResponse.redirect(
      `${process.env.AUTH0_BASE_URL || 'https://pcms.live'}/login?error=callback_error`
    );
  }
}
