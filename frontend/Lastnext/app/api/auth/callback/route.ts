import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    
    if (!code || !state) {
      throw new Error('Missing authorization code or state');
    }
    
    // In Auth0 v4, the session is handled automatically by middleware
    // We just need to redirect to the intended destination
    // The session will be available on subsequent requests
    const returnTo = searchParams.get('returnTo') || '/dashboard';
    return NextResponse.redirect(`${process.env.AUTH0_BASE_URL}${returnTo}`);
    
  } catch (error) {
    console.error('Auth0 callback error:', error);
    return NextResponse.redirect('/auth/error');
  }
}
