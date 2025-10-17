'use client'

import useSWR from 'swr';

type SessionCompat = {
  user?: {
    id: string;
    username: string;
    email: string | null;
    profile_image: string | null;
    positions: string;
    properties: any[];
    accessToken: string;
    refreshToken: string;
    accessTokenExpires?: number;
    first_name?: string | null;
    last_name?: string | null;
    created_at: string;
  };
  error?: string;
  expires?: string;
} | null;

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(res => res.json());

export function useCompatSession() {
  const { data, error, isLoading, mutate } = useSWR<SessionCompat>('/api/auth/session-compat', fetcher, {
    // ✅ PERFORMANCE: Optimized session caching
    revalidateOnFocus: false, // Don't revalidate on every focus
    revalidateOnReconnect: true,
    dedupingInterval: 10000, // Dedupe requests within 10 seconds
    focusThrottleInterval: 30000, // Only revalidate focus every 30 seconds
    refreshInterval: 0, // Don't auto-refresh
    revalidateIfStale: true,
    keepPreviousData: true, // Keep previous data while revalidating
  });

  const status: 'loading' | 'authenticated' | 'unauthenticated' = isLoading
    ? 'loading'
    : data?.user
    ? 'authenticated'
    : 'unauthenticated';

  return { data, error, status, refresh: () => mutate() };
}

