'use client';

import React from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Clock,
  Hammer,
  CheckCircle2,
  ShieldAlert,
  Timer,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/app/lib/utils/cn';
import { useT } from '@/app/lib/i18n/LocaleProvider';

export type KpiTone = 'primary' | 'info' | 'warning' | 'success' | 'danger' | 'neutral';

interface KpiInput {
  label: string;
  value: number | string;
  delta?: number | null;
  deltaLabel?: string;
  tone: KpiTone;
  icon: LucideIcon;
  href?: string;
  hint?: string;
}

interface MobileKpiStripProps {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  waitingParts: number;
  completionRate: number;
  /** Week-over-week deltas; positive = up vs previous week. `null` = no comparison available. */
  deltas?: {
    total?: number | null;
    open?: number | null;
    completed?: number | null;
    overdue?: number | null;
  };
  className?: string;
}

const TONE_STYLES: Record<KpiTone, { card: string; icon: string; value: string }> = {
  primary: {
    card: 'border-blue-200 bg-white',
    icon: 'bg-blue-600 text-white',
    value: 'text-blue-900',
  },
  info: {
    card: 'border-sky-200 bg-white',
    icon: 'bg-sky-600 text-white',
    value: 'text-sky-900',
  },
  warning: {
    card: 'border-amber-200 bg-white',
    icon: 'bg-amber-500 text-white',
    value: 'text-amber-900',
  },
  success: {
    card: 'border-emerald-200 bg-white',
    icon: 'bg-emerald-600 text-white',
    value: 'text-emerald-900',
  },
  danger: {
    card: 'border-rose-200 bg-white',
    icon: 'bg-rose-600 text-white',
    value: 'text-rose-900',
  },
  neutral: {
    card: 'border-slate-200 bg-white',
    icon: 'bg-slate-700 text-white',
    value: 'text-slate-900',
  },
};

function DeltaPill({ delta, label }: { delta?: number | null; label?: string }) {
  if (delta === undefined || delta === null) return null;
  const positive = delta > 0;
  const neutral = delta === 0;
  const Icon = positive ? TrendingUp : neutral ? TrendingUp : TrendingDown;
  const tone = neutral
    ? 'bg-slate-100 text-slate-600'
    : positive
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-rose-100 text-rose-700';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', tone)}>
      <Icon className="h-3 w-3" />
      {positive ? '+' : ''}
      {delta}
      {label ? <span className="hidden sm:inline">&nbsp;{label}</span> : null}
    </span>
  );
}

function KpiCard({ kpi }: { kpi: KpiInput }) {
  const styles = TONE_STYLES[kpi.tone];
  const Icon = kpi.icon;
  const inner = (
    <div
      className={cn(
        'flex h-full w-full min-w-[180px] flex-col gap-2 rounded-[18px] border p-3 shadow-[var(--pcms-shadow-sm)] transition-shadow sm:p-4',
        styles.card,
        kpi.href ? 'hover:shadow-md' : '',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('grid h-9 w-9 place-items-center rounded-xl shadow-sm', styles.icon)}>
          <Icon className="h-4 w-4" />
        </span>
        <DeltaPill delta={kpi.delta ?? undefined} label={kpi.deltaLabel} />
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-bold text-slate-600">{kpi.label}</p>
        <p className={cn('text-2xl font-bold leading-none sm:text-3xl', styles.value)}>{kpi.value}</p>
        {kpi.hint ? <p className="text-xs font-medium text-slate-600">{kpi.hint}</p> : null}
      </div>
      {kpi.href ? (
        <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
          Open <ArrowRight className="h-3 w-3" />
        </span>
      ) : null}
    </div>
  );
  return kpi.href ? (
    <Link href={kpi.href} className="block snap-start">
      {inner}
    </Link>
  ) : (
    <div className="snap-start">{inner}</div>
  );
}

export function MobileKpiStrip({
  total,
  open,
  inProgress,
  completed,
  overdue,
  waitingParts,
  completionRate,
  deltas = {},
  className,
}: MobileKpiStripProps) {
  const t = useT();
  const kpis: KpiInput[] = [
    {
      label: t('kpi.totalJobs'),
      value: total,
      delta: deltas.total ?? null,
      deltaLabel: 'vs last week',
      tone: 'primary',
      icon: ClipboardList,
      href: '/dashboard/jobs',
      hint: 'All maintenance work',
    },
    {
      label: t('kpi.open'),
      value: open,
      delta: deltas.open ?? null,
      deltaLabel: 'new this week',
      tone: 'info',
      icon: Clock,
      href: '/dashboard/jobs?status=pending',
      hint: 'Needs assignment',
    },
    {
      label: t('kpi.inProgress'),
      value: inProgress,
      tone: 'warning',
      icon: Hammer,
      href: '/dashboard/jobs?status=in_progress',
      hint: 'Active right now',
    },
    {
      label: t('kpi.completed'),
      value: completed,
      delta: deltas.completed ?? null,
      deltaLabel: 'vs last week',
      tone: 'success',
      icon: CheckCircle2,
      href: '/dashboard/jobs?status=completed',
      hint: `${completionRate}% ${t('kpi.completionRate').toLowerCase()}`,
    },
    {
      label: t('kpi.overdue'),
      value: overdue,
      delta: deltas.overdue ?? null,
      deltaLabel: 'vs last week',
      tone: 'danger',
      icon: ShieldAlert,
      href: '/dashboard/jobs?status=overdue',
      hint: 'Needs escalation',
    },
    {
      label: t('kpi.waitingParts'),
      value: waitingParts,
      tone: 'neutral',
      icon: Timer,
      href: '/dashboard/jobs?status=waiting_sparepart',
      hint: 'Blocked on inventory',
    },
  ];

  return (
    <section
      aria-label="Maintenance KPI summary"
      className={cn('-mx-3 px-3 sm:mx-0 sm:px-0', className)}
    >
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:hidden">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="min-w-[180px] flex-none">
            <KpiCard kpi={kpi} />
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-2 gap-3 sm:grid lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>
    </section>
  );
}
