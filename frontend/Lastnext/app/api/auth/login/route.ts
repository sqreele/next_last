import { NextRequest, NextResponse } from 'next/server';
import { beginHardenedAuth0Login } from '@/app/lib/auth0/login-flow';

export async function GET(request: NextRequest) {
  try {
    return beginHardenedAuth0Login(request);
  } catch (error) {
    console.error('Error in /api/auth/login route:', error);
    const baseUrl =
      process.env.AUTH0_BASE_URL ||
      process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
      process.env.APP_BASE_URL ||
      request.nextUrl.origin;
    const fallback = new URL('/auth/login', baseUrl);
    return NextResponse.redirect(fallback);
  }
}
