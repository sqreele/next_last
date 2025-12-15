// instrumentation.ts
// Next.js instrumentation file for global error handling and startup tasks
// This file runs once when the Node.js server starts

// Known harmless error patterns that should be ignored
const IGNORED_ERROR_PATTERNS = [
  // Device file access errors (like /dev/lrt) that don't affect functionality
  { code: 'EACCES', pathPrefix: '/dev/' },
  { code: 'ENOENT', pathPrefix: '/dev/' },
];

function shouldIgnoreError(error: NodeJS.ErrnoException): boolean {
  const errorCode = error.code;
  const errorPath = error.path;
  
  if (!errorCode || !errorPath) {
    return false;
  }
  
  return IGNORED_ERROR_PATTERNS.some(
    pattern => pattern.code === errorCode && errorPath.startsWith(pattern.pathPrefix)
  );
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
