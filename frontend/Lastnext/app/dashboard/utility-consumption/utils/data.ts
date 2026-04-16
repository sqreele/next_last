import type { MetricKey, MonthName, UtilityConsumptionRow } from '../types';

/** API / JSON often sends numbers as strings; `0 += "56000"` becomes string concat and breaks sums. */
export function toFiniteNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return 0;
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

export function coerceUtilityConsumptionRow(
  row: UtilityConsumptionRow | Record<string, unknown>
): UtilityConsumptionRow {
  const r = row as Record<string, unknown>;
  return {
    month: row.month as MonthName,
    year: Math.trunc(toFiniteNumber(r.year)) || 0,
    totalkwh: toFiniteNumber(r.totalkwh),
    onpeakkwh: toFiniteNumber(r.onpeakkwh),
    offpeakkwh: toFiniteNumber(r.offpeakkwh),
    totalelectricity: toFiniteNumber(r.totalelectricity),
    electricity_cost_budget: toFiniteNumber(r.electricity_cost_budget),
    water: toFiniteNumber(r.water),
    nightsale: toFiniteNumber(r.nightsale),
  };
}

export const monthNames: MonthName[] = [
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

export const monthShortLabels = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const metricOptions: Array<{ label: string; value: MetricKey }> = [
  { label: 'Total kWh', value: 'totalkwh' },
  { label: 'On-Peak kWh', value: 'onpeakkwh' },
  { label: 'Off-Peak kWh', value: 'offpeakkwh' },
  { label: 'Total Electricity', value: 'totalelectricity' },
  { label: 'Water', value: 'water' },
  { label: 'Night Sale', value: 'nightsale' },
];

export function getMonthIndex(month: MonthName) {
  return monthNames.indexOf(month) + 1;
}

export function sortRows(rows: UtilityConsumptionRow[]) {
  return [...rows].sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year;
    }
    return getMonthIndex(a.month) - getMonthIndex(b.month);
  });
}

export function buildYearMonthMap(rows: UtilityConsumptionRow[]) {
  const map = new Map<number, Map<MonthName, UtilityConsumptionRow>>();
  rows.forEach((row) => {
    const yearMap = map.get(row.year) ?? new Map<MonthName, UtilityConsumptionRow>();
    yearMap.set(row.month, row);
    map.set(row.year, yearMap);
  });
  return map;
}

export function buildYoYSeries(
  rows: UtilityConsumptionRow[],
  years: number[],
  metric: MetricKey
) {
  const map = buildYearMonthMap(rows);
  return monthNames.map((month, index) => {
    const point: Record<string, number | null | string> = {
      month,
      label: monthShortLabels[index],
    };

    years.forEach((year) => {
      const row = map.get(year)?.get(month);
      const raw = row ? row[metric] : null;
      point[`${year}`] = raw == null ? null : toFiniteNumber(raw);
    });

    return point;
  });
}

export function buildPrimaryYearSeries(rows: UtilityConsumptionRow[], year: number) {
  const map = buildYearMonthMap(rows).get(year);
  return monthNames.map((month, index) => {
    const row = map?.get(month);
    return {
      month,
      label: monthShortLabels[index],
      totalelectricity: row ? toFiniteNumber(row.totalelectricity) : null,
      electricity_cost_budget: row ? toFiniteNumber(row.electricity_cost_budget) : null,
      water: row ? toFiniteNumber(row.water) : null,
      nightsale: row ? toFiniteNumber(row.nightsale) : null,
      totalkwh: row ? toFiniteNumber(row.totalkwh) : null,
    };
  });
}

export function filterRowsByMonth(
  rows: UtilityConsumptionRow[],
  selectedMonth: MonthName | 'All'
) {
  if (selectedMonth === 'All') {
    return rows;
  }
  return rows.filter((row) => row.month === selectedMonth);
}

export function calculateSummary(rows: UtilityConsumptionRow[]) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.totalkwh += toFiniteNumber(row.totalkwh);
      acc.totalelectricity += toFiniteNumber(row.totalelectricity);
      acc.electricity_cost_budget += toFiniteNumber(row.electricity_cost_budget);
      acc.water += toFiniteNumber(row.water);
      return acc;
    },
    { totalkwh: 0, totalelectricity: 0, electricity_cost_budget: 0, water: 0 }
  );

  return {
    totalkwh: totals.totalkwh,
    totalelectricity: totals.totalelectricity,
    water: totals.water,
    variance: totals.totalelectricity - totals.electricity_cost_budget,
  };
}

export function previousCalendarMonthUtility(
  month: MonthName,
  year: number
): { month: MonthName; year: number } {
  const idx = monthNames.indexOf(month);
  if (idx <= 0) {
    return { month: 'December', year: year - 1 };
  }
  return { month: monthNames[idx - 1]!, year };
}

/**
 * Rows for the comparison period (MoM when a month is selected; shifted years when month is All).
 */
export function buildUtilityComparisonRows(
  rows: UtilityConsumptionRow[],
  selectedMonth: MonthName | 'All',
  activeYears: number[]
): {
  previousRows: UtilityConsumptionRow[];
  vsLabel: string;
  mode: 'month_over_month' | 'year_over_year';
} | null {
  if (activeYears.length === 0) return null;

  if (selectedMonth === 'All') {
    const prevYears = [...new Set(activeYears.map((y) => y - 1))];
    const previousRows = rows.filter((r) => prevYears.includes(r.year));
    const ys = [...prevYears].sort((a, b) => a - b);
    const vsLabel = ys.length === 1 ? `${ys[0]}` : `${ys[0]}–${ys[ys.length - 1]}`;
    return { previousRows, vsLabel, mode: 'year_over_year' };
  }

  const prevPairs = activeYears.map((y) => previousCalendarMonthUtility(selectedMonth, y));
  const previousRows = rows.filter((r) =>
    prevPairs.some((p) => p.year === r.year && r.month === p.month)
  );
  return {
    previousRows,
    vsLabel: 'prior month',
    mode: 'month_over_month',
  };
}

export interface BudgetStatusPieResult {
  data: Array<{ name: string; value: number }>;
  /** No month has budget > 0 — slices only compare actual to zero, not a real budget target. */
  budgetUnsetForAllMonths: boolean;
}

/** Pie data: count of months within / over electricity budget (same rows as summary). */
export function buildBudgetStatusPieData(rows: UtilityConsumptionRow[]): BudgetStatusPieResult {
  let within = 0;
  let over = 0;
  let hasPositiveBudget = false;
  rows.forEach((row) => {
    const actual = toFiniteNumber(row.totalelectricity);
    const budget = toFiniteNumber(row.electricity_cost_budget);
    if (budget > 0) {
      hasPositiveBudget = true;
    }
    if (actual <= budget) {
      within += 1;
    } else {
      over += 1;
    }
  });
  return {
    data: [
      { name: 'Within budget', value: within },
      { name: 'Over budget', value: over },
    ],
    budgetUnsetForAllMonths: rows.length > 0 && !hasPositiveBudget,
  };
}
