"use client";

import type { ChangeEvent } from "react";
import type { MetricKey, MonthName } from "../types";
import { metricOptions, monthNames } from "../utils/data";

interface FiltersBarProps {
  selectedYears: number[];
  availableYears: number[];
  primaryYear: number | null;
  selectedMonth: MonthName | "All";
  selectedMetric: MetricKey;
  onYearsChange: (years: number[]) => void;
  onPrimaryYearChange: (year: number) => void;
  onMonthChange: (month: MonthName | "All") => void;
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
    const values = Array.from(event.target.selectedOptions).map((option) =>
      Number(option.value),
    );
    onYearsChange(values);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-soft lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Utility Consumption
        </h1>
        <p className="text-sm text-muted-foreground">
          Year-over-year and monthly utility performance.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col">
          <label className="text-xs font-medium text-muted-foreground">
            Compare Years
          </label>
          <select
            multiple
            className="mt-1 h-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-soft"
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
          <label className="text-xs font-medium text-muted-foreground">
            Primary Year
          </label>
          <select
            className="mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-soft"
            value={primaryYear ?? ""}
            onChange={(event) =>
              onPrimaryYearChange(Number(event.target.value))
            }
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium text-muted-foreground">
            Month
          </label>
          <select
            className="mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-soft"
            value={selectedMonth}
            onChange={(event) =>
              onMonthChange(event.target.value as MonthName | "All")
            }
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
          <label className="text-xs font-medium text-muted-foreground">
            Metric
          </label>
          <select
            className="mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-soft"
            value={selectedMetric}
            onChange={(event) =>
              onMetricChange(event.target.value as MetricKey)
            }
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
