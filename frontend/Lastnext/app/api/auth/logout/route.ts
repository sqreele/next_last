import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo');
  const redirectUrl = returnTo ? `/auth/logout?returnTo=${encodeURIComponent(returnTo)}` : '/auth/logout';
  return NextResponse.redirect(redirectUrl);
}
