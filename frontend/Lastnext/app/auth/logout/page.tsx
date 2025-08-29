'use client';

import { useEffect } from 'react';

export default function LogoutPage() {
  useEffect(() => {
    window.location.replace('/api/auth/logout');
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Logging out...</p>
    </div>
  );
}

