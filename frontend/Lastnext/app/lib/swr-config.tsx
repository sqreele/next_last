'use client';

import { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { fetchWithTimeout, RequestTimeoutError } from '@/app/lib/fetch-with-timeout.mjs';

class ApiResponseError extends Error {
  constructor(readonly status: number) {
    super(`API request failed (${status}).`);
    this.name = 'ApiResponseError';
  }
}

async function fetchJson(url: string) {
  return fetchWithTimeout(
    url,
    {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    },
    undefined,
    async (response) => {
      if (!response.ok) throw new ApiResponseError(response.status);
      return response.json();
    },
  );
}

// ✅ PERFORMANCE: Global SWR configuration for optimized caching
export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        // ✅ PERFORMANCE: Enable aggressive caching
        revalidateOnFocus: false, // Don't revalidate on window focus by default
        revalidateOnReconnect: true, // Revalidate when browser reconnects
        revalidateIfStale: true, // Revalidate stale data
        dedupingInterval: 5000, // Dedupe requests within 5 seconds
        
        // ✅ PERFORMANCE: Longer cache times
        focusThrottleInterval: 10000, // Throttle focus revalidation to 10 seconds
        
        // ✅ PERFORMANCE: Error retry configuration
        errorRetryCount: 1,
        errorRetryInterval: 1000,
        shouldRetryOnError: (error) =>
          error instanceof RequestTimeoutError ||
          !(error instanceof ApiResponseError) ||
          error.status >= 500,
        
        // ✅ PERFORMANCE: Keep previous data while revalidating
        keepPreviousData: true,
        
        // Default fetcher with credentials
        fetcher: fetchJson,
        
        // ✅ PERFORMANCE: Provider for global cache
        provider: () => new Map(),
        
        // ✅ PERFORMANCE: Load data from cache on mount
        fallbackData: undefined,
      }}
    >
      {children}
    </SWRConfig>
  );
}
