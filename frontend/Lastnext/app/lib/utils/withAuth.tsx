import React from 'react';
import { ProtectedRoute } from '@/app/components/auth/ProtectedRoute';
import { AuthErrorBoundary } from '@/app/components/auth/AuthErrorBoundary';

interface WithAuthOptions {
  requireAuth?: boolean;
  redirectTo?: string;
  showLoadingSpinner?: boolean;
  fallback?: React.ReactNode;
}

/**
 * Higher-order component that wraps a page component with authentication protection
 * @param Component - The page component to wrap
 * @param options - Authentication options
 * @returns Wrapped component with authentication protection
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options: WithAuthOptions = {}
) {
  const {
    requireAuth = true,
    redirectTo = '/auth/login',
    showLoadingSpinner = true,
    fallback,
  } = options;

  const WrappedComponent = (props: P) => (
    <AuthErrorBoundary>
      <ProtectedRoute
        requireAuth={requireAuth}
        redirectTo={redirectTo}
        showLoadingSpinner={showLoadingSpinner}
        fallback={fallback}
      >
        <Component {...props} />
      </ProtectedRoute>
    </AuthErrorBoundary>
  );

  // Set display name for debugging
  WrappedComponent.displayName = `withAuth(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Hook-based authentication wrapper for functional components
 * @param Component - The page component to wrap
 * @param options - Authentication options
 * @returns Wrapped component with authentication protection
 */
export function useAuthWrapper<P extends object>(
  Component: React.ComponentType<P>,
  options: WithAuthOptions = {}
) {
  return withAuth(Component, options);
}

/**
 * Simple authentication wrapper component
 */
export const AuthWrapper: React.FC<{
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
  showLoadingSpinner?: boolean;
  fallback?: React.ReactNode;
}> = ({ children, ...options }) => (
  <AuthErrorBoundary>
    <ProtectedRoute {...options}>
      {children}
    </ProtectedRoute>
  </AuthErrorBoundary>
);

export default withAuth;
