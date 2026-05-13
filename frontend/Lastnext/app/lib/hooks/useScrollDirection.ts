"use client";

import { RefObject, useEffect, useState } from "react";

export type ScrollDirection = "up" | "down" | null;

interface UseScrollDirectionOptions {
  threshold?: number;
  initialDirection?: ScrollDirection;
  topOffset?: number;
  /**
   * Element to observe. Defaults to window.
   * Pass a ref pointing to a scrollable container.
   */
  targetRef?: RefObject<HTMLElement | null>;
}

export function useScrollDirection({
  threshold = 6,
  initialDirection = null,
  topOffset = 12,
  targetRef,
}: UseScrollDirectionOptions = {}) {
  const [direction, setDirection] = useState<ScrollDirection>(initialDirection);
  const [isAtTop, setIsAtTop] = useState(true);

  useEffect(() => {
    const target: HTMLElement | Window =
      targetRef?.current ?? (typeof window !== "undefined" ? window : (null as unknown as Window));
    if (!target) return;

    const getY = () =>
      target === window
        ? window.scrollY
        : (target as HTMLElement).scrollTop;

    let lastY = getY();
    let ticking = false;

    const update = () => {
      const y = getY();
      setIsAtTop(y <= topOffset);
      if (Math.abs(y - lastY) >= threshold) {
        setDirection(y > lastY ? "down" : "up");
        lastY = y > 0 ? y : 0;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [threshold, topOffset, targetRef]);

  return { direction, isAtTop };
}
