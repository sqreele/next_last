'use client';

export default function LoginButton({ className = '' }: { className?: string }) {
  return (
    <button
      onClick={() => window.location.assign('/auth/login')}
      className={className}
    >
      Log in
    </button>
  );
}

