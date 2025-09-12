// app/api/auth/error/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ERROR_TYPES, ROUTES } from '@/app/lib/config';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const error = searchParams.get('error');
    
    console.log('🔐 Auth Error Handler:', {
      error,
      allParams: Object.fromEntries(searchParams.entries()),
      url: request.url
    });

    // If no error parameter, set a default one
    if (!error || error === 'undefined') {
      console.log('🔐 No error parameter found, setting default error');
      const baseUrl =
        process.env.AUTH0_BASE_URL ||
        process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
        process.env.APP_BASE_URL ||
        'https://pcms.live';
      const errorUrl = new URL('/auth/error', baseUrl);
      errorUrl.searchParams.set('error', ERROR_TYPES.SESSION_EXPIRED);
      
      return NextResponse.redirect(errorUrl);
    }

    // If error parameter exists, redirect to error page with it
    const baseUrl =
      process.env.AUTH0_BASE_URL ||
      process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
      process.env.APP_BASE_URL ||
      'https://pcms.live';
    const errorUrl = new URL('/auth/error', baseUrl);
    errorUrl.searchParams.set('error', error);
    
    console.log('🔐 Redirecting to error page with error:', error);
    return NextResponse.redirect(errorUrl);

  } catch (error) {
    console.error('🔐 Error handler error:', error);
    
    // Fallback to error page with session expired error
    const baseUrl =
      process.env.AUTH0_BASE_URL ||
      process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
      process.env.APP_BASE_URL ||
      'https://pcms.live';
    const errorUrl = new URL('/auth/error', baseUrl);
    errorUrl.searchParams.set('error', ERROR_TYPES.SESSION_EXPIRED);
    
    return NextResponse.redirect(errorUrl);
  }
}
