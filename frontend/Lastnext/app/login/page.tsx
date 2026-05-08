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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[var(--pcms-app-bg)] bg-[image:var(--pcms-app-bg-gradient)] p-6 backdrop-blur-sm"
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white/90 shadow-[var(--pcms-shadow)] ring-1 ring-[var(--pcms-border)]">
        <Loader className="h-9 w-9 animate-spin text-[var(--pcms-primary)]" aria-hidden />
      </div>
      <div className="pcms-section-card max-w-sm p-6 text-center"><p className="pcms-eyebrow">Property Care Maintenance System</p><h1 className="mt-2 text-2xl font-black text-[var(--pcms-text)]">Hotel maintenance sign in</h1><p className="mt-2 text-sm font-semibold text-[var(--pcms-text-muted)]">Redirecting to secure PCMS sign in...</p></div>
    </div>
  );
}
