import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/app/lib/utils/logger';
import {
  isDetailedUsersAbortError,
  requestDetailedUsers,
  type DetailedUser,
} from '@/app/lib/hooks/detailed-users-request';

export type { DetailedUser } from '@/app/lib/hooks/detailed-users-request';

export type DetailedUsersAvailability =
  | 'idle'
  | 'loading'
  | 'available'
  | 'unavailable'
  | 'error';

interface UseDetailedUsersOptions {
  enabled?: boolean;
  optional?: boolean;
}

export function useDetailedUsers({
  enabled = true,
  optional = false,
}: UseDetailedUsersOptions = {}) {
  const [users, setUsers] = useState<DetailedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<DetailedUsersAvailability>('idle');
  const requestIdRef = useRef(0);

  const fetchUsers = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    if (!enabled) {
      setUsers([]);
      setError(null);
      setLoading(false);
      setAvailability('idle');
      return;
    }

    setLoading(true);
    setError(null);
    setAvailability('loading');

    try {
      logger.debug('Fetching detailed users from /api/users/detailed/', {
        transport: 'bff',
      });

      const result = await requestDetailedUsers({
        optional,
        signal,
      });
      if (result.availability === 'unavailable') {
        if (requestId !== requestIdRef.current || signal?.aborted) return;
        setUsers([]);
        setError(null);
        setAvailability('unavailable');
        return;
      }
      if (requestId !== requestIdRef.current || signal?.aborted) return;
      logger.debug('Received users data', { count: result.users.length });
      setUsers(result.users);
      setAvailability('available');
    } catch (err) {
      if (
        isDetailedUsersAbortError(err) ||
        signal?.aborted ||
        requestId !== requestIdRef.current
      ) {
        return;
      }
      logger.error('Error fetching detailed users', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
      setUsers([]);
      setAvailability('error');
    } finally {
      if (requestId === requestIdRef.current && !signal?.aborted) {
        setLoading(false);
      }
    }
  }, [enabled, optional]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchUsers(controller.signal);
    return () => controller.abort();
  }, [fetchUsers]);

  return {
    users,
    loading,
    error,
    availability,
    refetch: () => fetchUsers(),
  };
}
