'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  redirectToLogin?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AuthErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Check if it's an authentication error
    if (this.isAuthError(error)) {
      this.handleAuthError(error);
    }
  }

  private isAuthError(error: Error): boolean {
    const authErrorKeywords = [
      'unauthorized',
      'unauthenticated',
      'authentication',
      'token',
      'session',
      'login',
      '401',
      '403',
      'forbidden',
    ];

    const errorMessage = error.message.toLowerCase();
    const errorStack = error.stack?.toLowerCase() || '';

    return authErrorKeywords.some(keyword => 
      errorMessage.includes(keyword) || errorStack.includes(keyword)
    );
  }

  private handleAuthError(error: Error) {
    // Store the current page for redirect after login
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath !== '/auth/login') {
        sessionStorage.setItem('redirectAfterLogin', currentPath);
      }
    }

    // Redirect to login if enabled
    if (this.props.redirectToLogin !== false) {
      setTimeout(() => {
        window.location.href = '/auth/login';
      }, 2000); // Give user time to see the error
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleGoToLogin = () => {
    window.location.href = '/auth/login';
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Show custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isAuthError = this.state.error && this.isAuthError(this.state.error);

      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
              
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-gray-900">
                  {isAuthError ? 'Authentication Error' : 'Something Went Wrong'}
                </h1>
                <p className="text-gray-600">
                  {isAuthError 
                    ? 'Your session may have expired or you need to log in again.'
                    : 'An unexpected error occurred. Please try again.'
                  }
                </p>
                {this.state.error && (
                  <details className="text-left">
                    <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                      Error Details
                    </summary>
                    <div className="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-600 font-mono">
                      {this.state.error.message}
                    </div>
                  </details>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {isAuthError ? (
                  <>
                    <Button onClick={this.handleGoToLogin} className="w-full">
                      <LogIn className="w-4 h-4 mr-2" />
                      Go to Login
                    </Button>
                    <Button onClick={this.handleRefresh} variant="outline" className="w-full">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh Page
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={this.handleRetry} className="w-full">
                      Try Again
                    </Button>
                    <Button onClick={this.handleRefresh} variant="outline" className="w-full">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh Page
                    </Button>
                  </>
                )}
              </div>

              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details className="text-left w-full">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    Stack Trace (Development)
                  </summary>
                  <div className="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-600 font-mono overflow-auto max-h-40">
                    {this.state.errorInfo.componentStack}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook-based error boundary for functional components
export function useAuthErrorHandler() {
  const router = useRouter();

  const handleAuthError = React.useCallback((error: Error) => {
    if (error.message.toLowerCase().includes('unauthorized') || 
        error.message.toLowerCase().includes('authentication')) {
      
      // Store current page for redirect after login
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/auth/login') {
          sessionStorage.setItem('redirectAfterLogin', currentPath);
        }
      }

      // Redirect to login
      router.push('/auth/login');
    }
  }, [router]);

  return { handleAuthError };
}

export default AuthErrorBoundary;
