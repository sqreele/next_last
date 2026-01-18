'use client';

import { useEffect, useMemo, useState } from 'react';
import ActualVsBudgetChart from './components/ActualVsBudgetChart';
import FiltersBar from './components/FiltersBar';
import MetricLineChart from './components/MetricLineChart';
import SummaryCards from './components/SummaryCards';
import YoYLineChart from './components/YoYLineChart';
import type { MetricKey, MonthName, UtilityConsumptionRow } from './types';
import { useUser } from '@/app/lib/stores/mainStore';
import {
  buildPrimaryYearSeries,
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
        setLoading(false);
      }
    }

    loadData();

    return () => controller.abort();
  }, [selectedProperty]);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    rows.forEach((row) => yearSet.add(row.year));
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [rows]);

  useEffect(() => {
    if (availableYears.length === 0) return;
    setPrimaryYear((current) => current ?? availableYears[0]);
    setSelectedYears((current) => {
      if (current.length > 0) return current;
      return availableYears.slice(0, 2);
    });
  }, [availableYears]);

  const activeYears = selectedYears.length > 0 ? selectedYears : availableYears.slice(0, 2);
  const monthFilteredRows = filterRowsByMonth(rows, selectedMonth);
  const yearFilteredRows = monthFilteredRows.filter((row) => activeYears.includes(row.year));

  const summary = useMemo(() => calculateSummary(yearFilteredRows), [yearFilteredRows]);

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
            totalKwh={summary.totalkwh}
            totalElectricity={summary.totalelectricity}
            water={summary.water}
            variance={summary.variance}
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

          <div className="grid gap-6 xl:grid-cols-2">
            <MetricLineChart
              data={waterSeries}
              title="Water trend"
              subtitle={`Primary year ${primaryYear ?? ''}`}
              color="#0ea5e9"
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
