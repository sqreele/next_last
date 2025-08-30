'use client';

export default function LogoutButton({ className = '' }: { className?: string }) {
  const handleLogout = async () => {
    try {
      // Call the logout API endpoint
      const response = await fetch('/api/auth/logout');
      
      if (response.ok) {
        // Clear any local state if needed
        console.log('✅ Logout successful');
        
        // The API will redirect to Auth0 logout, so we don't need to redirect here
      } else {
        console.error('❌ Logout failed:', response.status);
        // Fallback: redirect to logout page
        window.location.href = '/auth/logout';
      }
    } catch (error) {
      console.error('❌ Logout error:', error);
      // Fallback: redirect to logout page
      window.location.href = '/auth/logout';
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

