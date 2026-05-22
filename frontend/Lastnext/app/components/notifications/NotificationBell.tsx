'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  ArrowRight,
  X,
} from 'lucide-react';
import { useSession } from '@/app/lib/session.client';
import { fetchWithToken } from '@/app/lib/data.server';
import { Button } from '@/app/components/ui/button';
import { useT } from '@/app/lib/i18n/LocaleProvider';
import { cn } from '@/app/lib/utils/cn';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://pcms.live');

const POLL_INTERVAL_MS = 60_000;
const READ_KEY = 'pcms-notifications-read';

interface PMNotification {
  pm_id: string;
  pmtitle?: string;
  scheduled_date?: string;
  completed_date?: string | null;
  status?: string;
  priority?: string;
}

interface NotificationsResponse {
  overdue_count: number;
  upcoming_count: number;
  total_count: number;
  days: number;
  results: PMNotification[];
}

interface NotificationBellProps {
  /** Force a particular trigger styling on mobile vs desktop. */
  variant?: 'compact' | 'full';
  className?: string;
}

function loadReadSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const parsed: string[] = JSON.parse(raw);
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function saveReadSet(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore quota errors
  }
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '';
  const diff = target - Date.now();
  const absMinutes = Math.abs(Math.round(diff / 60000));
  const tense = diff >= 0 ? 'in ' : '';
  const suffix = diff >= 0 ? '' : ' ago';
  if (absMinutes < 60) return `${tense}${absMinutes}m${suffix}`;
  const hours = Math.round(absMinutes / 60);
  if (hours < 24) return `${tense}${hours}h${suffix}`;
  const days = Math.round(hours / 24);
  return `${tense}${days}d${suffix}`;
}

function classify(notification: PMNotification): 'overdue' | 'today' | 'upcoming' | 'completed' {
  if (notification.completed_date) return 'completed';
  if (!notification.scheduled_date) return 'upcoming';
  const scheduled = new Date(notification.scheduled_date).getTime();
  if (Number.isNaN(scheduled)) return 'upcoming';
  if (scheduled < Date.now()) return 'overdue';
  const dayMs = 24 * 60 * 60 * 1000;
  if (scheduled - Date.now() <= dayMs) return 'today';
  return 'upcoming';
}

const KIND_STYLES = {
  overdue: { bg: 'bg-rose-100 text-rose-700', icon: AlertTriangle, label: 'Overdue' },
  today: { bg: 'bg-amber-100 text-amber-800', icon: CalendarClock, label: 'Due today' },
  upcoming: { bg: 'bg-blue-100 text-blue-800', icon: CalendarClock, label: 'Upcoming' },
  completed: { bg: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2, label: 'Completed' },
} as const;

export function NotificationBell({ variant = 'compact', className }: NotificationBellProps) {
  const { data: session } = useSession();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [readSet, setReadSet] = useState<Set<string>>(() => loadReadSet());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const accessToken = session?.user?.accessToken;

  const fetchNotifications = React.useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetchWithToken<NotificationsResponse>(
        `${API_BASE_URL}/api/v1/notifications/all/?days=7`,
        accessToken,
      );
      setData(res);
    } catch (err) {
      // swallow; the bell stays in its previous state instead of disrupting
      // the rest of the dashboard with a top-level error.
      console.warn('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    fetchNotifications();
    const interval = window.setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [accessToken, fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !data?.results?.length) return;
    // When opened, mark items currently visible as read after a short pause.
    const t = window.setTimeout(() => {
      setReadSet((prev) => {
        const next = new Set(prev);
        data.results.forEach((n) => next.add(n.pm_id));
        saveReadSet(next);
        return next;
      });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [open, data]);

  const unreadCount = useMemo(() => {
    if (!data) return 0;
    return data.results.filter((n) => !readSet.has(n.pm_id)).length;
  }, [data, readSet]);

  const groups = useMemo(() => {
    const out: Record<'overdue' | 'today' | 'upcoming' | 'completed', PMNotification[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      completed: [],
    };
    (data?.results || []).forEach((n) => {
      out[classify(n)].push(n);
    });
    return out;
  }, [data]);

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative h-9 w-9 touch-manipulation',
          variant === 'compact' ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : '',
        )}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">{t('notifications.title')}</p>
              <p className="text-[11px] font-semibold text-slate-500">
                {data
                  ? `${data.overdue_count} ${t('notifications.overdue').toLowerCase()} · ${data.upcoming_count} ${t('notifications.upcoming').toLowerCase()}`
                  : 'Loading…'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-900"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && !data ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm font-medium text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : data && data.results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <p className="text-sm font-bold text-slate-900">{t('notifications.empty')}</p>
                <p className="text-xs font-medium text-slate-500">
                  {t('notifications.emptyHint')}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(['overdue', 'today', 'upcoming', 'completed'] as const).flatMap((kind) =>
                  groups[kind].map((item) => {
                    const styles = KIND_STYLES[kind];
                    const KindIcon = styles.icon;
                    const unread = !readSet.has(item.pm_id);
                    return (
                      <li key={`${kind}-${item.pm_id}`}>
                        <Link
                          href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50',
                            unread && 'bg-blue-50/40',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full',
                              styles.bg,
                            )}
                            aria-hidden="true"
                          >
                            <KindIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-bold text-slate-900 line-clamp-1">
                                {item.pmtitle || 'Preventive maintenance'}
                              </p>
                              {unread && (
                                <span
                                  aria-label="Unread"
                                  className="mt-1.5 h-2 w-2 flex-none rounded-full bg-blue-600"
                                />
                              )}
                            </div>
                            <p className="text-xs font-semibold text-slate-500">
                              #{item.pm_id} · {styles.label} · {relativeTime(item.scheduled_date)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  }),
                )}
              </ul>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setReadSet(() => {
                  const next = new Set<string>((data?.results || []).map((n) => n.pm_id));
                  saveReadSet(next);
                  return next;
                });
              }}
              className="text-slate-700 hover:underline"
              disabled={!data || data.results.length === 0}
            >
              {t('action.markAllRead')}
            </button>
            <Link
              href="/dashboard/preventive-maintenance/schedule"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-blue-700 hover:underline"
            >
              {t('action.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
