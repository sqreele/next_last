import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url);

  // Skip middleware for API routes, especially Auth0 and session endpoints
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Safety guard: if Auth0 is not fully configured, bypass Auth0 middleware
  const hasAuth0Config = Boolean(
    process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_CLIENT_ID &&
    (process.env.AUTH0_CLIENT_SECRET || process.env.AUTH0_ISSUER_BASE_URL) &&
    process.env.AUTH0_SECRET
  );

  if (!hasAuth0Config) {
    // Avoid crashing with missing secrets ("ikm" length) and allow app to load
    console.log('🔧 Auth0 not configured, bypassing middleware');
    return NextResponse.next();
  }

  // Define protected routes that require authentication
  const protectedRoutes = [
    '/dashboard',
    '/properties',
    '/maintenance',
    '/reports',
    '/profile',
    '/settings'
  ];

  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  if (isProtectedRoute) {
    // Check for Auth0 session cookie
    const auth0Session = request.cookies.get('auth0_session');
    
    if (!auth0Session) {
      // No session found, redirect to login
      console.log('🔒 Access denied to protected route, redirecting to login');
      const loginUrl = new URL('/api/auth/[...auth0]?action=login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    try {
      // Validate session cookie (basic check)
      const sessionData = JSON.parse(auth0Session.value);
      if (!sessionData || !sessionData.user) {
        // Invalid session, redirect to login
        console.log('🔒 Invalid session, redirecting to login');
        const loginUrl = new URL('/api/auth/[...auth0]?action=login', request.url);
        return NextResponse.redirect(loginUrl);
      }

      // Session is valid, allow access
      console.log('✅ Authenticated access granted to:', pathname);
      return NextResponse.next();
    } catch (error) {
      // Session parsing failed, redirect to login
      console.error('🔒 Session parsing failed:', error);
      const loginUrl = new URL('/api/auth/[...auth0]?action=login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // For non-protected routes, just pass through
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (all API routes, including Auth0 and session endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};

