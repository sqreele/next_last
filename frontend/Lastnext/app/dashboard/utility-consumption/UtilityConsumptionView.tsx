'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMinLoaderTime } from '@/app/lib/hooks/useMinLoaderTime';
import ActualVsBudgetChart from './components/ActualVsBudgetChart';
import BudgetStatusPieChart from './components/BudgetStatusPieChart';
import FiltersBar from './components/FiltersBar';
import MetricLineChart from './components/MetricLineChart';
import SummaryCards from './components/SummaryCards';
import YoYLineChart from './components/YoYLineChart';
import type { MetricKey, MonthName, UtilityConsumptionRow } from './types';
import { useUser } from '@/app/lib/stores/mainStore';
import {
  buildBudgetStatusPieData,
  buildPrimaryYearSeries,
  buildUtilityComparisonRows,
  buildYoYSeries,
  calculateSummary,
  filterRowsByMonth,
  metricOptions,
  sortRows,
} from './utils/data';

const metricLabelMap = metricOptions.reduce<Record<MetricKey, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {} as Record<MetricKey, string>);

export default function UtilityConsumptionView() {
  const [rows, setRows] = useState<UtilityConsumptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [primaryYear, setPrimaryYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthName | 'All'>('All');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('totalkwh');
  const { selectedPropertyId: selectedProperty } = useUser();
  const { recordLoaderShown, clearLoadingAfterMinTime } = useMinLoaderTime(setLoading);

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      try {
        if (!selectedProperty) {
          setRows([]);
          setError(null);
          setLoading(false);
          return;
        }
        recordLoaderShown();
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        params.set('property_id', selectedProperty);
        const response = await fetch(
          `/api/utility/consumption?${params.toString()}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error('Unable to load utility consumption data.');
        }
        const payload: UtilityConsumptionRow[] = await response.json();
        setRows(sortRows(payload));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        clearLoadingAfterMinTime();
      }
    }

    loadData();

    return () => controller.abort();
  }, [selectedProperty, recordLoaderShown, clearLoadingAfterMinTime]);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    rows.forEach((row) => yearSet.add(row.year));
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [rows]);

  useEffect(() => {
    if (availableYears.length === 0) return;
    const preferredPrimaryYear = availableYears.includes(2025) ? 2025 : availableYears[0];
    setPrimaryYear((current) => current ?? preferredPrimaryYear);
    setSelectedYears((current) => {
      if (current.length > 0) return current;
      return [preferredPrimaryYear, ...availableYears.filter((year) => year !== preferredPrimaryYear).slice(0, 1)];
    });
  }, [availableYears]);

  const activeYears = selectedYears.length > 0 ? selectedYears : availableYears.slice(0, 2);
  const monthFilteredRows = filterRowsByMonth(rows, selectedMonth);
  const yearFilteredRows = monthFilteredRows.filter((row) => activeYears.includes(row.year));

  const summary = useMemo(() => calculateSummary(yearFilteredRows), [yearFilteredRows]);

  const comparisonContext = useMemo(
    () => buildUtilityComparisonRows(monthFilteredRows, selectedMonth, activeYears),
    [monthFilteredRows, selectedMonth, activeYears]
  );

  const previousSummary = useMemo(() => {
    if (!comparisonContext) return null;
    return calculateSummary(comparisonContext.previousRows);
  }, [comparisonContext]);

  const comparisonMeta = useMemo(() => {
    if (!comparisonContext || !previousSummary) return null;
    return {
      vsLabel: comparisonContext.vsLabel,
      mode: comparisonContext.mode,
      previous: previousSummary,
    };
  }, [comparisonContext, previousSummary]);

  const budgetStatusPie = useMemo(
    () => buildBudgetStatusPieData(yearFilteredRows),
    [yearFilteredRows]
  );

  const comparisonScopeNote = useMemo(() => {
    if (activeYears.length <= 1 || !comparisonMeta) return null;
    if (comparisonMeta.mode === 'year_over_year') {
      const prevYears = [...new Set(activeYears.map((y) => y - 1))].sort((a, b) => a - b);
      const label = prevYears.length === 1 ? `${prevYears[0]}` : `${prevYears[0]}–${prevYears[prevYears.length - 1]}`;
      return `Multiple years selected: the card baseline is the combined total for ${label} (each selected year compared to the year before), versus your current filter total.`;
    }
    return `Multiple years selected: the card baseline sums the prior calendar month for each selected year (e.g. Feb vs Mar), compared to your current filter total.`;
  }, [activeYears, comparisonMeta]);

  const yoyData = useMemo(
    () => buildYoYSeries(monthFilteredRows, activeYears, selectedMetric),
    [monthFilteredRows, activeYears, selectedMetric]
  );

  const primaryYearSeries = useMemo(() => {
    if (!primaryYear) return [];
    return buildPrimaryYearSeries(monthFilteredRows, primaryYear);
  }, [monthFilteredRows, primaryYear]);

  const waterSeries = primaryYearSeries.map((item) => ({ label: item.label, value: item.water }));
  const nightSaleSeries = primaryYearSeries.map((item) => ({ label: item.label, value: item.nightsale }));
  const waterYAxisMax = useMemo(() => {
    const values = primaryYearSeries
      .map((item) => item.water)
      .filter((value): value is number => typeof value === 'number');
    if (values.length === 0) return 15000;
    const maxValue = Math.max(...values);
    const roundedMax = Math.ceil(maxValue / 1000) * 1000;
    return Math.max(15000, roundedMax);
  }, [primaryYearSeries]);

  const isEmpty = !loading && !error && selectedProperty && rows.length === 0;

  return (
    <div className="space-y-6">
      <FiltersBar
        availableYears={availableYears}
        selectedYears={activeYears}
        primaryYear={primaryYear}
        selectedMonth={selectedMonth}
        selectedMetric={selectedMetric}
        onYearsChange={setSelectedYears}
        onPrimaryYearChange={setPrimaryYear}
        onMonthChange={setSelectedMonth}
        onMetricChange={setSelectedMetric}
      />

      {loading && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <p className="text-sm text-slate-500">Loading utility consumption...</p>
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
            Choose a property from the header to load utility consumption data.
          </p>
        </div>
      )}

      {isEmpty && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No data available</h2>
          <p className="mt-2 text-sm text-slate-500">
            No utility data found. Adjust filters or check the data source.
          </p>
        </div>
      )}

      {!loading && !error && !isEmpty && (
        <div className="space-y-6">
          <SummaryCards
            summary={summary}
            comparison={comparisonMeta}
            comparisonScopeNote={comparisonScopeNote}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <YoYLineChart
              data={yoyData}
              years={activeYears}
              metricLabel={metricLabelMap[selectedMetric]}
            />
            <ActualVsBudgetChart
              data={primaryYearSeries}
              yearLabel={primaryYear ? primaryYear.toString() : ''}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <BudgetStatusPieChart
              data={budgetStatusPie.data}
              budgetUnsetForAllMonths={budgetStatusPie.budgetUnsetForAllMonths}
            />
            <MetricLineChart
              data={waterSeries}
              title="Water trend"
              subtitle={`Primary year ${primaryYear ?? ''}`}
              color="#0ea5e9"
              yAxisMax={waterYAxisMax}
            />
            <MetricLineChart
              data={nightSaleSeries}
              title="Night sale trend"
              subtitle={`Primary year ${primaryYear ?? ''}`}
              color="#f97316"
            />
          </div>
        </div>
      )}
    </div>
  );
}
