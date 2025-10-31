import { useState, useEffect } from 'react';
import { useSession } from '@/app/lib/session.client';
import { Property } from '@/app/lib/types';
import { logger } from '@/app/lib/utils/logger';

export interface DetailedUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  positions: string;
  profile_image: string | null;
  properties: Property[];
  created_at: string;
}

export function useDetailedUsers() {
  const [users, setUsers] = useState<DetailedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();

  const fetchUsers = async () => {
    if (!session?.user?.accessToken) {
      setUsers([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      logger.debug('Fetching detailed users from /api/users/detailed/', {
        hasToken: !!session.user.accessToken
      });
      
      const response = await fetch('/api/users/detailed/', {
        headers: {
          'Authorization': `Bearer ${session.user.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      logger.api('GET', '/api/users/detailed/', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Error fetching users', new Error(errorText), {
          status: response.status,
          statusText: response.statusText
        });
        throw new Error(`Failed to fetch users: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.debug('Received users data', { count: data.length });
      setUsers(data);
    } catch (err) {
      logger.error('Error fetching detailed users', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [session?.user?.accessToken]);

  return {
    users,
    loading,
    error,
    refetch: fetchUsers
  };
}
