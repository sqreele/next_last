import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(_request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('auth0_session');

    if (!sessionCookie?.value) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    try {
      const session = JSON.parse(sessionCookie.value);
      return NextResponse.json(session);
    } catch (e) {
      console.error('Failed to parse auth0_session cookie in session-compat route:', e);
      return NextResponse.json({ user: null }, { status: 401 });
    }
  } catch (error) {
    console.error('Error in session-compat GET:', error);
    return NextResponse.json({ error: 'session_error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getCompatServerSession } from '@/app/lib/auth0/server-session';

export async function GET() {
  try {
    const session = await getCompatServerSession();
    return NextResponse.json(session ?? { user: undefined }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ user: undefined, error: 'session_error' }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
