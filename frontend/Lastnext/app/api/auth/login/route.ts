import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const returnTo = searchParams.get('returnTo') || '/dashboard';
    
    // Generate Auth0 login URL
    const loginUrl = await auth0.startInteractiveLogin({
      returnTo: `${process.env.AUTH0_BASE_URL}${returnTo}`,
    });
    
    // loginUrl should be a string URL
    if (typeof loginUrl === 'string') {
      return NextResponse.redirect(loginUrl);
    } else {
      throw new Error('Invalid login URL returned from Auth0');
    }
  } catch (error) {
    console.error('Auth0 login error:', error);
    return NextResponse.redirect('/auth/error');
  }
}
