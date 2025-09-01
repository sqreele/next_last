import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get('returnTo') || '/dashboard';
    
    // Build Auth0 login URL
    const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
    const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE || 'https://pcms.live/api';
    const forwardedProto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'https';
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const derivedBase = forwardedHost ? `${forwardedProto}://${forwardedHost}` : undefined;
    const baseUrl = process.env.NEXT_PUBLIC_AUTH0_BASE_URL || derivedBase || 'https://pcms.live';
    
    if (!auth0Domain || !clientId) {
      console.error('Missing Auth0 configuration');
      return NextResponse.redirect(`${baseUrl}/error?message=Auth0 not configured`);
    }
    
    const auth0LoginUrl = `https://${auth0Domain}/authorize?` + new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: `${baseUrl}/api/auth/callback`,
      scope: 'openid profile email',
      audience: audience,
      state: returnTo,
    });
    
    console.log('🔐 Redirecting to Auth0 login:', auth0LoginUrl);
    return NextResponse.redirect(auth0LoginUrl);
    
  } catch (error) {
    console.error('Error in login route:', error);
    return NextResponse.redirect('/error?message=Login failed');
  }
}
