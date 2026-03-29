'use client';

import {
  describeRelativeCountChange,
  describeSignedRelativeChange,
} from '@/app/lib/dashboard/metricsComparison';

export interface UtilitySummary {
  totalkwh: number;
  totalelectricity: number;
  water: number;
  variance: number;
}

export type UtilityComparisonMode = 'month_over_month' | 'year_over_year';

interface SummaryCardsProps {
  summary: UtilitySummary;
  comparison?: {
    vsLabel: string;
    mode: UtilityComparisonMode;
    previous: UtilitySummary;
  } | null;
  /** Shown above the grid when multiple years are selected (explains baseline). */
  comparisonScopeNote?: string | null;
}

const cards = [
  { key: 'totalKwh', label: 'Total kWh', accent: 'from-sky-500 to-blue-500' },
  { key: 'totalElectricity', label: 'Total Electricity', accent: 'from-emerald-500 to-teal-500' },
  { key: 'water', label: 'Water', accent: 'from-cyan-500 to-indigo-500' },
  { key: 'variance', label: 'Variance', accent: 'from-amber-500 to-orange-500' },
] as const;

type CardKey = (typeof cards)[number]['key'];

function formatNumber(value: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function comparisonCaption(mode: UtilityComparisonMode): string {
  return mode === 'year_over_year' ? 'vs prior year' : 'vs prior month';
}

function TrendGlyph({ direction }: { direction: 'up' | 'down' | 'flat' | 'new' }) {
  if (direction === 'up') {
    return (
      <span className="text-emerald-600" aria-hidden>
        ▲
      </span>
    );
  }
  if (direction === 'down') {
    return (
      <span className="text-rose-600" aria-hidden>
        ▼
      </span>
    );
  }
  if (direction === 'new') {
    return (
      <span className="text-sky-600" aria-hidden>
        ◆
      </span>
    );
  }
  return (
    <span className="text-slate-400" aria-hidden>
      —
    </span>
  );
}

function CardComparisonLine({
  cardKey,
  current,
  previous,
  vsLabel,
  mode,
}: {
  cardKey: CardKey;
  current: UtilitySummary;
  previous: UtilitySummary;
  vsLabel: string;
  mode: UtilityComparisonMode;
}) {
  if (cardKey === 'variance') {
    const insight = describeSignedRelativeChange(current.variance, previous.variance);
    return (
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
        <TrendGlyph direction={insight.direction} />
        <span className="font-medium tabular-nums text-slate-800">{insight.headline}</span>
        <span className="text-slate-500">
          {comparisonCaption(mode)} ({vsLabel})
        </span>
        {insight.detail ? (
          <span className="w-full text-slate-400">{insight.detail}</span>
        ) : null}
      </p>
    );
  }

  const cur =
    cardKey === 'totalKwh'
      ? current.totalkwh
      : cardKey === 'totalElectricity'
        ? current.totalelectricity
        : current.water;
  const prev =
    cardKey === 'totalKwh'
      ? previous.totalkwh
      : cardKey === 'totalElectricity'
        ? previous.totalelectricity
        : previous.water;

  const insight = describeRelativeCountChange(cur, prev);

  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
      <TrendGlyph direction={insight.direction} />
      <span className="font-medium tabular-nums text-slate-800">{insight.headline}</span>
      <span className="text-slate-500">
        {comparisonCaption(mode)} ({vsLabel})
      </span>
      {insight.detail ? (
        <span className="w-full text-slate-400">{insight.detail}</span>
      ) : null}
    </p>
  );
}

export default function SummaryCards({
  summary,
  comparison,
  comparisonScopeNote,
}: SummaryCardsProps) {
  const values = {
    totalKwh: formatNumber(summary.totalkwh),
    totalElectricity: formatNumber(summary.totalelectricity),
    water: formatNumber(summary.water),
    variance: formatNumber(summary.variance),
  } as const;

  return (
    <div className="space-y-3">
      {comparisonScopeNote ? (
        <p
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600"
          role="note"
        >
          {comparisonScopeNote}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className={`h-1.5 w-14 rounded-full bg-gradient-to-r ${card.accent}`} />
          <p className="mt-4 text-sm font-medium text-slate-500">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {values[card.key]}
          </p>
          {comparison ? (
            <CardComparisonLine
              cardKey={card.key}
              current={summary}
              previous={comparison.previous}
              vsLabel={comparison.vsLabel}
              mode={comparison.mode}
            />
          ) : (
            <p className="mt-3 text-xs text-slate-400">
              Add year data to see period comparison.
            </p>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
