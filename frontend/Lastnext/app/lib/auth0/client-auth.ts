'use client';

import { useEffect, useState } from 'react';

// Try to import Auth0 hooks, but fall back gracefully if they fail
let useUser: any = null;

try {
  const auth0 = require('@auth0/nextjs-auth0');
  useUser = auth0.useUser;
} catch (error) {
}

export function useClientAuth0() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  // Call useUser at the top level if available
  const auth0User = useUser ? useUser() : null;

  useEffect(() => {
    // If Auth0 hooks are available, try to use them
    if (useUser && auth0User) {
      try {
        if (auth0User.user && !auth0User.isLoading) {
          setUser({
                id: auth0User.user.sub || auth0User.user.email || 'user',
                username: auth0User.user.nickname || auth0User.user.name || auth0User.user.email || 'user',
                email: auth0User.user.email,
                profile_image: auth0User.user.picture,
                positions: 'User',
                properties: [],
                created_at: new Date().toISOString(),
          });
          setIsLoading(false);
        } else if (auth0User.isLoading) {
          setIsLoading(true);
        } else {
          setIsLoading(false);
          setUser(null);
        }
        
        if (auth0User.error) {
          setError(auth0User.error);
        }
      } catch (err) {
        console.error('Error using Auth0 hooks:', err);
        // Fall back to mock system
        useMockSystem();
      }
    } else {
      // Auth0 hooks not available, use mock system
      useMockSystem();
    }
  }, [auth0User]);

  // No fallback system - Auth0 only
  const useMockSystem = () => {
    setError(new Error('Auth0 authentication required'));
    setIsLoading(false);
  };

  return {
    isLoading,
    error,
    user,
    isAuthenticated: !!user
  };
}
