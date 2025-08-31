import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../session.client';
import { useToast } from './use-toast';

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
  accessToken: string | null;
  redirectToLogin: () => void;
}

export function useSessionGuard(options: UseSessionGuardOptions = {}): UseSessionGuardReturn {
  const {
    redirectTo = '/auth/login',
    requireAuth = true,
    onUnauthorized,
    showToast = true,
  } = options;

  const router = useRouter();
  const { data: session, status, error: sessionError } = useSession();
  const { toast } = useToast();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const isAuthenticated = !!session?.user?.accessToken;
  const isLoading = status === 'loading' || isRedirecting;
  const user = session?.user;
  const accessToken = session?.user?.accessToken || null;

  const redirectToLogin = () => {
    if (isRedirecting) return;
    
    setIsRedirecting(true);
    
    // Store the current page for redirect after login
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath !== '/auth/login') {
        sessionStorage.setItem('redirectAfterLogin', currentPath);
      }
    }
    
    // Show toast message
    if (showToast) {
      toast.error('Please log in to continue');
    }
    
    // Redirect to login
    router.push(redirectTo);
  };

  useEffect(() => {
    // If session is still loading, wait
    if (status === 'loading') return;

    // If authentication is required and user is not authenticated
    if (requireAuth && !isAuthenticated) {
      // Call custom unauthorized handler if provided
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        redirectToLogin();
      }
    }

    // Handle session errors
    if (sessionError) {
      console.error('Session error:', sessionError);
      
      if (showToast) {
        toast.error('Authentication error. Please try again.');
      }
      
      redirectToLogin();
    }
  }, [status, isAuthenticated, sessionError, requireAuth, onUnauthorized, showToast, toast, redirectToLogin]);

  return {
    isAuthenticated,
    isLoading,
    user,
    accessToken,
    redirectToLogin,
  };
}
