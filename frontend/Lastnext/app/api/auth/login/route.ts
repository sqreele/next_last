import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const redirect = searchParams.get('redirect');

    // Prefer delegating to unified /api/auth?action=login handler
    const base = new URL('/api/auth', request.url);
    base.searchParams.set('action', 'login');
    if (redirect) base.searchParams.set('redirect', redirect);

    return NextResponse.redirect(base);
  } catch (error) {
    console.error('Error in /api/auth/login route:', error);
    const fallback = new URL('/auth/login', request.url);
    return NextResponse.redirect(fallback);
  }
}
