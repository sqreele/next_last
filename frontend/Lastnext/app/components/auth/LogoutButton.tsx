'use client';

export default function LogoutButton({ className = '' }: { className?: string }) {
  return (
    <button
      onClick={() => window.location.assign('/auth/logout')}
      className={className}
    >
      Log out
    </button>
  );
}

