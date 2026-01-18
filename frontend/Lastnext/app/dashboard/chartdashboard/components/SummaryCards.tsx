'use client';

interface SummaryCardsProps {
  totalJobs: number;
  pmJobs: number;
  nonPmJobs: number;
  completionRate: number;
}

const cards = [
  { key: 'total', label: 'Total Jobs', color: 'from-sky-500 to-indigo-500' },
  { key: 'pm', label: 'PM Jobs', color: 'from-emerald-500 to-teal-500' },
  { key: 'nonPm', label: 'Non-PM Jobs', color: 'from-amber-500 to-orange-500' },
  { key: 'completion', label: 'Completion Rate', color: 'from-fuchsia-500 to-purple-500' },
] as const;

export default function SummaryCards({
  totalJobs,
  pmJobs,
  nonPmJobs,
  completionRate,
}: SummaryCardsProps) {
  const values = {
    total: totalJobs,
    pm: pmJobs,
    nonPm: nonPmJobs,
    completion: `${completionRate.toFixed(1)}%`,
  } as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className={`h-1.5 w-12 rounded-full bg-gradient-to-r ${card.color}`} />
          <p className="mt-4 text-sm font-medium text-slate-500">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {values[card.key]}
          </p>
        </div>
      ))}
    </div>
  );
}
