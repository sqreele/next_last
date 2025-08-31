'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LogoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const performLogout = async () => {
      try {
        console.log('🚪 Starting logout process...');
        
        // Get the returnTo parameter from the URL
        const returnTo = searchParams.get('returnTo') || '/';
        console.log('🔍 Return to:', returnTo);
        
        // Instead of calling the API from the page, redirect directly to the logout API
        // This ensures the API handles the logout properly
        const logoutUrl = `/api/auth/logout?returnTo=${encodeURIComponent(returnTo)}`;
        console.log('🔗 Redirecting to logout API:', logoutUrl);
        
        // Redirect to the logout API - this will handle the Auth0 logout and redirect
        window.location.href = logoutUrl;
        
      } catch (error) {
        console.error('❌ Logout error:', error);
        // Fallback: redirect to home
        router.push('/');
      }
    };

    performLogout();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Logging out...
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Please wait while we log you out.
          </p>
        </div>
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LogoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              Loading...
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Please wait while we prepare the logout page.
            </p>
          </div>
          <div className="mt-8 space-y-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          </div>
        </div>
      </div>
    }>
      <LogoutContent />
    </Suspense>
  );
}
