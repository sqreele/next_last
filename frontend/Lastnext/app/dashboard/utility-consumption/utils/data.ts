import type { MetricKey, MonthName, UtilityConsumptionRow } from '../types';

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
      point[`${year}`] = row ? row[metric] : null;
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
      totalelectricity: row ? row.totalelectricity : null,
      electricity_cost_budget: row ? row.electricity_cost_budget : null,
      water: row ? row.water : null,
      nightsale: row ? row.nightsale : null,
      totalkwh: row ? row.totalkwh : null,
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
      acc.totalkwh += row.totalkwh;
      acc.totalelectricity += row.totalelectricity;
      acc.electricity_cost_budget += row.electricity_cost_budget;
      acc.water += row.water;
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
