'use client';

import { ReactNode } from 'react';
import { SWRConfig } from 'swr';

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
        errorRetryCount: 3, // Retry up to 3 times on error
        errorRetryInterval: 5000, // Wait 5 seconds between retries
        shouldRetryOnError: true,
        
        // ✅ PERFORMANCE: Keep previous data while revalidating
        keepPreviousData: true,
        
        // Default fetcher with credentials
        fetcher: (url: string) => 
          fetch(url, { 
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            }
          }).then(res => {
            if (!res.ok) throw new Error('API request failed');
            return res.json();
          }),
        
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

