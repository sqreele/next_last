"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { cn } from "@/app/lib/utils/cn";
import { usePullToRefresh } from "@/app/lib/hooks/usePullToRefresh";

interface PullToRefreshProps extends React.HTMLAttributes<HTMLDivElement> {
  onRefresh: () => Promise<void> | void;
  enabled?: boolean;
  threshold?: number;
  /**
   * Optional ref to the actual scrollable container. When provided, PTR only
   * activates when that element is at scrollTop=0.
   */
  scrollTargetRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

export const PullToRefresh = React.forwardRef<
  HTMLDivElement,
  PullToRefreshProps
>(
  (
    {
      onRefresh,
      enabled = true,
      threshold = 70,
      scrollTargetRef,
      className,
      children,
      ...props
    },
    forwardedRef,
  ) => {
    const { ref, pullDistance, isRefreshing } =
      usePullToRefresh<HTMLDivElement>({
        onRefresh,
        enabled,
        threshold,
        scrollTargetRef,
      });

    const setContainerRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        ref.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef, ref],
    );

    const progress = Math.min(1, pullDistance / threshold);
    const indicatorVisible = pullDistance > 6 || isRefreshing;

    return (
      <div ref={setContainerRef} className={cn("relative", className)} {...props}>
        <div
          aria-hidden={!indicatorVisible}
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center",
            "transition-opacity duration-150",
            indicatorVisible ? "opacity-100" : "opacity-0",
          )}
          style={{
            height: `${Math.max(pullDistance, isRefreshing ? threshold : 0)}px`,
          }}
        >
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-soft",
              isRefreshing && "animate-pulse",
            )}
            style={{
              transform: `rotate(${progress * 360}deg)`,
            }}
          >
            <RefreshCw
              className={cn(
                "h-5 w-5 text-blue-600",
                isRefreshing && "animate-spin",
              )}
            />
          </div>
        </div>
        <div
          className="min-h-full"
          style={{
            height: "100%",
            // Even an identity transform creates a containing block for fixed
            // descendants. Keep it off the idle wrapper so viewport-fixed UI
            // (for example the Create Job submit bar) stays fixed to the
            // screen instead of scrolling with this container.
            transform:
              pullDistance > 0
                ? `translateY(${pullDistance}px)`
                : undefined,
            transition:
              pullDistance === 0 || isRefreshing
                ? "transform 200ms ease-out"
                : "none",
          }}
        >
          {children}
        </div>
      </div>
    );
  },
);
PullToRefresh.displayName = "PullToRefresh";
