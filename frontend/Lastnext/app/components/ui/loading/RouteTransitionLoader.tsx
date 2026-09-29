'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMinLoaderTime } from '@/app/lib/hooks/useMinLoaderTime';

const MAX_ROUTE_LOADING_MS = 4500;

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function isDifferentRoute(url: string | URL | null | undefined) {
  if (!url) return false;

  const nextUrl = new URL(String(url), window.location.href);
  return (
    nextUrl.origin === window.location.origin
    && (nextUrl.pathname !== window.location.pathname || nextUrl.search !== window.location.search)
  );
}

export function RouteTransitionLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const routeKey = `${pathname}${search ? `?${search}` : ''}`;
  const [loading, setLoading] = React.useState(false);
  const activeRef = React.useRef(false);
  const settledRouteRef = React.useRef(routeKey);
  const tokenRef = React.useRef<number | null>(null);
  const timeoutRef = React.useRef<number | null>(null);
  const setLoaderVisible = React.useCallback((visible: boolean) => {
    activeRef.current = visible;
    setLoading(visible);
  }, []);
  const { recordLoaderShown, clearLoadingAfterMinTime } = useMinLoaderTime(setLoaderVisible);

  const finishLoading = React.useCallback((expectedToken?: number) => {
    const token = tokenRef.current;
    if (token === null || (expectedToken !== undefined && expectedToken !== token)) return;

    tokenRef.current = null;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    clearLoadingAfterMinTime(token);
  }, [clearLoadingAfterMinTime]);

  const startLoading = React.useCallback((restart = true) => {
    // A Link click starts the loader before navigation. The History API then
    // fires again when Next commits that same route; do not restart the clock.
    if (!restart && activeRef.current) return;

    setLoaderVisible(true);
    const token = recordLoaderShown();
    tokenRef.current = token;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(
      () => finishLoading(token),
      MAX_ROUTE_LOADING_MS,
    );
  }, [finishLoading, recordLoaderShown, setLoaderVisible]);

  React.useEffect(() => {
    settledRouteRef.current = routeKey;
    finishLoading();
  }, [finishLoading, routeKey]);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isModifiedClick(event)) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      if (!isDifferentRoute(anchor.href)) return;
      startLoading();
    };

    const onPopState = () => {
      const nextRoute = `${window.location.pathname}${window.location.search}`;
      if (nextRoute !== settledRouteRef.current) startLoading();
    };
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    // App Router has no public route-event API. Watching History covers
    // router.push/replace calls that do not originate from an anchor click.
    window.history.pushState = function (...args) {
      if (isDifferentRoute(args[2])) startLoading(false);
      return originalPushState.apply(this, args);
    };
    window.history.replaceState = function (...args) {
      if (isDifferentRoute(args[2])) startLoading(false);
      return originalReplaceState.apply(this, args);
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [startLoading]);

  return (
    <div
      aria-hidden={!loading}
      className="pointer-events-none fixed inset-x-0 top-0 z-[1000] h-1 bg-transparent"
    >
      <div
        className={`h-full origin-left bg-[var(--pcms-accent-gradient)] shadow-[0_0_18px_rgba(6,182,212,0.45)] transition-all duration-300 motion-reduce:transition-none ${
          loading ? 'w-full opacity-100' : 'w-0 opacity-0'
        }`}
      />
    </div>
  );
}
