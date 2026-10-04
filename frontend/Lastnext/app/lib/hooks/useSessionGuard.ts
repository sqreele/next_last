import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../session.client';
import { useToast } from './use-toast';
import { expireSession } from '@/app/lib/logout';

interface UseSessionGuardOptions {
  redirectTo?: string;
  requireAuth?: boolean;
  onUnauthorized?: () => void;
  showToast?: boolean;
}

interface UseSessionGuardReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  redirectToLogin: () => void;
}

export function useSessionGuard(options: UseSessionGuardOptions = {}): UseSessionGuardReturn {
  const {
    redirectTo = '/auth/login',
    requireAuth = true,
    onUnauthorized,
    showToast = true,
  } = options;

  const { data: session, status, error: sessionError } = useSession();
  const { toast } = useToast();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const isAuthenticated = status === 'authenticated' && !!session?.user;
  const isLoading = status === 'loading' || isRedirecting;
  const user = session?.user;

  const redirectToLogin = useCallback(() => {
    if (isRedirecting) return;
    
    setIsRedirecting(true);
    
    // Preserve the current page so Login/Auth0 can return the user after a
    // successful sign-in. expireSession clears the stale httpOnly cookie.
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath !== '/auth/login') {
        sessionStorage.setItem('redirectAfterLogin', currentPath);
      }

      void expireSession(currentPath).catch((error) => {
        console.error('Failed to terminate expired session:', error);
        const loginUrl = `${redirectTo}?message=session_expired&redirect=${encodeURIComponent(currentPath)}`;
        window.location.replace(loginUrl);
      });
    }
    
    // Show toast message
    if (showToast) {
      toast.error('Please log in to continue');
    }
    
  }, [isRedirecting, redirectTo, showToast, toast]);

  useEffect(() => {
    // If session is still loading, wait
    if (status === 'loading') return;

    // Session lookup errors and missing users both terminate stale sessions.
    if (requireAuth && sessionError) {
      console.error('Session error:', sessionError);

      if (showToast) {
        toast.error('Your session has expired. Please log in again.');
      }

      redirectToLogin();
      return;
    }

    // If authentication is required and user is not authenticated
    if (requireAuth && !isAuthenticated) {
      // Call custom unauthorized handler if provided
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        redirectToLogin();
      }
    }

  }, [status, isAuthenticated, sessionError, requireAuth, onUnauthorized, showToast, toast, redirectToLogin]);

  return {
    isAuthenticated,
    isLoading,
    user,
    redirectToLogin,
  };
}
