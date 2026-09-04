import { NextRequest, NextResponse } from 'next/server';
import { readSessionReference } from '@/app/lib/auth0/session-cookie';
import { loadServerSession, updateServerSession } from '@/app/lib/auth0/server-session-store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const reference = readSessionReference(request.cookies.get('auth0_session')?.value);
  const session = reference ? await loadServerSession(reference) : null;
  const refreshToken = session?.user?.refreshToken;
  if (!reference || !session?.user || !refreshToken) {
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
    await updateServerSession(
      reference,
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
    // Never return a bearer token to browser JavaScript. BFF routes load it.
    return NextResponse.json({ expires_in: expiresIn });
  } catch {
    console.error('auth0_refresh_failed', { reason: 'network_error' });
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 502 });
  }
}
