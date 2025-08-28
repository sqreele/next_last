'use client';

import { useEffect, useState } from 'react';

// Try to import Auth0 hooks, but fall back gracefully if they fail
let useUser: any = null;
let getAccessToken: any = null;

try {
  const auth0 = require('@auth0/nextjs-auth0');
  useUser = auth0.useUser;
  getAccessToken = auth0.getAccessToken;
  console.log('✅ Auth0 hooks loaded successfully');
} catch (error) {
  console.log('⚠️ Auth0 hooks not available, using fallback system');
}

export function useClientAuth0() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  // Call useUser at the top level if available
  const auth0User = useUser ? useUser() : null;

  useEffect(() => {
    // If Auth0 hooks are available, try to use them
    if (useUser && getAccessToken && auth0User) {
      try {
        if (auth0User.user && !auth0User.isLoading) {
          // Get the access token from Auth0
          const getToken = async () => {
            try {
              const token = await getAccessToken();
              setAccessToken(token);
              setUser({
                id: auth0User.user.sub || auth0User.user.email || 'user',
                username: auth0User.user.nickname || auth0User.user.name || auth0User.user.email || 'user',
                email: auth0User.user.email,
                profile_image: auth0User.user.picture,
                positions: 'User',
                properties: [],
                accessToken: token || '',
                refreshToken: '',
                accessTokenExpires: undefined,
                created_at: new Date().toISOString(),
              });
              setIsLoading(false);
            } catch (err) {
              console.error('Failed to get Auth0 access token:', err);
              setError(err);
              setIsLoading(false);
            }
          };
          
          setIsLoading(true);
          getToken();
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

  // Mock system fallback
  const useMockSystem = () => {
    console.log('🔧 Using mock authentication system');
    setUser({
      id: 'dev-user-123',
      username: 'developer',
      email: 'dev@example.com',
      profile_image: null,
      positions: 'Developer',
      properties: [
        {
          id: 1,
          property_id: 'prop-001',
          name: 'Development Property',
          address: '123 Dev St, Dev City',
          property_type: 'residential',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ],
      accessToken: 'dev-access-token',
      refreshToken: 'dev-refresh-token',
      accessTokenExpires: Date.now() + (24 * 60 * 60 * 1000),
      created_at: new Date().toISOString(),
    });
    setAccessToken('dev-access-token');
    setIsLoading(false);
  };

  return {
    accessToken,
    isLoading,
    error,
    user,
    isAuthenticated: !!user
  };
}
