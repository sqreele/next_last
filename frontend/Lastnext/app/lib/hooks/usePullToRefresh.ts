"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { triggerHaptic } from "./useHaptic";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  maxPull?: number;
  enabled?: boolean;
  /**
   * The element that actually scrolls. Defaults to the gesture element itself.
   * When provided, only triggers PTR when that element is scrolled to top.
   */
  scrollTargetRef?: RefObject<HTMLElement | null>;
}

export function usePullToRefresh<T extends HTMLElement>({
  onRefresh,
  threshold = 70,
  maxPull = 140,
  enabled = true,
  scrollTargetRef,
}: UsePullToRefreshOptions) {
  const ref = useRef<T | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const hapticFiredRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const isAtTop = () => {
      const target = scrollTargetRef?.current ?? el;
      return target.scrollTop <= 0;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing) return;
      if (!isAtTop()) {
        startYRef.current = null;
        activeRef.current = false;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      activeRef.current = true;
      hapticFiredRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!activeRef.current || startYRef.current === null || isRefreshing) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }
      if (!isAtTop()) {
        setPullDistance(0);
        activeRef.current = false;
        return;
      }
      const damped = Math.min(maxPull, delta * 0.5);
      setPullDistance(damped);
      if (damped > threshold && !hapticFiredRef.current) {
        triggerHaptic("selection");
        hapticFiredRef.current = true;
      } else if (damped <= threshold && hapticFiredRef.current) {
        hapticFiredRef.current = false;
      }
      if (delta > 4 && e.cancelable) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      if (!activeRef.current) {
        setPullDistance(0);
        return;
      }
      activeRef.current = false;
      const shouldRefresh = pullDistance > threshold;
      if (shouldRefresh && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(threshold);
        triggerHaptic("medium");
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
      startYRef.current = null;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [enabled, isRefreshing, maxPull, onRefresh, pullDistance, threshold, scrollTargetRef]);

  return { ref, pullDistance, isRefreshing, threshold };
}
