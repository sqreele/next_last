import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get('returnTo') || '/';
    
    const baseUrl = process.env.NEXT_PUBLIC_AUTH0_BASE_URL || 'http://localhost:3000';
    const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
    
    if (!auth0Domain || !clientId) {
      console.error('Missing Auth0 configuration');
      return NextResponse.redirect(`${baseUrl}/error?message=Auth0 not configured`);
    }
    
    // Build Auth0 logout URL
    const auth0LogoutUrl = `https://${auth0Domain}/v2/logout?` + new URLSearchParams({
      client_id: clientId,
      returnTo: `${baseUrl}${returnTo}`,
    });
    
    console.log('🚪 Redirecting to Auth0 logout:', auth0LogoutUrl);
    
    // Create response and clear session cookie
    const response = NextResponse.redirect(auth0LogoutUrl);
    response.cookies.set('auth0_session', '', {
      expires: new Date(0),
      path: '/',
    });
    
    return response;
    
  } catch (error) {
    console.error('Error in logout route:', error);
    return NextResponse.redirect('/error?message=Logout failed');
  }
}
