import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const returnTo = searchParams.get('returnTo') || '/';
    
    // In Auth0 v4, we need to construct the logout URL manually
    const domain = process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '') || process.env.AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_CLIENT_ID;
    const logoutUrl = `https://${domain}/v2/logout?client_id=${clientId}&returnTo=${encodeURIComponent(process.env.AUTH0_BASE_URL + returnTo)}`;
    
    return NextResponse.redirect(logoutUrl);
  } catch (error) {
    console.error('Auth0 logout error:', error);
    return NextResponse.redirect('/auth/error');
  }
}
