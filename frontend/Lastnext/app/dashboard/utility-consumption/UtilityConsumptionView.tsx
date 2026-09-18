"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMinLoaderTime } from "@/app/lib/hooks/useMinLoaderTime";
import ActualVsBudgetChart from "./components/ActualVsBudgetChart";
import BudgetStatusPieChart from "./components/BudgetStatusPieChart";
import FiltersBar from "./components/FiltersBar";
import MetricLineChart from "./components/MetricLineChart";
import SummaryCards from "./components/SummaryCards";
import UtilityBreakdown from "./components/UtilityBreakdown";
import UtilityRecordsTable from "./components/UtilityRecordsTable";
import YoYLineChart from "./components/YoYLineChart";
import type { MetricKey, MonthName, UtilityConsumptionRow } from "./types";
import { useUser } from "@/app/lib/stores/mainStore";
import {
  buildBudgetStatusPieData,
  buildPrimaryYearSeries,
  buildUtilityComparisonRows,
  buildYoYSeries,
  calculateSummary,
  filterRowsByMonth,
  metricOptions,
  sortRows,
} from "./utils/data";
import { DashboardKpiSkeleton, SkeletonTable } from "@/app/components/ui/loading";
import { useT } from "@/app/lib/i18n/LocaleProvider";

const metricLabelMap = metricOptions.reduce<Record<MetricKey, string>>(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {} as Record<MetricKey, string>,
);

