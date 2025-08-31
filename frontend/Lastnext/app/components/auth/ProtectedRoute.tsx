'use client';

import React, { ReactNode } from 'react';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import { Loader2, Shield, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
  fallback?: ReactNode;
  showLoadingSpinner?: boolean;
  onUnauthorized?: () => void;
}

interface LoadingFallbackProps {
  message?: string;
}

const LoadingFallback: React.FC<LoadingFallbackProps> = ({ message = 'Loading...' }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
    <Card className="max-w-md w-full">
      <CardContent className="p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-gray-900">Loading</h1>
          <p className="text-gray-600">{message}</p>
        </div>
      </CardContent>
    </Card>
  </div>
);

interface UnauthorizedFallbackProps {
  onRetry?: () => void;
  redirectTo?: string;
}

const UnauthorizedFallback: React.FC<UnauthorizedFallbackProps> = ({ onRetry, redirectTo = '/auth/login' }) => (
  <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
    <Card className="max-w-md w-full">
      <CardContent className="p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <Shield className="w-10 h-10 text-red-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
          <p className="text-gray-600">You need to be logged in to access this page.</p>
        </div>
        <div className="flex flex-col gap-3">
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="w-full">
              Try Again
            </Button>
          )}
          <Button asChild className="w-full">
            <a href={redirectTo}>Go to Login</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
);

interface ErrorFallbackProps {
  error: Error;
  onRetry?: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onRetry }) => (
  <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
    <Card className="max-w-md w-full">
      <CardContent className="p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-10 h-10 text-red-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Authentication Error</h1>
          <p className="text-gray-600">{error.message || 'An error occurred during authentication.'}</p>
        </div>
        <div className="flex flex-col gap-3">
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="w-full">
              Try Again
            </Button>
          )}
          <Button asChild className="w-full">
            <a href="/auth/login">Go to Login</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
);

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  redirectTo = '/auth/login',
  fallback,
  showLoadingSpinner = true,
  onUnauthorized,
}) => {
  const {
    isAuthenticated,
    isLoading,
    user,
    accessToken,
    redirectToLogin,
  } = useSessionGuard({
    redirectTo,
    requireAuth,
    onUnauthorized,
    showToast: true,
  });

  // If authentication is not required, render children directly
  if (!requireAuth) {
    return <>{children}</>;
  }

  // Show loading state
  if (isLoading) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    if (showLoadingSpinner) {
      return <LoadingFallback message="Checking authentication..." />;
    }
    
    return null;
  }

  // Show unauthorized state
  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <UnauthorizedFallback
        onRetry={() => window.location.reload()}
        redirectTo={redirectTo}
      />
    );
  }

  // User is authenticated, render children
  return <>{children}</>;
};

// Higher-order component for easier usage
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<ProtectedRouteProps, 'children'> = {}
) {
  const WrappedComponent = (props: P) => (
    <ProtectedRoute {...options}>
      <Component {...props} />
    </ProtectedRoute>
  );

  WrappedComponent.displayName = `withAuth(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// Export default component
export default ProtectedRoute;
