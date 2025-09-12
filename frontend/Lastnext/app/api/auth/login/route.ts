import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const redirect = searchParams.get('redirect');

    // Prefer delegating to unified /api/auth?action=login handler
    const baseUrl =
      process.env.AUTH0_BASE_URL ||
      process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
      process.env.APP_BASE_URL ||
      'https://pcms.live';

    const base = new URL('/api/auth', baseUrl);
    base.searchParams.set('action', 'login');
    if (redirect) base.searchParams.set('redirect', redirect);

    return NextResponse.redirect(base);
  } catch (error) {
    console.error('Error in /api/auth/login route:', error);
    const baseUrl =
      process.env.AUTH0_BASE_URL ||
      process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
      process.env.APP_BASE_URL ||
      'https://pcms.live';
    const fallback = new URL('/auth/login', baseUrl);
    return NextResponse.redirect(fallback);
  }
}
