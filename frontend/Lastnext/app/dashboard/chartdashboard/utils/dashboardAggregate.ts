import type { MonthLabel, PMNonPMPoint, StatusPoint, TopUserPoint, TopicPoint } from '../types';

export function aggregateStatus(data: StatusPoint[]) {
  const totals = data.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + item.count;
      return acc;
    },
    {} as Record<StatusPoint['status'], number>
  );

  return [
    { name: 'Completed', value: totals.Completed ?? 0 },
    { name: 'Waiting Sparepart', value: totals['Waiting Sparepart'] ?? 0 },
    { name: 'Waiting Fix Defect', value: totals['Waiting Fix Defect'] ?? 0 },
  ];
}

export interface CardSummary {
  totalJobs: number;
  pmJobs: number;
  nonPmJobs: number;
  completionRate: number;
  statusTotals: ReturnType<typeof aggregateStatus>;
}

export function buildCardSummary(
  filteredPMNonPM: PMNonPMPoint[],
  filteredStatus: StatusPoint[]
): CardSummary {
  const pmJobs = filteredPMNonPM.reduce((total, item) => total + item.pm, 0);
  const nonPmJobs = filteredPMNonPM.reduce((total, item) => total + item.nonPm, 0);
  const totalJobs = pmJobs + nonPmJobs;
  const statusTotals = aggregateStatus(filteredStatus);
  const completed = statusTotals.find((item) => item.name === 'Completed')?.value ?? 0;
  const completionRate = totalJobs > 0 ? (completed / totalJobs) * 100 : 0;

  return {
    totalJobs,
    pmJobs,
    nonPmJobs,
    completionRate,
    statusTotals,
  };
}

const MONTHS: MonthLabel[] = [
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

export function previousCalendarMonth(
  month: MonthLabel,
  year: number
): { month: MonthLabel; year: number } {
  const idx = MONTHS.indexOf(month);
  if (idx <= 0) {
    return { month: 'Dec', year: year - 1 };
  }
  return { month: MONTHS[idx - 1]!, year };
}

export type DashboardMonthFilter = 'All' | MonthLabel;
export type DashboardYearFilter = 'All' | number;

export type PeriodComparisonMode = 'month_over_month' | 'year_over_year';

export interface ComparisonPeriod {
  mode: PeriodComparisonMode;
  /** e.g. "Nov 2024" or "2023" */
  label: string;
  month: DashboardMonthFilter;
  year: DashboardYearFilter;
}

/**
 * Resolves the prior period for summary cards (MoM for a single month, YoY when month is All).
 */
export function resolveComparisonPeriod(
  selectedMonth: DashboardMonthFilter,
  selectedYear: DashboardYearFilter
): ComparisonPeriod | null {
  if (selectedYear === 'All') {
    return null;
  }

  if (selectedMonth === 'All') {
    const y = selectedYear as number;
    return {
      mode: 'year_over_year',
      label: String(y - 1),
      month: 'All',
      year: y - 1,
    };
  }

  const { month, year } = previousCalendarMonth(selectedMonth, selectedYear as number);
  return {
    mode: 'month_over_month',
    label: `${month} ${year}`,
    month,
    year,
  };
}

export function applyMonthYearFilter<T extends { month: MonthLabel; year: number }>(
  data: T[],
  selectedMonth: DashboardMonthFilter,
  selectedYear: DashboardYearFilter
): T[] {
  return data.filter((item) => {
    const monthMatches = selectedMonth === 'All' || item.month === selectedMonth;
    const yearMatches = selectedYear === 'All' || item.year === selectedYear;
    return monthMatches && yearMatches;
  });
}

export function aggregateTopUsers(data: TopUserPoint[]) {
  const totals = data.reduce(
    (acc, item) => {
      const existing = acc[item.user] ?? { pm: 0, nonPm: 0 };
      acc[item.user] = {
        pm: existing.pm + item.pm,
        nonPm: existing.nonPm + item.nonPm,
      };
      return acc;
    },
    {} as Record<string, { pm: number; nonPm: number }>
  );

  return Object.entries(totals)
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.pm + b.nonPm - (a.pm + a.nonPm))
    .slice(0, 6);
}

export function aggregateTopics(data: TopicPoint[]) {
  const totals = data.reduce(
    (acc, item) => {
      const existing = acc[item.topic] ?? {
        count: 0,
        pm: 0,
        nonPm: 0,
      };
      acc[item.topic] = {
        count: existing.count + item.count,
        pm: existing.pm + (item.pm ?? 0),
        nonPm: existing.nonPm + (item.nonPm ?? 0),
      };
      return acc;
    },
    {} as Record<string, { count: number; pm: number; nonPm: number }>
  );

  return Object.entries(totals)
    .map(([topic, values]) => ({
      topic,
      count: values.count,
      pm: values.pm,
      nonPm: values.nonPm,
      isPreventive: values.pm > 0,
    }))
    .sort((a, b) => b.count - a.count);
}
