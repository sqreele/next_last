import { NextResponse } from 'next/server';
import type { MonthName, UtilityConsumptionRow } from '@/app/dashboard/utility-consumption/types';

const months: MonthName[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function buildYear(year: number, base: number) {
  return months.map((month, index) => {
    const totalKwh = base + index * 120 + Math.round(Math.random() * 30);
    const onPeak = Math.round(totalKwh * 0.55);
    const offPeak = totalKwh - onPeak;
    const totalElectricity = totalKwh * 4.2 + index * 15;
    const budget = totalElectricity * 0.92 + 1200;

    return {
      month,
      year,
      totalkwh: totalKwh,
      onpeakkwh: onPeak,
      offpeakkwh: offPeak,
      totalelectricity: Math.round(totalElectricity),
      electricity_cost_budget: Math.round(budget),
      water: Math.round(1200 + index * 45 + Math.random() * 40),
      nightsale: Math.round(800 + index * 35 + Math.random() * 30),
    } satisfies UtilityConsumptionRow;
  });
}

export async function GET() {
  const rows: UtilityConsumptionRow[] = [
    ...buildYear(2023, 1800),
    ...buildYear(2024, 2000),
    ...buildYear(2025, 2100),
  ];

  return NextResponse.json(rows);
}
