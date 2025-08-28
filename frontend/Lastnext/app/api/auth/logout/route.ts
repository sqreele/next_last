import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get return URL from query params
    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get('returnTo') || `${process.env.NEXT_PUBLIC_AUTH0_BASE_URL || ''}/`;

    // Construct Auth0 logout URL
    const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
    
    if (domain && clientId) {
      // Use Auth0 logout endpoint
      const logoutUrl = `https://${domain}/v2/logout?client_id=${clientId}&returnTo=${encodeURIComponent(returnTo)}`;
      
      const response = NextResponse.redirect(logoutUrl);
      
      // Clear session cookies
      response.cookies.delete('auth0_session');
      
      return response;
    } else {
      // Fallback logout - just clear cookies and redirect
      const response = NextResponse.redirect(returnTo);
      response.cookies.delete('auth0_session');
      return response;
    }
  } catch (error) {
    console.error('Logout error:', error);
    // Fallback redirect
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete('auth0_session');
    return response;
  }
}
