'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to Auth0 login
    router.push('/api/auth/login');
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-sm"
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
        <Loader className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
      </div>
      <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
        Redirecting to sign in, please wait…
      </p>
    </div>
  );
}
