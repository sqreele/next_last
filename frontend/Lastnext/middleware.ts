import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define protected routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/jobs',
  '/preventive-maintenance',
  '/rooms',
  '/profile',
  '/createJob',
  '/myJobs',
  '/jobs-report',
];

// Define public routes that don't require authentication
const publicRoutes = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/about',
  '/contact',
  '/pricing',
  '/features',
  '/api/auth',
  '/_next',
  '/favicon.ico',
];

// Define API routes that require authentication
const protectedApiRoutes = [
  '/api/v1/jobs',
  '/api/v1/properties',
  '/api/v1/rooms',
  '/api/v1/preventive-maintenance',
  '/api/v1/users',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip middleware for static files and API routes that don't need auth
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next();
  }

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  );
  
  const isProtectedApiRoute = protectedApiRoutes.some(route => 
    pathname.startsWith(route)
  );

  // Get the auth0_session cookie and check if user is authenticated
  const auth0SessionCookie = request.cookies.get('auth0_session')?.value;
  let isAuthenticated = false;
  
  if (auth0SessionCookie) {
    try {
      const sessionData = JSON.parse(auth0SessionCookie);
      // Check if session has valid user data and access token
      isAuthenticated = !!(sessionData?.user?.accessToken && 
                          sessionData?.user?.id && 
                          (!sessionData?.user?.accessTokenExpires || 
                           Date.now() < sessionData.user.accessTokenExpires));
    } catch (error) {
      console.error('Error parsing auth0_session cookie:', error);
      isAuthenticated = false;
    }
  }

  // Handle protected routes
  if (isProtectedRoute || isProtectedApiRoute) {
    if (!isAuthenticated) {
      // Store the original URL for redirect after login
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      
      // For API routes, return 401 status
      if (isProtectedApiRoute) {
        return new NextResponse(
          JSON.stringify({ 
            error: 'Unauthorized', 
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      
      // For page routes, redirect to login
      return NextResponse.redirect(loginUrl);
    }
  }

  // Handle login page - redirect authenticated users to dashboard
  if (pathname === '/auth/login' && isAuthenticated) {
    const redirectUrl = request.nextUrl.searchParams.get('redirect') || '/dashboard';
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  }

  // Handle root page - allow both authenticated and unauthenticated users
  // Authenticated users can choose to stay or go to dashboard
  if (pathname === '/' && isAuthenticated) {
    // Don't force redirect - let user choose
    // They can stay on landing page or navigate to dashboard
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

