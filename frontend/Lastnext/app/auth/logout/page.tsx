'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { appSignOut } from '@/app/lib/logout';
import { BouncingDotsLoader } from '@/app/components/ui/BouncingDotsLoader';

function LogoutContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const performLogout = async () => {
      try {
        
        // Get the returnTo parameter from the URL
        const returnTo = searchParams.get('returnTo') || '/';
        
        await appSignOut({ callbackUrl: returnTo });
        
      } catch (error) {
        console.error('❌ Logout error:', error);
        // Queue clearing failure deliberately leaves this identity in place.
      }
    };

    performLogout();
  }, [searchParams]);

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
            <BouncingDotsLoader size="lg" />
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
              <BouncingDotsLoader size="lg" />
            </div>
          </div>
        </div>
      </div>
    }>
      <LogoutContent />
    </Suspense>
  );
}
