'use client';

import { useCallback, useRef } from 'react';

export const MIN_LOADER_MS = 400;

/**
 * Returns helpers to enforce a minimum loader display time (avoids flash on fast requests).
 * Call recordLoaderShown() when setting loading to true, and clearLoadingAfterMinTime()
 * in finally/cleanup instead of setLoading(false).
 */
export function useMinLoaderTime(
  setLoading: (value: boolean) => void
): {
  recordLoaderShown: () => void;
  clearLoadingAfterMinTime: () => void;
} {
  const loaderShownAtRef = useRef<number | null>(null);

  const recordLoaderShown = useCallback(() => {
    loaderShownAtRef.current = Date.now();
  }, []);

  const clearLoadingAfterMinTime = useCallback(() => {
    const shownAt = loaderShownAtRef.current;
    loaderShownAtRef.current = null;
    if (shownAt == null) {
      setLoading(false);
      return;
    }
    const elapsed = Date.now() - shownAt;
    const remaining = Math.max(0, MIN_LOADER_MS - elapsed);
    if (remaining === 0) {
      setLoading(false);
    } else {
      setTimeout(() => setLoading(false), remaining);
    }
  }, [setLoading]);

  return { recordLoaderShown, clearLoadingAfterMinTime };
}