export default function UtilityConsumptionView() {
  const t = useT();
  const [rows, setRows] = useState<UtilityConsumptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [primaryYear, setPrimaryYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthName | "All">("All");
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("totalkwh");
  const { selectedPropertyId: selectedProperty } = useUser();
  const requestIdRef = useRef(0);
  const { recordLoaderShown, clearLoadingAfterMinTime } =
    useMinLoaderTime(setLoading);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setRows([]);
    setSelectedYears([]);
    setPrimaryYear(null);
    setSelectedMonth("All");
    setError(null);

    async function loadData() {
      let loaderGeneration: number | null = null;
      try {
        if (!selectedProperty) {
          setRows([]);
          setError(null);
          setLoading(false);
          return;
        }
        loaderGeneration = recordLoaderShown();
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        params.set("property_id", selectedProperty);
        const response = await fetch(
          `/api/utility/consumption?${params.toString()}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error("Unable to load utility consumption data.");
        }
        const payload: UtilityConsumptionRow[] = await response.json();
        if (requestId === requestIdRef.current) {
          setRows(sortRows(payload));
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        if (requestId === requestIdRef.current) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (
          loaderGeneration !== null &&
          requestId === requestIdRef.current
        ) {
          clearLoadingAfterMinTime(loaderGeneration);
        }
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
    const preferredPrimaryYear = availableYears.includes(2025)
      ? 2025
      : availableYears[0];
    setPrimaryYear((current) => current ?? preferredPrimaryYear);
    setSelectedYears((current) => {
      if (current.length > 0) return current;
      return [
        preferredPrimaryYear,
        ...availableYears
          .filter((year) => year !== preferredPrimaryYear)
          .slice(0, 1),
      ];
    });
  }, [availableYears]);

  const activeYears =
    selectedYears.length > 0 ? selectedYears : availableYears.slice(0, 2);
  const monthFilteredRows = filterRowsByMonth(rows, selectedMonth);
  const yearFilteredRows = monthFilteredRows.filter((row) =>
    activeYears.includes(row.year),
  );

  const summary = useMemo(
    () => calculateSummary(yearFilteredRows),
    [yearFilteredRows],
  );

  const comparisonContext = useMemo(
    () =>
      buildUtilityComparisonRows(monthFilteredRows, selectedMonth, activeYears),
    [monthFilteredRows, selectedMonth, activeYears],
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
    [yearFilteredRows],
  );

  const comparisonScopeNote = useMemo(() => {
    if (activeYears.length <= 1 || !comparisonMeta) return null;
    if (comparisonMeta.mode === "year_over_year") {
      const prevYears = [...new Set(activeYears.map((y) => y - 1))].sort(
        (a, b) => a - b,
      );
      const label =
        prevYears.length === 1
          ? `${prevYears[0]}`
          : `${prevYears[0]}–${prevYears[prevYears.length - 1]}`;
      return `Multiple years selected: the card baseline is the combined total for ${label} (each selected year compared to the year before), versus your current filter total.`;
    }
    return `Multiple years selected: the card baseline sums the prior calendar month for each selected year (e.g. Feb vs Mar), compared to your current filter total.`;
  }, [activeYears, comparisonMeta]);

  const yoyData = useMemo(
    () => buildYoYSeries(monthFilteredRows, activeYears, selectedMetric),
    [monthFilteredRows, activeYears, selectedMetric],
  );

  const primaryYearSeries = useMemo(() => {
    if (!primaryYear) return [];
    return buildPrimaryYearSeries(monthFilteredRows, primaryYear);
  }, [monthFilteredRows, primaryYear]);
  const electricitySeries = primaryYearSeries.map((point) => ({ label: point.label, value: point.totalkwh }));
  const waterSeries = primaryYearSeries.map((point) => ({ label: point.label, value: point.water }));

  const isEmpty = !loading && !error && selectedProperty && rows.length === 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {t("utility.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("utility.subtitle")}
        </p>
        </div>
        {selectedProperty && <p className="text-xs font-medium text-muted-foreground">Property: <span className="font-mono text-foreground">{selectedProperty}</span></p>}
      </header>

      {selectedProperty ? (
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
      ) : null}

      {loading && (
        <div className="space-y-4" role="status" aria-busy="true" aria-label={t("utility.loading")}>
          <DashboardKpiSkeleton />
          <SkeletonTable rows={5} columns={4} />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-destructive/30 bg-card p-6" role="alert">
          <h2 className="font-semibold text-destructive">{t("utility.loadError")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("utility.loadErrorHint")}</p>
        </div>
      )}

      {!selectedProperty && !loading && !error && (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            {t("common.selectProperty")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("utility.selectPropertyHint")}
          </p>
        </div>
      )}

      {isEmpty && (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            {t("utility.noData")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("utility.noDataHint")}
          </p>
        </div>
      )}

      {!loading && !error && !isEmpty && (
        <div className="space-y-4 sm:space-y-6">
          <SummaryCards
            summary={summary}
            comparison={comparisonMeta}
            comparisonScopeNote={comparisonScopeNote}
          />

          <div className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-2">
            <YoYLineChart
              data={yoyData}
              years={activeYears}
              metricLabel={metricLabelMap[selectedMetric]}
            />
            <ActualVsBudgetChart
              data={primaryYearSeries}
              yearLabel={primaryYear ? primaryYear.toString() : ""}
            />
          </div>

          <section aria-labelledby="utility-specific-heading" className="space-y-4">
            <div><h2 id="utility-specific-heading" className="text-xl font-semibold text-foreground">{t("utility.utilitySpecificConsumption")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("utility.utilitySpecificHint")}</p></div>
            <div className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-2">
              <MetricLineChart data={electricitySeries} title={t("utility.electricityTrend")} subtitle={`${primaryYear ?? "—"} · kWh`} unit="kWh" color="hsl(var(--primary))" />
              <MetricLineChart data={waterSeries} title={t("utility.waterTrend")} subtitle={`${primaryYear ?? "—"} · m³`} unit="m³" color="hsl(var(--primary))" />
            </div>
          </section>

          <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
            <UtilityBreakdown summary={summary} />
            <BudgetStatusPieChart
              data={budgetStatusPie.data}
              budgetUnsetForAllMonths={budgetStatusPie.budgetUnsetForAllMonths}
            />
          </div>
          <UtilityRecordsTable rows={yearFilteredRows} allRows={rows} />
          <aside className="rounded-xl border border-dashed border-border bg-muted/30 p-4" aria-label={t("utility.futureEnhancement")}><h2 className="text-sm font-semibold text-foreground">{t("utility.futureEnhancement")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("utility.occupancyEnhancement")}</p></aside>
        </div>
      )}
    </div>
  );
}
