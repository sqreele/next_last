'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Wifi, Loader2 } from 'lucide-react';
import { cn } from '@/app/lib/utils/cn';
import { useOfflineQueue } from '@/app/lib/hooks/useOfflineQueue';
import { useT } from '@/app/lib/i18n/LocaleProvider';

/**
 * Slim sticky banner that surfaces network state plus any work queued
 * locally while offline so technicians on flaky hotel Wi-Fi know whether
 * their next mutation will round-trip — and whether earlier mutations have
 * caught up. Silent on the happy path.
 */
export function NetworkStatusBanner() {
  const t = useT();
  const [online, setOnline] = useState(true);
  const [recentlyRecovered, setRecentlyRecovered] = useState(false);
  const { count, drain, isDraining } = useOfflineQueue();

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

  const hasQueuedWork = count > 0;
  if (online && !recentlyRecovered && !hasQueuedWork) return null;

  // Compose status + tone. Queued items take priority over "back online"
  // because the user cares more about whether their work has actually
  // landed than about transient connection state.
  let tone: 'offline' | 'online' | 'syncing' = 'online';
  if (!online) tone = 'offline';
  else if (hasQueuedWork) tone = 'syncing';

  const toneClass =
    tone === 'offline' ? 'bg-rose-600' : tone === 'syncing' ? 'bg-amber-500' : 'bg-emerald-600';

  const Icon =
    tone === 'offline' ? WifiOff : tone === 'syncing' ? Loader2 : Wifi;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'sticky top-0 z-[70] flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-semibold text-white shadow-sm',
        toneClass,
      )}
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
    >
      <span className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5', tone === 'syncing' && isDraining && 'animate-spin')} />
        {tone === 'offline' && (
          <>
            {t('network.offline')}
            {hasQueuedWork && ` (${count})`}
          </>
        )}
        {tone === 'syncing' && (
          <>
            {isDraining
              ? `${t('network.syncing')} (${count})`
              : `${count} · ${t('network.queuedSync')}`}
          </>
        )}
        {tone === 'online' && !hasQueuedWork && t('network.online')}
      </span>
      {tone === 'syncing' && !isDraining && (
        <button
          type="button"
          onClick={() => drain().catch(() => undefined)}
          className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider hover:bg-white/30"
        >
          {t('network.retryNow')}
        </button>
      )}
    </div>
  );
}
