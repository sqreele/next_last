'use client';

import type { ChangeEvent } from 'react';
import type { MetricKey, MonthName } from '../types';
import { metricOptions, monthNames } from '../utils/data';

interface FiltersBarProps {
  selectedYears: number[];
  availableYears: number[];
  primaryYear: number | null;
  selectedMonth: MonthName | 'All';
  selectedMetric: MetricKey;
  onYearsChange: (years: number[]) => void;
  onPrimaryYearChange: (year: number) => void;
  onMonthChange: (month: MonthName | 'All') => void;
  onMetricChange: (metric: MetricKey) => void;
}

export default function FiltersBar({
  selectedYears,
  availableYears,
  primaryYear,
  selectedMonth,
  selectedMetric,
  onYearsChange,
  onPrimaryYearChange,
  onMonthChange,
  onMetricChange,
}: FiltersBarProps) {
  const handleMultiSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => Number(option.value));
    onYearsChange(values);
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Utility Consumption</h1>
        <p className="text-sm text-slate-500">Year-over-year and monthly utility performance.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col">
          <label className="text-xs font-medium text-slate-500">Compare Years</label>
          <select
            multiple
            className="mt-1 h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
            value={selectedYears.map(String)}
            onChange={handleMultiSelect}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium text-slate-500">Primary Year</label>
          <select
            className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
            value={primaryYear ?? ''}
            onChange={(event) => onPrimaryYearChange(Number(event.target.value))}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium text-slate-500">Month</label>
          <select
            className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
            value={selectedMonth}
            onChange={(event) => onMonthChange(event.target.value as MonthName | 'All')}
          >
            <option value="All">All</option>
            {monthNames.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium text-slate-500">Metric</label>
          <select
            className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
            value={selectedMetric}
            onChange={(event) => onMetricChange(event.target.value as MetricKey)}
          >
            {metricOptions.map((metric) => (
              <option key={metric.value} value={metric.value}>
                {metric.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
