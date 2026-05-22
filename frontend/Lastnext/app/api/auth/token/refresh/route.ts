import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';

export const runtime = 'nodejs';

function getAccessTokenExpiry(accessToken?: string): number | undefined {
  if (!accessToken) return undefined;

  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

async function refreshWithAuth0(refreshToken: string) {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;

  if (!domain || !clientId || !clientSecret) {
    return null;
  }

  const response = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const auth0Tokens = await response.json();
  if (!auth0Tokens.access_token) {
    return null;
  }

  return {
    access: auth0Tokens.access_token,
    refresh: auth0Tokens.refresh_token || refreshToken,
    expires_in: auth0Tokens.expires_in,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward token refresh request to Django backend
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/token/refresh/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    let tokens: any = null;
    if (response.ok) {
      tokens = await response.json();
    } else {
      console.error('Token refresh failed:', response.status, response.statusText);
      tokens = body.refresh ? await refreshWithAuth0(body.refresh) : null;
      if (!tokens) {
        return NextResponse.json(
          { error: 'Token refresh failed' },
          { status: response.status }
        );
      }
    }

    const nextResponse = NextResponse.json(tokens);

    const sessionCookie = request.cookies.get('auth0_session')?.value;
    if (sessionCookie && tokens.access) {
      try {
        const sessionData = JSON.parse(sessionCookie);
        const accessTokenExpires = getAccessTokenExpiry(tokens.access);
        const updatedSession = {
          ...sessionData,
          user: {
            ...sessionData.user,
            accessToken: tokens.access,
            refreshToken: tokens.refresh || sessionData.user?.refreshToken || body.refresh,
            ...(accessTokenExpires ? { accessTokenExpires } : {}),
          },
          ...(accessTokenExpires ? { expires: accessTokenExpires } : {}),
        };

        nextResponse.cookies.set('auth0_session', JSON.stringify(updatedSession), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: tokens.refresh ? 60 * 24 * 60 * 60 : 24 * 60 * 60,
        });
      } catch (cookieError) {
        console.error('Failed to update session cookie after token refresh:', cookieError);
      }
    }

    return nextResponse;

  } catch (error) {
    console.error('Error in token refresh route:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
