import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/app/lib/auth0/session-cookie';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get('returnTo') || '/';
    
    // Use server-side environment variables
    const baseUrl = process.env.AUTH0_BASE_URL || 'https://hotelcarepro.com';
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_CLIENT_ID;
    
    if (!auth0Domain || !clientId) {
      console.error('Missing Auth0 configuration');
      return NextResponse.redirect(`${baseUrl}/error?message=Auth0 not configured`);
    }
    
    // Build Auth0 logout URL
    const auth0LogoutUrl = `https://${auth0Domain}/v2/logout?` + new URLSearchParams({
      client_id: clientId,
      returnTo: `${baseUrl}${returnTo}`,
    });
    
    // Create response and clear session cookie
    const response = NextResponse.redirect(auth0LogoutUrl);
    clearSessionCookie(response);
    
    return response;
    
  } catch (error) {
    console.error('Error in logout route:', error);
    const baseUrl = process.env.AUTH0_BASE_URL || 'https://hotelcarepro.com';
    return NextResponse.redirect(`${baseUrl}/error?message=Logout failed`);
  }
}
