import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logSessionDiagnostic } from "@/app/lib/auth0/session-diagnostics.mjs";

const AUTH0_SESSION_COOKIE = "auth0_session";
const OPAQUE_SESSION_REFERENCE = /^v2\.[A-Za-z0-9_-]{43}$/;

/* Middleware runs in the Edge runtime, which cannot open the Docker-only
 * Redis TCP endpoint. It rejects every legacy format here; Node BFF routes
 * load Redis and fail closed before forwarding authenticated API requests. */
function hasOpaqueSessionReference(cookieValue?: string): boolean {
  return !!cookieValue && OPAQUE_SESSION_REFERENCE.test(cookieValue);
}

function sanitizeLocalRedirect(value: string | null, fallback: string): string {
  if (!value) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return fallback;
  }
  return decoded;
}

// Define protected routes that require authentication
const protectedRoutes = [
  "/dashboard",
  "/jobs",
  "/preventive-maintenance",
  "/rooms",
  "/profile",
  "/createJob",
  "/myJobs",
  "/jobs-report",
];

// Define public routes that don't require authentication
const PUBLIC_FILE = /\.[^/]+$/;

// Define API routes that require authentication
const protectedApiRoutes = [
  "/api/v1/jobs",
  "/api/v1/properties",
  "/api/v1/rooms",
  "/api/v1/preventive-maintenance",
  "/api/v1/users",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files and API routes that don't need auth
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  const isProtectedApiRoute = protectedApiRoutes.some((route) =>
    pathname.startsWith(route),
  );

  // Get the auth0_session cookie and check if user is authenticated.
  // Only a v2 opaque reference is accepted. v1 sealed payloads and plaintext
  // legacy cookies require a fresh login and have no compatibility fallback.
  const auth0SessionCookie = request.cookies.get(AUTH0_SESSION_COOKIE)?.value;
  const isAuthenticated = hasOpaqueSessionReference(auth0SessionCookie);

  if (isProtectedRoute || isProtectedApiRoute) {
    logSessionDiagnostic(auth0SessionCookie, null, { lookup: 'edge_deferred' });
  }

  // Handle protected routes
  if (isProtectedRoute || isProtectedApiRoute) {
    if (!isAuthenticated) {
      // Store the original URL for redirect after login
      const baseUrl =
        process.env.AUTH0_BASE_URL ||
        process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
        process.env.APP_BASE_URL ||
        "https://staymaint.com";
      const loginUrl = new URL("/auth/login", baseUrl);
      loginUrl.searchParams.set("redirect", pathname);

      // For API routes, return 401 status
      if (isProtectedApiRoute) {
        return new NextResponse(
          JSON.stringify({
            error: "Unauthorized",
            message: "Authentication required",
            code: "AUTH_REQUIRED",
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      // For page routes, redirect to login
      return NextResponse.redirect(loginUrl);
    }
  }

  // Handle login page - redirect authenticated users to dashboard
  if (pathname === "/auth/login" && isAuthenticated) {
    const redirectUrl = sanitizeLocalRedirect(
      request.nextUrl.searchParams.get("redirect"),
      "/dashboard",
    );
    const baseUrl =
      process.env.AUTH0_BASE_URL ||
      process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
      process.env.APP_BASE_URL ||
      "https://staymaint.com";
    return NextResponse.redirect(new URL(redirectUrl, baseUrl));
  }

  // Handle root page - allow both authenticated and unauthenticated users
  // Authenticated users can choose to stay or go to dashboard
  if (pathname === "/" && isAuthenticated) {
    // Don't force redirect - let user choose
    // They can stay on landing page or navigate to dashboard
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json).*)",
  ],
};
