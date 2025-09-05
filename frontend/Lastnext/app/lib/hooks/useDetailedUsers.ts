import { useState, useEffect } from 'react';
import { useSession } from '@/app/lib/session.client';

export interface DetailedUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  positions: string;
  profile_image: string | null;
  properties: any[];
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
      const response = await fetch('/api/users/detailed/', {
        headers: {
          'Authorization': `Bearer ${session.user.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }

      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching detailed users:', err);
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
