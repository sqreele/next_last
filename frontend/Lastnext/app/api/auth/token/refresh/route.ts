import { NextRequest, NextResponse } from 'next/server';
import { parseSessionReference } from '@/app/lib/auth0/session-cookie';
import { readServerSession, updateServerSession } from '@/app/lib/auth0/session-store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const sessionReference = parseSessionReference(
    request.cookies.get('auth0_session')?.value,
  );
  let session;
  try {
    session = sessionReference ? await readServerSession(sessionReference) : null;
  } catch {
    console.error('auth_server_session_unavailable', { reason: 'store_unavailable' });
    return NextResponse.json({ error: 'Session store unavailable' }, { status: 503 });
  }
  const refreshToken = session?.user?.refreshToken;
  if (!sessionReference || !session?.user || !refreshToken) {
    return NextResponse.json({ error: 'Refresh token unavailable' }, { status: 401 });
  }

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    console.error('auth0_refresh_failed', { reason: 'configuration_missing' });
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 503 });
  }

  try {
    const providerResponse = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });
    if (!providerResponse.ok) {
      console.warn('auth0_refresh_failed', { status: providerResponse.status });
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
    }

    const tokens = await providerResponse.json() as Record<string, unknown>;
    const access = typeof tokens.access_token === 'string' ? tokens.access_token : '';
    const rotatedRefresh = typeof tokens.refresh_token === 'string'
      ? tokens.refresh_token
      : refreshToken;
    const expiresIn = typeof tokens.expires_in === 'number' && tokens.expires_in > 0
      ? tokens.expires_in
      : 3600;
    if (!access) {
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 502 });
    }

    const accessTokenExpires = Date.now() + expiresIn * 1000;
    try {
      await updateServerSession(
        sessionReference,
        {
          ...session,
          user: {
            ...session.user,
            accessToken: access,
            refreshToken: rotatedRefresh,
            accessTokenExpires,
          },
          expires: accessTokenExpires,
        },
      );
    } catch {
      console.error('auth_server_session_unavailable', { reason: 'store_unavailable' });
      return NextResponse.json({ error: 'Session store unavailable' }, { status: 503 });
    }
    // Tokens stay server-side; the browser receives expiry metadata only.
    return NextResponse.json({ expires_in: expiresIn });
  } catch {
    console.error('auth0_refresh_failed', { reason: 'network_error' });
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 502 });
  }
}
