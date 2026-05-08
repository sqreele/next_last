'use client';

import { cn } from '@/app/lib/utils/cn';

export default function LoginButton({ className = '' }: { className?: string }) {
  return (
    <button
      onClick={() => window.location.assign('/auth/login')}
      className={cn('pcms-action-button', className)}
    >
      Log in
    </button>
  );
}
