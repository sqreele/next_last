'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMinLoaderTime } from '@/app/lib/hooks/useMinLoaderTime';
import PMNonPMBarChart from './components/PMNonPMBarChart';
import JobPmPieChart from './components/JobPmPieChart';
import StatusPieChart from './components/StatusPieChart';
import SummaryCards from './components/SummaryCards';
import TopUsersChart from './components/TopUsersChart';
import TrendLineChart from './components/TrendLineChart';
import { useUser } from '@/app/lib/stores/mainStore';
import {
  aggregateTopics,
  aggregateTopUsers,
  applyMonthYearFilter,
  buildCardSummary,
  resolveComparisonPeriod,
} from './utils/dashboardAggregate';
import type {
  DashboardSummaryResponse,
  MonthLabel,
  PMNonPMPoint,
  StatusPoint,
  TopUserPoint,
  TrendPoint,
} from './types';

const months: MonthLabel[] = [
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

const monthOptions = ['All', ...months] as const;

type MonthOption = (typeof monthOptions)[number];

type YearOption = 'All' | number;

function formatChartLabel(point: TrendPoint | PMNonPMPoint, includeYear: boolean) {
  return includeYear ? `${point.month} ${point.year}` : point.month;
}

export default function ChartDashboardView() {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>('All');
  const [selectedYear, setSelectedYear] = useState<YearOption>('All');
  const { selectedPropertyId: selectedProperty } = useUser();
  const { recordLoaderShown, clearLoadingAfterMinTime } = useMinLoaderTime(setLoading);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSummary() {
      try {
        if (!selectedProperty) {
          setData(null);
          setLoading(false);
          setError(null);
          return;
        }
        recordLoaderShown();
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (selectedProperty) {
          params.set('property_id', selectedProperty);
        }
        const queryString = params.toString();
        const response = await fetch(
          `/api/dashboard/summary${queryString ? `?${queryString}` : ''}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error('Unable to load dashboard summary.');
        }
        const payload: DashboardSummaryResponse = await response.json();
        setData(payload);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        clearLoadingAfterMinTime();
      }
    }

    loadSummary();

    return () => {
      controller.abort();
    };
  }, [selectedProperty, recordLoaderShown, clearLoadingAfterMinTime]);

  const availableYears = useMemo(() => {
    if (!data) return [];
    const yearSet = new Set<number>();
    data.trendByMonth.forEach((item) => yearSet.add(item.year));
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [data]);

  useEffect(() => {
    if (availableYears.length > 0 && selectedYear === 'All') {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const filteredTrend = useMemo(() => {
    if (!data) return [] as TrendPoint[];
    return applyMonthYearFilter(data.trendByMonth, selectedMonth, selectedYear);
  }, [data, selectedMonth, selectedYear]);

  const filteredPMNonPM = useMemo(() => {
    if (!data) return [] as PMNonPMPoint[];
    return applyMonthYearFilter(data.pmNonPmByMonth, selectedMonth, selectedYear);
  }, [data, selectedMonth, selectedYear]);

  const filteredStatus = useMemo(() => {
    if (!data) return [] as StatusPoint[];
    return applyMonthYearFilter(data.statusByMonth, selectedMonth, selectedYear);
  }, [data, selectedMonth, selectedYear]);

  const filteredTopUsers = useMemo(() => {
    if (!data) return [] as TopUserPoint[];
    return applyMonthYearFilter(data.topUsersByMonth, selectedMonth, selectedYear);
  }, [data, selectedMonth, selectedYear]);

  const filteredTopics = useMemo(() => {
    if (!data) return [];
    return applyMonthYearFilter(data.topicsByMonth, selectedMonth, selectedYear);
  }, [data, selectedMonth, selectedYear]);

  const summary = useMemo(
    () => buildCardSummary(filteredPMNonPM, filteredStatus),
    [filteredPMNonPM, filteredStatus]
  );

  const comparisonPeriod = useMemo(
    () => (data ? resolveComparisonPeriod(selectedMonth, selectedYear) : null),
    [data, selectedMonth, selectedYear]
  );

  const previousSummary = useMemo(() => {
    if (!data || !comparisonPeriod) return null;
    const prevPm = applyMonthYearFilter(
      data.pmNonPmByMonth,
      comparisonPeriod.month,
      comparisonPeriod.year
    );
    const prevStatus = applyMonthYearFilter(
      data.statusByMonth,
      comparisonPeriod.month,
      comparisonPeriod.year
    );
    return buildCardSummary(prevPm, prevStatus);
  }, [data, comparisonPeriod]);

  const comparisonMeta = useMemo(() => {
    if (!comparisonPeriod || !previousSummary) return null;
    return {
      vsLabel: comparisonPeriod.label,
      mode: comparisonPeriod.mode,
      previous: previousSummary,
    };
  }, [comparisonPeriod, previousSummary]);

  const includeYearLabel = availableYears.length > 1 || selectedYear === 'All';

  const trendChartData = filteredTrend.map((item) => ({
    label: formatChartLabel(item, includeYearLabel),
    jobs: item.jobs,
  }));

  const pmNonPmChartData = filteredPMNonPM.map((item) => ({
    label: formatChartLabel(item, includeYearLabel),
    pm: item.pm,
    nonPm: item.nonPm,
  }));

  const statusChartData = summary.statusTotals;

  const topUsersChartData = aggregateTopUsers(filteredTopUsers);
  const topTopicData = aggregateTopics(filteredTopics);
  const topTopic = topTopicData[0] ?? null;

  const isEmpty = !loading && !error && selectedProperty && (!data || filteredTrend.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Chart Dashboard</h1>
          <p className="text-sm text-slate-500">Overview of job performance analytics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-slate-500">Month</label>
            <select
              className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value as MonthOption)}
            >
              {monthOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          {availableYears.length > 0 && (
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-500">Year</label>
              <select
                className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
                value={selectedYear}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedYear(value === 'All' ? 'All' : Number(value));
                }}
              >
                <option value="All">All</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <p className="text-sm text-slate-500">Loading dashboard data...</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-600">
          {error}
        </div>
      )}

      {!selectedProperty && !loading && !error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">Select a property</h2>
          <p className="mt-2 text-sm text-slate-500">
            Choose a property from the header to load chart dashboard analytics.
          </p>
        </div>
      )}

      {isEmpty && !error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No data available</h2>
          <p className="mt-2 text-sm text-slate-500">
            There is no data for the selected month or year. Try another filter.
          </p>
        </div>
      )}

      {!loading && !error && !isEmpty && (
        <div className="space-y-6">
          <SummaryCards summary={summary} comparison={comparisonMeta} />

          <div className="grid gap-6 lg:grid-cols-2">
            <TrendLineChart data={trendChartData} />
            <PMNonPMBarChart data={pmNonPmChartData} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <StatusPieChart data={statusChartData} />
            <JobPmPieChart
              pmJobs={summary.pmJobs}
              nonPmJobs={summary.nonPmJobs}
              topTopic={topTopic}
            />
            <TopUsersChart data={topUsersChartData} />
          </div>
        </div>
      )}
    </div>
  );
}
