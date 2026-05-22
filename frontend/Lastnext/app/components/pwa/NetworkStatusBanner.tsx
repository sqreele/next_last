'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/app/lib/utils/cn';

/**
 * Slim sticky banner that surfaces network state so technicians on flaky hotel
 * Wi-Fi know whether their next mutation will round-trip. Only renders when
 * something interesting changed — silent on the happy path.
 */
export function NetworkStatusBanner() {
  const [online, setOnline] = useState(true);
  const [recentlyRecovered, setRecentlyRecovered] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOnline(navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      setRecentlyRecovered(true);
      window.setTimeout(() => setRecentlyRecovered(false), 4000);
    };
    const handleOffline = () => {
      setOnline(false);
      setRecentlyRecovered(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online && !recentlyRecovered) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'sticky top-0 z-[70] flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold text-white shadow-sm',
        online ? 'bg-emerald-600' : 'bg-rose-600',
      )}
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span>
        {online
          ? 'Back online — syncing latest jobs.'
          : 'Offline — changes will retry when you reconnect.'}
      </span>
    </div>
  );
}
