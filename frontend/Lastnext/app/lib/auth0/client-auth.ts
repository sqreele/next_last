'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect, useState } from 'react';
import type { UserProfile } from '@/app/lib/types';

type ClientAuthUser = Partial<UserProfile> & {
  id: string;
  username: string;
};

export function useClientAuth0() {
  const auth0User = useUser();
  const [user, setUser] = useState<ClientAuthUser | null>(null);

  useEffect(() => {
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
    } else if (!auth0User.isLoading) {
      setUser(null);
    }
  }, [auth0User]);

  return {
    isLoading: auth0User.isLoading,
    error: auth0User.error,
    user,
    isAuthenticated: !!user
  };
}
