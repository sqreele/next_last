'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createMinLoaderController } from './min-loader-controller.mjs';

export const MIN_LOADER_MS = 400;

/**
 * Returns helpers to enforce a minimum loader display time (avoids flash on fast requests).
 * Save the token returned by recordLoaderShown() when setting loading to true,
 * then pass it to clearLoadingAfterMinTime() in finally/cleanup. Tokens prevent
 * an older request from clearing a newer request's loading state.
 */
export function useMinLoaderTime(
  setLoading: (value: boolean) => void
): {
  recordLoaderShown: () => number;
  clearLoadingAfterMinTime: (generation: number) => void;
} {
  const setLoadingRef = useRef(setLoading);
  setLoadingRef.current = setLoading;
  const controllerRef = useRef<ReturnType<typeof createMinLoaderController> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createMinLoaderController({
      hide: () => setLoadingRef.current(false),
      minDuration: MIN_LOADER_MS,
    });
  }

  const recordLoaderShown = useCallback(
    () => controllerRef.current!.start(),
    [],
  );

  const clearLoadingAfterMinTime = useCallback(
    (generation: number) => controllerRef.current!.finish(generation),
    [],
  );

  useEffect(() => {
    const controller = controllerRef.current!;
    controller.mount();
    return () => controller.dispose();
  }, []);

  return { recordLoaderShown, clearLoadingAfterMinTime };
}
