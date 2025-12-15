// instrumentation.ts
// Next.js instrumentation file for global error handling and startup tasks
// This file runs once when the Node.js server starts

// Error codes that should not crash the process (network errors, transient issues)
const NON_FATAL_ERROR_CODES = new Set([
  'ETIMEDOUT',      // Connection timeout
  'ECONNREFUSED',   // Connection refused
  'ECONNRESET',     // Connection reset
  'ENOTFOUND',      // DNS lookup failed
  'ENETUNREACH',    // Network unreachable
  'EHOSTUNREACH',   // Host unreachable
  'EPIPE',          // Broken pipe
  'EAI_AGAIN',      // DNS lookup timeout
]);

// Known harmless error patterns that should be ignored (path-based)
const IGNORED_ERROR_PATTERNS = [
  // Device file access errors (like /dev/lrt) that don't affect functionality
  { code: 'EACCES', pathPrefix: '/dev/' },
  { code: 'ENOENT', pathPrefix: '/dev/' },
  // Double-slash paths that appear to be malformed (like //lrt)
  { code: 'EACCES', pathPrefix: '//' },
  { code: 'ENOENT', pathPrefix: '//' },
];

// Additional patterns to match specific known harmless paths
const IGNORED_PATH_PATTERNS = [
  /^\/+lrt$/i,  // Matches /lrt, //lrt, etc.
  /^\/dev\//,   // Matches /dev/* paths
];

function shouldIgnoreError(error: NodeJS.ErrnoException): boolean {
  const errorCode = error.code;
  const errorPath = error.path;
  
  // Check if this is a non-fatal network error
  if (errorCode && NON_FATAL_ERROR_CODES.has(errorCode)) {
    return true;
  }
  
  // Check path-based patterns
  if (errorPath) {
    // Check if path matches any known harmless path patterns
    const isIgnoredPath = IGNORED_PATH_PATTERNS.some(pattern => pattern.test(errorPath));
    if (isIgnoredPath) {
      return true;
    }
    
    // Check if error matches known harmless error patterns
    if (errorCode) {
      const matchesPattern = IGNORED_ERROR_PATTERNS.some(
        pattern => pattern.code === errorCode && errorPath.startsWith(pattern.pathPrefix)
      );
      if (matchesPattern) {
        return true;
      }
    }
  }
  
  return false;
}

export async function register() {
  // Only run on the server (not in Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Handle uncaught exceptions to prevent crashes from transient errors
    process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
      // Check if this is a known harmless error
      if (shouldIgnoreError(error)) {
        console.warn(`[instrumentation] Ignoring known harmless error:`, {
          code: error.code,
          path: error.path,
          message: error.message,
        });
        return; // Don't crash the process
      }

      // Log the error with full details
      console.error('[instrumentation] Uncaught Exception:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        // Include additional properties if present (like errno, code, syscall for fs errors)
        ...(error.code && { code: error.code }),
        ...(error.errno && { errno: error.errno }),
        ...(error.syscall && { syscall: error.syscall }),
        ...(error.path && { path: error.path }),
      });

      // For production, log but allow the process to continue for non-critical errors
      if (process.env.NODE_ENV === 'production') {
        console.error('[instrumentation] Production: Error logged, process continuing');
        // Optionally send to error monitoring service here
        // Example: Sentry.captureException(error);
      }
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      console.error('[instrumentation] Unhandled Rejection at:', promise, 'reason:', reason);
      
      // In production, log but don't crash
      if (process.env.NODE_ENV === 'production') {
        console.error('[instrumentation] Production: Continuing despite unhandled rejection');
      }
    });

    console.log('[instrumentation] ✅ Global error handlers registered');
  }
}
