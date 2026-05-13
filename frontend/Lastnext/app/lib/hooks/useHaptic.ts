"use client";

import { useCallback } from "react";

export type HapticPattern =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error"
  | "selection";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 8,
  medium: 14,
  heavy: 24,
  success: [10, 30, 14],
  warning: [18, 40, 18],
  error: [22, 50, 22, 50, 22],
  selection: 4,
};

function vibrate(pattern: number | number[]) {
  if (typeof window === "undefined") return;
  const nav = window.navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    // no-op: some browsers throw if user hasn't interacted yet
  }
}

export function useHaptic() {
  return useCallback((pattern: HapticPattern = "light") => {
    vibrate(PATTERNS[pattern]);
  }, []);
}

export function triggerHaptic(pattern: HapticPattern = "light") {
  vibrate(PATTERNS[pattern]);
}
