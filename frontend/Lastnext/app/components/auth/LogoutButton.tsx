'use client';

export default function LogoutButton({ className = '' }: { className?: string }) {
  return (
    <button
      onClick={() => window.location.assign('/api/auth/logout')}
      className={className}
    >
      Log out
    </button>
  );
}

