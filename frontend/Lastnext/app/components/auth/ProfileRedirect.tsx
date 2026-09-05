'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/app/lib/session.client';
import { BouncingDotsLoader } from '@/app/components/ui/BouncingDotsLoader';

export default function ProfileRedirect() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      // User is logged in, redirect to profile
      router.push('/dashboard/profile');
    } else if (status === 'unauthenticated') {
      // User is not logged in, redirect to login
      router.push('/auth/login');
    }
  }, [session, status, router]);

  // Show loading while checking authentication
  if (status === 'loading') {
    return (
      <BouncingDotsLoader size="md" label="Loading profile" className="w-full p-8" />
    );
  }

  return null;
}
