'use client';

import { appSignOut } from '@/app/lib/logout';

export default function LogoutButton({ className = '' }: { className?: string }) {
  const handleLogout = async () => {
    try {
      await appSignOut({ callbackUrl: '/auth/login' });
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
  };

  return (
    <button
      onClick={handleLogout}
      className={className}
    >
      Log out
    </button>
  );
}
