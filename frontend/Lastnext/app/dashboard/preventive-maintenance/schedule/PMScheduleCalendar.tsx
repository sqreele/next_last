'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { useSession } from '@/app/lib/session.client';
import { fetchWithToken } from '@/app/lib/data.server';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/lib/utils/cn';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://pcms.live');

type StatusFilter = 'open' | 'completed' | 'all';

interface PMItem {
  pm_id: string;
  pmtitle?: string;
  scheduled_date?: string;
  completed_date?: string | null;
  status?: string;
  frequency?: string;
  priority?: string;
}

interface DayBucket {
  date: string;
  weekday: string;
  items: PMItem[];
  overdue_count: number;
  open_count: number;
  completed_count: number;
}

interface ScheduleResponse {
  from: string;
  to: string;
  days: DayBucket[];
  total: number;
  status: StatusFilter;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PMScheduleCalendar() {
  const { data: session } = useSession();
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Anchor to start-of-week-monday for a tidy calendar grid; pad to 35 cells.
  const gridStart = useMemo(() => startOfWeekMonday(anchor), [anchor]);
  const gridCells = useMemo(() => {
    const cells: Date[] = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [gridStart, days]);

  useEffect(() => {
    let cancelled = false;
    const token = session?.user?.accessToken;
    if (!token) {
      setLoading(false);
      setError('Sign in to view the PM schedule.');
      return;
    }
    setLoading(true);
    setError(null);
    const from = toISODate(gridStart);
    const url = `${API_BASE_URL}/api/v1/preventive-maintenance/schedule/?from=${from}&days=${days}&status=${statusFilter}`;
    fetchWithToken<ScheduleResponse>(url, token)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load PM schedule.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gridStart, days, statusFilter, session?.user?.accessToken]);

  const dayIndex = useMemo(() => {
    const map = new Map<string, DayBucket>();
    data?.days.forEach((b) => map.set(b.date, b));
    return map;
  }, [data]);

  const selectedBucket = selectedDate ? dayIndex.get(selectedDate) : null;
  const todayKey = toISODate(new Date());
  const windowLabel = `${gridStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${gridCells[gridCells.length - 1]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const totalOpen = useMemo(
    () => (data?.days || []).reduce((sum, b) => sum + b.open_count, 0),
    [data],
  );
  const totalOverdue = useMemo(
    () => (data?.days || []).reduce((sum, b) => sum + b.overdue_count, 0),
    [data],
  );
  const totalCompleted = useMemo(
    () => (data?.days || []).reduce((sum, b) => sum + b.completed_count, 0),
    [data],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-[18px] border border-[var(--pcms-border)] bg-white/90 p-4 shadow-[var(--pcms-shadow-sm)] backdrop-blur sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white shadow">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                PM Calendar
              </h1>
              <p className="text-xs font-medium text-slate-600 sm:text-sm">
                Plan upcoming preventive maintenance across {days} days.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="inline-flex h-10 items-center gap-1 rounded-full bg-[var(--pcms-primary)] px-3 text-sm font-bold text-white hover:bg-[var(--pcms-primary-hover)]"
            >
              <Plus className="h-4 w-4" /> New PM
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                setAnchor(d);
              }}
              className="h-10"
            >
              Today
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(anchor);
                d.setDate(d.getDate() - days);
                setAnchor(d);
              }}
              aria-label="Previous window"
              className="h-10 w-10 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(anchor);
                d.setDate(d.getDate() + days);
                setAnchor(d);
              }}
              aria-label="Next window"
              className="h-10 w-10 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {windowLabel}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {(['open', 'completed', 'all'] as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                aria-pressed={statusFilter === value}
                className={cn(
                  'h-9 rounded-full px-3 text-xs font-bold transition-colors',
                  statusFilter === value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {value === 'all' ? 'All' : value === 'open' ? 'Open' : 'Completed'}
              </button>
            ))}
            <div className="ml-2 flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700">
              <span>Days:</span>
              {[14, 30, 60].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDays(value)}
                  className={cn(
                    'rounded-full px-2 py-0.5 transition-colors',
                    days === value ? 'bg-slate-900 text-white' : 'hover:bg-slate-100',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnchor(new Date(anchor))}
              disabled={loading}
              className="h-9"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs font-bold">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
            Open · {totalOpen}
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
            Overdue · {totalOverdue}
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            Completed · {totalCompleted}
          </div>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="hidden grid-cols-7 gap-1 pb-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:grid">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div
          className={cn(
            'grid gap-1',
            'grid-cols-2 sm:grid-cols-7',
            loading && 'opacity-70',
          )}
        >
          {gridCells.map((date) => {
            const key = toISODate(date);
            const bucket = dayIndex.get(key);
            const isToday = key === todayKey;
            const isSelected = selectedDate === key;
            const inPast = key < todayKey;
            const totalItems = bucket?.items.length || 0;
            const overdue = bucket?.overdue_count || 0;
            const open = bucket?.open_count || 0;
            const completed = bucket?.completed_count || 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(isSelected ? null : key)}
                aria-pressed={isSelected}
                className={cn(
                  'group flex h-24 flex-col items-stretch rounded-xl border-2 p-2 text-left transition-all sm:h-28',
                  isSelected ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300',
                  totalItems === 0 && 'bg-slate-50',
                  overdue > 0 && !isSelected && 'border-rose-300 bg-rose-50/40',
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span
                    className={cn(
                      'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-black',
                      isToday ? 'bg-blue-600 text-white' : inPast ? 'text-slate-500' : 'text-slate-900',
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {date.toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                </div>
                <div className="mt-1 flex flex-1 flex-col gap-0.5 text-[11px] font-bold">
                  {overdue > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                      {overdue} overdue
                    </span>
                  )}
                  {open > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      {open} open
                    </span>
                  )}
                  {completed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      {completed} done
                    </span>
                  )}
                  {totalItems === 0 && !loading && (
                    <span className="text-[10px] font-medium text-slate-400">
                      No PM
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center gap-2 pt-3 text-sm font-medium text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule...
          </div>
        )}
      </section>

      {selectedBucket && (
        <section
          aria-label={`Items on ${selectedDate}`}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                {parseISODate(selectedBucket.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h2>
              <p className="text-xs font-medium text-slate-500">
                {selectedBucket.items.length} item{selectedBucket.items.length === 1 ? '' : 's'} on this day
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(null)}
            >
              Close
            </Button>
          </div>
          {selectedBucket.items.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm font-medium text-slate-500">
              No PM scheduled for this day.
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedBucket.items.map((item) => (
                <li key={item.pm_id}>
                  <Link
                    href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 line-clamp-2">
                        {item.pmtitle || 'Preventive maintenance'}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        #{item.pm_id} · {item.frequency || 'one-off'}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                      Open <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-600">
        <Sparkles className="mr-1 inline h-3 w-3 text-blue-500" />
        Tap any day with items to see what's scheduled. Cells with red borders include overdue work.
      </div>
    </div>
  );
}
