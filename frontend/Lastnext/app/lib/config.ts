// app/lib/config.ts
export const API_CONFIG = {
  // ✅ Use server-side vs client-side detection with proper Docker networking
  baseUrl: (() => {
    // Server-side: use internal docker networking to avoid SSL issues
    if (typeof window === 'undefined') {
      // Check if we're in a build context where backend might not be available
      if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PRIVATE_API_URL) {
        // Production build without explicit backend URL - use external URL
        return "https://pcms.live";
      }
      
      // Use NEXT_PRIVATE_API_URL for server-side requests (Docker networking)
      // Fallback to backend:8000 for development Docker environment
      return process.env.NEXT_PRIVATE_API_URL || "http://backend:8000";
    }
    // Client-side: use public URL
    return process.env.NEXT_PUBLIC_API_URL || 
      (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "https://pcms.live");
  })(),
  
  // ✅ Add all missing endpoints - use Django API routes
  endpoints: {
    token: '/api/v1/token/',
    tokenRefresh: '/api/v1/token/refresh/',
    userProfile: '/api/v1/user-profiles/',
    properties: '/api/v1/properties/',
    rooms: '/api/v1/rooms/',
    jobs: '/api/v1/jobs/',
    topics: '/api/v1/topics/',
    machines: '/api/v1/machines/',
    preventiveMaintenance: '/api/v1/preventive-maintenance/',
    authForgotPassword: '/api/v1/auth/password/forgot/',
    authResetPassword: '/api/v1/auth/password/reset/',
    health: '/api/v1/health/',
    csrfToken: '/api/v1/csrf-token/',
  }
};

// Media URLs should use the external domain for browser access
export const MEDIA_CONFIG = {
  baseUrl: (() => {
    // Client-side: use production domain in production, localhost in development
    if (typeof window !== 'undefined') {
      if (process.env.NODE_ENV === 'production') {
        return "https://pcms.live";
      }
      return "http://localhost:8000";
    }
    // Server-side: use NEXT_PUBLIC_MEDIA_URL or fallback to pcms.live
    return process.env.NEXT_PUBLIC_MEDIA_URL || "https://pcms.live";
  })(),
};

export const AUTH_CONFIG = {
  sessionMaxAge: 60 * 24 * 60 * 60, // 60 days
  sessionUpdateAge: 24 * 60 * 60, // 24 hours
  tokenRefreshThreshold: 5 * 60 * 1000, // 5 minutes before expiry
};

export const ERROR_TYPES = {
  SESSION_EXPIRED: 'session_expired',
  ACCESS_DENIED: 'access_denied',
  REFRESH_TOKEN_ERROR: 'RefreshAccessTokenError',
  CREDENTIALS_SIGNIN: 'CredentialsSignin',
  NETWORK_ERROR: 'network_error',
} as const;

export const ROUTES = {
  signIn: '/auth/login',
  signOut: '/auth/logout',
  error: '/auth/error',
  dashboard: '/dashboard',
  register: '/auth/register',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
} as const;

// ✅ Debug configuration
// Keep production logs quiet by default; enable explicitly via env.
const IS_DEV = process.env.NODE_ENV === 'development';
const DEBUG_API_CALLS = process.env.DEBUG_API_CALLS === 'true';
const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true';
const DEBUG_SESSIONS = process.env.DEBUG_SESSIONS === 'true';

export const DEBUG_CONFIG = {
  logApiCalls: IS_DEV || DEBUG_API_CALLS,
  logAuth: IS_DEV || DEBUG_AUTH,
  logSessions: IS_DEV || DEBUG_SESSIONS,
};
