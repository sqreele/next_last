'use client';

import React, { useEffect, useState } from 'react';
import {
  Plus,
  CheckCircle2,
  Camera,
  MessageSquare,
  Activity,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Image from 'next/image';
import { fixImageUrl } from '@/app/lib/utils/image-utils';
import { useSession } from '@/app/lib/session.client';
import { fetchWithToken } from '@/app/lib/data.server';
import { Button } from '@/app/components/ui/button';
import { StatusBadge } from '@/app/components/pcms-ui';
import { cn } from '@/app/lib/utils/cn';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://pcms.live');

type AuditEventKind = 'created' | 'completed' | 'photo_uploaded' | 'comment' | 'status_change';

interface AuditEvent {
  kind: AuditEventKind;
  at: string | null;
  actor: string;
  message: string;
  note?: string | null;
  new_status?: string;
  image_url?: string | null;
}

interface AuditLogResponse {
  job_id: string;
  count: number;
  events: AuditEvent[];
}

interface JobAuditTimelineProps {
  jobId: string;
  className?: string;
}

const KIND_META: Record<AuditEventKind, { label: string; ring: string; icon: string }> = {
  created: { label: 'Created', ring: 'ring-blue-100', icon: 'bg-blue-600 text-white' },
  completed: { label: 'Completed', ring: 'ring-emerald-100', icon: 'bg-emerald-600 text-white' },
  photo_uploaded: { label: 'Photo', ring: 'ring-amber-100', icon: 'bg-amber-500 text-white' },
  comment: { label: 'Comment', ring: 'ring-slate-100', icon: 'bg-slate-700 text-white' },
  status_change: { label: 'Status', ring: 'ring-indigo-100', icon: 'bg-indigo-600 text-white' },
};

function KindIcon({ kind }: { kind: AuditEventKind }) {
  switch (kind) {
    case 'created':
      return <Plus className="h-4 w-4" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4" />;
    case 'photo_uploaded':
      return <Camera className="h-4 w-4" />;
    case 'comment':
      return <MessageSquare className="h-4 w-4" />;
    case 'status_change':
      return <Activity className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
}

function formatTime(at: string | null): string {
  if (!at) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function JobAuditTimeline({ jobId, className }: JobAuditTimelineProps) {
  const { data: session } = useSession();
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const token = session?.user?.accessToken;
    if (!token) {
      setLoading(false);
      setError('Sign in to view the audit log.');
      return;
    }
    setLoading(true);
    setError(null);
    fetchWithToken<AuditLogResponse>(
      `${API_BASE_URL}/api/v1/jobs/${jobId}/audit-log/`,
      token,
    )
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load audit log');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, session?.user?.accessToken, tick]);

  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5',
        className,
      )}
      aria-label="Job audit log"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">Audit log</h2>
            <p className="text-xs font-medium text-slate-500">
              Derived from creation, status changes, photos, and comments.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setTick((n) => n + 1)}
          disabled={loading}
          className="h-9"
        >
          <RefreshCw className={cn('mr-1 h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {loading && !data && (
        <div className="flex items-center gap-2 px-1 py-4 text-sm font-medium text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading audit log...
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
          {error}
        </div>
      )}

      {data && data.events.length === 0 && !loading && (
        <p className="px-1 py-4 text-center text-sm font-medium text-slate-500">
          No activity recorded yet.
        </p>
      )}

      {data && data.events.length > 0 && (
        <ol className="relative space-y-2 before:absolute before:left-[1.125rem] before:top-1 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200">
          {data.events.map((event, index) => {
            const meta = KIND_META[event.kind];
            return (
              <li key={`${event.kind}-${event.at}-${index}`} className="relative pl-12">
                <span
                  className={cn(
                    'absolute left-2 top-1.5 grid h-9 w-9 place-items-center rounded-full text-white ring-4 ring-white shadow',
                    meta?.icon || 'bg-slate-700 text-white',
                  )}
                  aria-hidden="true"
                >
                  <KindIcon kind={event.kind} />
                </span>
                <div className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{event.message}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        by {event.actor || 'unknown'} · {formatTime(event.at)}
                      </p>
                    </div>
                    {event.new_status && (
                      <StatusBadge size="sm" status={event.new_status} />
                    )}
                  </div>
                  {event.note && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      {event.note}
                    </p>
                  )}
                  {event.kind === 'photo_uploaded' && event.image_url && (
                    <div className="mt-2 relative aspect-video w-full max-w-xs overflow-hidden rounded-lg border border-slate-200">
                      <Image
                        src={fixImageUrl(event.image_url) || event.image_url}
                        alt="Audit photo"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 320px"
                        unoptimized={(event.image_url || '').startsWith('http')}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
