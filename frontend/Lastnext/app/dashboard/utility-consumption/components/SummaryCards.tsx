'use client';

interface SummaryCardsProps {
  totalKwh: number;
  totalElectricity: number;
  water: number;
  variance: number;
}

const cards = [
  { key: 'totalKwh', label: 'Total kWh', accent: 'from-sky-500 to-blue-500' },
  { key: 'totalElectricity', label: 'Total Electricity', accent: 'from-emerald-500 to-teal-500' },
  { key: 'water', label: 'Water', accent: 'from-cyan-500 to-indigo-500' },
  { key: 'variance', label: 'Variance', accent: 'from-amber-500 to-orange-500' },
] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function SummaryCards({
  totalKwh,
  totalElectricity,
  water,
  variance,
}: SummaryCardsProps) {
  const values = {
    totalKwh: formatNumber(totalKwh),
    totalElectricity: formatNumber(totalElectricity),
    water: formatNumber(water),
    variance: formatNumber(variance),
  } as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className={`h-1.5 w-14 rounded-full bg-gradient-to-r ${card.accent}`} />
          <p className="mt-4 text-sm font-medium text-slate-500">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {values[card.key]}
          </p>
        </div>
      ))}
    </div>
  );
}
