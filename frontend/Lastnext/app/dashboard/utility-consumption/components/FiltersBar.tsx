"use client";

import type { MetricKey, MonthName } from "../types";
import { metricOptions, monthNames } from "../utils/data";
import { useT } from "@/app/lib/i18n/LocaleProvider";

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
  const t = useT();
  const toggleYear = (year: number) => {
    if (selectedYears.includes(year)) {
      if (selectedYears.length > 1) {
        onYearsChange(selectedYears.filter((value) => value !== year));
      }
      return;
    }
    onYearsChange([...selectedYears, year].sort((a, b) => b - a));
  };

  return (
    <fieldset className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <legend className="px-1 text-sm font-semibold text-foreground">{t("utility.filters")}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t("utility.compareYears")}
          </label>
          <div
            className="mt-1 flex min-h-11 flex-wrap gap-2 rounded-lg border border-border bg-background p-1.5 shadow-soft"
            aria-label={t("utility.compareYears")}
          >
            {availableYears.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => toggleYear(year)}
                aria-pressed={selectedYears.includes(year)}
                className={`min-h-9 rounded-md px-3 text-sm font-bold transition-colors ${
                  selectedYears.includes(year)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col">
          <label className="text-xs font-medium text-muted-foreground">
            {t("utility.primaryYear")}
          </label>
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-soft"
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
        <div className="flex min-w-0 flex-col">
          <label className="text-xs font-medium text-muted-foreground">
            {t("utility.month")}
          </label>
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-soft"
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
        <div className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t("utility.metric")}
          </label>
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-soft"
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
    </fieldset>
  );
}
