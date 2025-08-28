'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/app/lib/session.client';

export default function ProfileRedirect() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      // User is logged in, redirect to profile
      console.log('🔍 ProfileRedirect: User authenticated, redirecting to /profile');
      router.push('/profile');
    } else if (status === 'unauthenticated') {
      // User is not logged in, redirect to login
      console.log('🔍 ProfileRedirect: User not authenticated, redirecting to /auth/login');
      router.push('/auth/login');
    }
  }, [session, status, router]);

  // Show loading while checking authentication
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return null;
}
