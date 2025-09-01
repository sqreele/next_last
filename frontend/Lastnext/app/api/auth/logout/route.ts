import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get('returnTo') || '/';
    
    console.log('🚪 Logout API called with returnTo:', returnTo);
    
    // Use server-side environment variables
    const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_CLIENT_ID;
    
    console.log('🔍 Logout configuration:', {
      baseUrl,
      auth0Domain,
      clientId: clientId ? '***' : 'missing',
      returnTo
    });
    
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
    
    // Clear the session cookie properly
    response.cookies.delete('auth0_session');
    
    // Also set an expired cookie to ensure it's cleared
    response.cookies.set('auth0_session', '', {
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    
    console.log('✅ Logout response created, cookies cleared');
    
    return response;
    
  } catch (error) {
    console.error('Error in logout route:', error);
    const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
    return NextResponse.redirect(`${baseUrl}/error?message=Logout failed`);
  }
}
