// app/lib/config.ts
export const API_CONFIG = {
  // ✅ Use server-side vs client-side detection with proper Docker networking
  baseUrl: (() => {
    // Server-side: use internal docker networking to avoid SSL issues
    if (typeof window === 'undefined') {
      // Use NEXT_PRIVATE_API_URL for server-side requests (Docker networking)
      // Fallback to backend:8000 for production
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
    // Client-side: always use localhost:8000 for development to avoid Docker hostname issues
    if (typeof window !== 'undefined') {
      return "http://localhost:8000";
    }
    // Server-side: use NEXT_PUBLIC_MEDIA_URL or fallback to pcms.live
    return process.env.NEXT_PUBLIC_MEDIA_URL || "https://pcms.live";
  })(),
};

export const AUTH_CONFIG = {
  sessionMaxAge: 30 * 24 * 60 * 60, // 30 days
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
  signIn: '/auth/signin',
  signOut: '/auth/signout',
  error: '/auth/error',
  dashboard: '/dashboard',
  register: '/auth/register',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
} as const;

// ✅ Add debug configuration (NODE_ENV is still available at runtime)
export const DEBUG_CONFIG = {
  logApiCalls: process.env.NODE_ENV === 'development',
  logAuth: true, // Always log auth for now
  logSessions: true,
};
