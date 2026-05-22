'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js in production. Skipped in dev so HMR is not poisoned by
 * service-worker caching, and skipped entirely when the browser lacks SW
 * support (older iOS Safari in private browsing, embedded webviews, etc).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((error) => {
          console.warn('PCMS service worker registration failed:', error);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}
