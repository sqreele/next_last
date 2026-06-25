import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type MiddlewareSession = {
  user?: {
    id?: string;
    accessToken?: string;
    accessTokenExpires?: number;
  };
};

const AUTH0_SESSION_COOKIE = "auth0_session";
const SEALED_COOKIE_VERSION = "v1";

function getSessionSecret(): string | undefined {
  return (
    process.env.AUTH0_SESSION_SECRET ||
    process.env.AUTH0_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH0_CLIENT_SECRET ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : "dev-only-auth-session-secret-change-me")
  );
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}

async function openSealedSessionCookie(
  cookieValue: string,
): Promise<MiddlewareSession | null> {
  const [version, iv, tag, encrypted] = cookieValue.split(".");

  if (version !== SEALED_COOKIE_VERSION || !iv || !tag || !encrypted) {
    return null;
  }

  const secret = getSessionSecret();
  if (!secret) {
    console.warn(
      "Cannot decrypt auth0_session cookie: AUTH0_SESSION_SECRET or AUTH0_SECRET is not configured.",
    );
    return null;
  }

  const encryptedBytes = base64UrlToBytes(encrypted);
  const tagBytes = base64UrlToBytes(tag);
  const ciphertextWithTag = new Uint8Array(
    encryptedBytes.length + tagBytes.length,
  );
  ciphertextWithTag.set(encryptedBytes);
  ciphertextWithTag.set(tagBytes, encryptedBytes.length);

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(iv).buffer as ArrayBuffer,
      tagLength: 128,
    },
    await deriveAesKey(secret),
    ciphertextWithTag.buffer as ArrayBuffer,
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as MiddlewareSession;
}

async function readSessionCookie(
  cookieValue?: string,
): Promise<MiddlewareSession | null> {
  if (!cookieValue) return null;

  try {
    if (cookieValue.trim().startsWith("{")) {
      return JSON.parse(cookieValue) as MiddlewareSession;
    }

    if (cookieValue.startsWith(`${SEALED_COOKIE_VERSION}.`)) {
      return openSealedSessionCookie(cookieValue);
    }
  } catch (error) {
    console.error("Error opening auth0_session cookie:", error);
  }

  return null;
}

function hasValidSession(session: MiddlewareSession | null): boolean {
  return !!(
    session?.user?.accessToken &&
    session.user.id &&
    (!session.user.accessTokenExpires ||
      Date.now() < session.user.accessTokenExpires)
  );
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
const publicRoutes = [
  "/",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/about",
  "/contact",
  "/pricing",
  "/features",
  "/api/auth",
  "/_next",
  "/favicon.ico",
];

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
    pathname.startsWith("/api/auth")
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
  // Cookies written by app/lib/auth0/session-cookie.ts are AES-GCM sealed as
  // v1.<iv>.<tag>.<ciphertext>; older deployments may still have plain JSON.
  const auth0SessionCookie = request.cookies.get(AUTH0_SESSION_COOKIE)?.value;
  const sessionData = await readSessionCookie(auth0SessionCookie);
  let isAuthenticated = hasValidSession(sessionData);

  if (
    !isAuthenticated &&
    request.headers.get("authorization")?.toLowerCase().startsWith("bearer ")
  ) {
    isAuthenticated = true;
  }

  // Handle protected routes
  if (isProtectedRoute || isProtectedApiRoute) {
    if (!isAuthenticated) {
      // Store the original URL for redirect after login
      const baseUrl =
        process.env.AUTH0_BASE_URL ||
        process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
        process.env.APP_BASE_URL ||
        "https://pcms.live";
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
    const redirectUrl =
      request.nextUrl.searchParams.get("redirect") || "/dashboard";
    const baseUrl =
      process.env.AUTH0_BASE_URL ||
      process.env.NEXT_PUBLIC_AUTH0_BASE_URL ||
      process.env.APP_BASE_URL ||
      "https://pcms.live";
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
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
