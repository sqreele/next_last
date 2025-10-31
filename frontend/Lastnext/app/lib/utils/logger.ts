// app/lib/utils/logger.ts
// Centralized logging utility with environment detection
// Works in both client and server environments

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment: boolean;
  private isProduction: boolean;
  private isServerSide: boolean;

  constructor() {
    // Works in both server and client environments
    this.isServerSide = typeof window === 'undefined';
    this.isDevelopment = 
      (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') ||
      (typeof window !== 'undefined' && (window as any).__DEV__ === true);
    this.isProduction = 
      (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') ||
      (!this.isDevelopment && typeof window !== 'undefined');
  }

  /**
   * Debug logs - only in development
   */
  debug(message: string, context?: LogContext | unknown): void {
    if (this.isDevelopment) {
      console.log(`[DEBUG] ${message}`, context || '');
    }
  }

  /**
   * Info logs - always shown
   */
  info(message: string, context?: LogContext | unknown): void {
    console.info(`[INFO] ${message}`, context || '');
  }

  /**
   * Warning logs - always shown
   */
  warn(message: string, context?: LogContext | unknown): void {
    console.warn(`[WARN] ${message}`, context || '');
  }

  /**
   * Error logs - always shown, can be sent to error tracking in production
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorInfo = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : error;

    console.error(`[ERROR] ${message}`, errorInfo || '', context || '');

    // In production, you can send to error tracking service here
    // Example: Sentry.captureException(error, { extra: context });
  }

  /**
   * Log API requests/responses (debug level)
   */
  api(method: string, url: string, status?: number, context?: LogContext): void {
    if (this.isDevelopment) {
      const statusText = status ? `[${status}]` : '';
      console.log(`[API] ${method.toUpperCase()} ${url} ${statusText}`, context || '');
    }
  }

  /**
   * Group related logs together (dev only)
   */
  group(label: string): void {
    if (this.isDevelopment) {
      console.group(label);
    }
  }

  groupEnd(): void {
    if (this.isDevelopment) {
      console.groupEnd();
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for use in other files
export type { LogLevel, LogContext };

