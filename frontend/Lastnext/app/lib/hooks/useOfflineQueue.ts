'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/app/lib/session.client';
import {
  type QueuedRequest,
  getQueue,
  replayQueue,
  subscribe,
} from '@/app/lib/offline-queue';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://pcms.live');

interface UseOfflineQueueResult {
  queue: QueuedRequest[];
  count: number;
  /** Manually trigger a drain, e.g. from a banner action. */
  drain: () => Promise<{ delivered: number; remaining: number }>;
  isDraining: boolean;
}

/**
 * Subscribes a component to the offline queue and auto-drains on the
 * `online` event (or when the page regains focus while online). Exposes a
 * manual `drain()` for buttons that say "Retry now".
 */
export function useOfflineQueue(): UseOfflineQueueResult {
  const { data: session } = useSession();
  const [queue, setQueue] = useState<QueuedRequest[]>(() => getQueue());
  const [isDraining, setDraining] = useState(false);
  const accessToken = session?.user?.accessToken;

  useEffect(() => {
    return subscribe(setQueue);
  }, []);

  const drain = useCallback(async () => {
    if (!accessToken || typeof navigator === 'undefined' || !navigator.onLine) {
      return { delivered: 0, remaining: queue.length };
    }
    setDraining(true);
    try {
      return await replayQueue(async (item) => {
        return fetch(`${API_BASE_URL}${item.endpoint}`, {
          method: item.method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item.body),
        });
      });
    } finally {
      setDraining(false);
    }
  }, [accessToken, queue.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (queue.length === 0) return;

    let cancelled = false;
    const attempt = () => {
      if (cancelled) return;
      if (!navigator.onLine) return;
      drain().catch((error) => console.warn('Offline queue drain failed:', error));
    };

    // Try once on mount in case we hydrated with items already.
    attempt();

    const onlineHandler = () => attempt();
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') attempt();
    };
    window.addEventListener('online', onlineHandler);
    document.addEventListener('visibilitychange', visibilityHandler);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onlineHandler);
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [queue.length, drain]);

  return { queue, count: queue.length, drain, isDraining };
}
