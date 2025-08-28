import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';

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
    return NextResponse.next();
  }

  return await auth0.middleware(request);
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

