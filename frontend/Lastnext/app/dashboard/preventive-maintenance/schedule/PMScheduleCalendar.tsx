"use client";
import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Plus,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils/cn";
import { useMainStore } from "@/app/lib/stores/mainStore";
import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import { StatusBadge } from "@/app/components/StatusBadge";

type StatusFilter = "open" | "completed" | "all";

interface PMItem {
  pm_id?: string | null;
  plan_id?: string;
  pmtitle?: string;
  scheduled_date?: string;
  completed_date?: string | null;
  next_due_date?: string | null;
  status?: string;
  frequency?: string;
  priority?: string;
  calendar_date?: string;
  occurrence_type?: "scheduled" | "next_due" | "projected" | "generated";
  calendar_status?: "open" | "completed" | "cancelled" | "projected" | "generated";
  generated_pm_id?: string | null;
  lead_time_days?: number;
  machines?: Array<{ machine_id: string; name?: string }>;
  procedure_template_name?: string | null;
  assigned_to_name?: string | null;
}

interface DayBucket {
  date: string;
  weekday: string;
  items: PMItem[];
  overdue_count: number;
  open_count: number;
  completed_count: number;
  cancelled_count: number;
}

interface ScheduleResponse {
  from: string;
  to: string;
  days: DayBucket[];
  total: number;
  status: StatusFilter;
  property_id: string;
  property_name: string;
  timezone: string;
  today: string;
  can_operate: boolean;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function PMScheduleCalendar() {
  const { locale, t } = useLocale();
  const dateLocale = locale === "th" ? "th-TH-u-ca-gregory" : "en-US";
  const selectedPropertyId = useMainStore((state) => state.selectedPropertyId);
  const properties = useMainStore((state) => state.properties);
  const activeProperty = properties.find((property) => property.property_id === selectedPropertyId);
  const [anchor, setAnchor] = useState<{ propertyId: string; date: Date } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const detailsRef = useRef<HTMLElement | null>(null);
  const visibleData = data?.property_id === selectedPropertyId ? data : null;

  const activeAnchor = anchor?.propertyId === selectedPropertyId ? anchor.date : null;
  const gridStart = useMemo(
    () => activeAnchor || startOfWeekMonday(parseISODate(visibleData?.from || toISODate(new Date()))),
    [activeAnchor, visibleData?.from],
  );
  const gridCells = useMemo(() => {
    const cells: Date[] = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [gridStart, days]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedPropertyId) {
      setData(null);
      setLoading(false);
      setError(null);
      setSelectedDate(null);
      return;
    }
    setData(null);
    setSelectedDate(null);
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      days: String(Math.min(days, 180)),
      status: statusFilter,
      property_id: selectedPropertyId,
    });
    // Keep user navigation on exact, contiguous windows. Re-aligning every
    // 30/60/180-day jump to Monday creates overlapping or missing dates.
    if (activeAnchor) params.set("from", toISODate(activeAnchor));
    const url = `/api/v1/preventive-maintenance/schedule/?${params.toString()}`;
    fetch(url, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load PM schedule: ${response.status}`);
        return response.json() as Promise<ScheduleResponse>;
      })
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch(() => {
        if (cancelled) return;
        setError("pmSchedule.loadError");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeAnchor,
    days,
    refreshKey,
    statusFilter,
    selectedPropertyId,
  ]);

  const dayIndex = useMemo(() => {
    const map = new Map<string, DayBucket>();
    visibleData?.days.forEach((b) => map.set(b.date, b));
    return map;
  }, [visibleData]);

  const selectedBucket = selectedDate ? dayIndex.get(selectedDate) : null;
  const todayKey = visibleData?.today || toISODate(new Date());
  const windowLabel = `${gridStart.toLocaleDateString(dateLocale, { month: "short", day: "numeric" })} – ${gridCells[gridCells.length - 1]?.toLocaleDateString(dateLocale, { month: "short", day: "numeric" })}`;
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day.toLocaleDateString(dateLocale, { weekday: "short" });
  });

  const totalOpen = useMemo(
    () => (visibleData?.days || []).reduce((sum, b) => sum + b.open_count, 0),
    [visibleData],
  );
  const totalOverdue = useMemo(
    () => (visibleData?.days || []).reduce((sum, b) => sum + b.overdue_count, 0),
    [visibleData],
  );
  const totalCompleted = useMemo(
    () => (visibleData?.days || []).reduce((sum, b) => sum + b.completed_count, 0),
    [visibleData],
  );
  const totalCancelled = useMemo(
    () => (visibleData?.days || []).reduce((sum, b) => sum + b.cancelled_count, 0),
    [visibleData],
  );

  const agendaDays = useMemo(
    () => gridCells
      .map((date) => ({ date, bucket: dayIndex.get(toISODate(date)) }))
      .filter(({ bucket }) => (bucket?.items.length || 0) > 0),
    [dayIndex, gridCells],
  );

  const selectDate = (date: string) => {
    const nextDate = selectedDate === date ? null : date;
    setSelectedDate(nextDate);
    if (nextDate && typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      window.requestAnimationFrame(() => {
        detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  if (!selectedPropertyId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <CalendarDays className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{t("common.selectProperty")}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("pmSchedule.selectPropertyHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-busy={loading}>
      <header className="flex flex-col gap-3 rounded-[18px] border border-[var(--pcms-border)] bg-white/90 p-4 shadow-[var(--pcms-shadow-sm)] backdrop-blur-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                {t("pmSchedule.title")}
              </h1>
              <p className="mt-0.5 break-words text-xs font-medium text-slate-600 sm:text-sm">
                {visibleData?.property_name || activeProperty?.name || selectedPropertyId} ·{" "}
                {visibleData?.timezone || t("pmSchedule.propertyTimezone")} · {t("pmSchedule.days", { count: days })}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {visibleData?.can_operate && <Link
              href="/dashboard/preventive-maintenance/create"
              className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-[var(--pcms-primary)] px-3 text-sm font-bold text-white transition-colors hover:bg-[var(--pcms-primary-hover)] sm:rounded-full"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> {t("pmSchedule.newPm")}
            </Link>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAnchor(null);
                setRefreshKey((value) => value + 1);
              }}
              className={cn("h-11 rounded-xl sm:rounded-full", !visibleData?.can_operate && "col-span-2 sm:col-span-1")}
            >
              {t("action.today")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(gridStart);
                d.setDate(d.getDate() - days);
                setAnchor({ propertyId: selectedPropertyId, date: d });
              }}
              aria-label={t("action.previous")}
              className="h-11 w-11 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(gridStart);
                d.setDate(d.getDate() + days);
                setAnchor({ propertyId: selectedPropertyId, date: d });
              }}
              aria-label={t("action.next")}
              className="h-11 w-11 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-1 min-w-0 truncate rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 sm:ml-2">
              {visibleData ? windowLabel : t("pmSchedule.loadingRange")}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
            <div className="col-span-2 grid grid-cols-3 rounded-xl bg-slate-100 p-1 sm:col-span-1 sm:flex sm:rounded-full" role="group" aria-label={t("pmSchedule.statusFilter")}>
              {(["open", "completed", "all"] as StatusFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={statusFilter === value}
                  className={cn(
                    "h-10 rounded-lg px-3 text-xs font-bold transition-colors sm:rounded-full",
                    statusFilter === value
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-700 hover:bg-white/80",
                  )}
                >
                  {value === "all"
                    ? t("common.all")
                    : value === "open"
                      ? t("status.open")
                      : t("status.completed")}
                </button>
              ))}
            </div>
            <div className="flex min-h-11 items-center justify-between gap-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 sm:justify-start sm:rounded-full">
              <span className="pl-1">{t("pmSchedule.daysLabel")}</span>
              {[30, 60, 180].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDays(value)}
                  className={cn(
                    "min-h-9 min-w-9 rounded-lg px-2 py-0.5 transition-colors sm:rounded-full",
                    days === value
                      ? "bg-slate-900 text-white"
                      : "hover:bg-slate-100",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loading}
              className="h-11 w-11 rounded-xl p-0 sm:rounded-full"
              aria-label={t("action.refresh")}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
              />
            </Button>
          </div>
        </div>

        {visibleData && <div className="grid grid-cols-2 gap-2 text-xs font-bold sm:grid-cols-4" role="group" aria-label={t("pmSchedule.summary")}>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-blue-900">
            {t("status.open")} · {totalOpen}
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-900">
            {t("status.overdue")} · {totalOverdue}
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-900">
            {t("status.completed")} · {totalCompleted}
          </div>
          <div className="rounded-xl border border-slate-300 bg-slate-100 px-3 py-2.5 text-slate-800">
            {t("status.cancelled")} · {totalCancelled}
          </div>
        </div>}
      </header>

      {error && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            {t("pmSchedule.loadError")}
          </span>
          <Button type="button" variant="outline" size="sm" className="h-10 border-red-200 bg-white" onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("action.tryAgain")}
          </Button>
        </div>
      )}

      {loading && !visibleData ? (
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm font-medium text-slate-600 shadow-xs" role="status">
          <BouncingDotsLoader size="sm" label={t("pmSchedule.loading")} />
        </div>
      ) : error && !visibleData ? null : <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4" aria-label={t("pmSchedule.calendarLabel")}>
        <div className="hidden grid-cols-7 gap-1 pb-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:grid" aria-hidden="true">
          {weekdayLabels.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div
          className={cn(
            "hidden gap-1 sm:grid sm:grid-cols-7",
            loading && "opacity-70",
          )}
        >
          {gridCells.map((date) => {
            const key = toISODate(date);
            const bucket = dayIndex.get(key);
            const isToday = key === todayKey;
            const isSelected = selectedDate === key;
            const inPast = key < todayKey;
            const totalItems = bucket?.items.length || 0;
            const overdue = bucket?.overdue_count || 0;
            const open = bucket?.open_count || 0;
            const completed = bucket?.completed_count || 0;
            const cancelled = bucket?.cancelled_count || 0;
            const previewItems = bucket?.items.slice(0, 2) || [];
            const hiddenItems = Math.max(0, totalItems - previewItems.length);
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectDate(key)}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${key}: ${t("pmSchedule.itemCount", { count: totalItems })}, ${t("pmSchedule.openCount", { count: open })}, ${t("pmSchedule.completedCount", { count: completed })}, ${t("pmSchedule.cancelledCount", { count: cancelled })}${overdue ? `, ${t("pmSchedule.overdueCount", { count: overdue })}` : ""}`}
                className={cn(
                  "group min-h-32 overflow-hidden rounded-xl border-2 p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
                  isSelected
                    ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
                    : "border-slate-200 bg-white hover:border-slate-300",
                  totalItems === 0 && "bg-slate-50",
                  overdue > 0 && !isSelected && "border-rose-300 bg-rose-50/40",
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span
                    className={cn(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-black",
                      isToday
                        ? "bg-blue-600 text-white"
                        : inPast
                          ? "text-slate-500"
                          : "text-slate-900",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {date.toLocaleDateString(dateLocale, { month: "short" })}
                  </span>
                </div>
                <div className="mt-1 flex flex-1 flex-col gap-0.5 text-[11px] font-bold">
                  {overdue > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                      {t("pmSchedule.overdueCount", { count: overdue })}
                    </span>
                  )}
                  {open > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      {t("pmSchedule.openCount", { count: open })}
                    </span>
                  )}
                  {completed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      {t("pmSchedule.completedCount", { count: completed })}
                    </span>
                  )}
                  {cancelled > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-slate-800">
                      {t("pmSchedule.cancelledCount", { count: cancelled })}
                    </span>
                  )}
                  {previewItems.length > 0 && (
                    <div className="mt-1 space-y-0.5 overflow-hidden">
                      {previewItems.map((item) => (
                        <div
                          key={`${item.pm_id || item.plan_id}-${item.calendar_date || item.scheduled_date}-${item.occurrence_type || "scheduled"}`}
                          className={cn(
                            "truncate rounded-md px-1.5 py-0.5 text-[10px] font-extrabold leading-4",
                            item.calendar_status === "cancelled"
                              ? "bg-slate-200 text-slate-800 line-through"
                              : item.occurrence_type === "projected"
                              ? "bg-purple-100 text-purple-900"
                              : item.occurrence_type === "next_due"
                                ? "bg-amber-100 text-amber-900"
                                : item.calendar_status === "completed"
                                  ? "bg-emerald-100 text-emerald-900"
                                  : "bg-blue-100 text-blue-900",
                          )}
                          title={`${item.occurrence_type === "projected" ? t("pmSchedule.projected") : item.occurrence_type === "next_due" ? t("pmSchedule.nextDue") : t("status.scheduled")}: ${item.pmtitle || item.pm_id || item.plan_id}`}
                        >
                          {item.occurrence_type === "projected"
                            ? t("pmSchedule.planPrefix")
                            : item.occurrence_type === "next_due"
                              ? `${t("pmSchedule.nextDue")}: `
                              : ""}
                          {item.pmtitle || `#${item.pm_id || item.plan_id}`}
                        </div>
                      ))}
                      {hiddenItems > 0 && (
                        <div className="px-1.5 text-[10px] font-bold text-slate-500">
                          {t("pmSchedule.more", { count: hiddenItems })}
                        </div>
                      )}
                    </div>
                  )}
                  {totalItems === 0 && !loading && (
                    <span className="text-[10px] font-medium text-slate-400">
                      {t("pmSchedule.noPm")}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className={cn("space-y-2 sm:hidden", loading && "opacity-70")}>
          {agendaDays.length === 0 && !loading ? (
            <div className="rounded-xl bg-slate-50 px-4 py-10 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-600">{t("pmSchedule.noScheduled")}</p>
            </div>
          ) : agendaDays.map(({ date, bucket }) => {
            if (!bucket) return null;
            const key = toISODate(date);
            const isToday = key === todayKey;
            const isSelected = selectedDate === key;
            const firstItem = bucket.items[0];
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectDate(key)}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  isSelected ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200" : "border-slate-200 bg-white active:bg-slate-50",
                  bucket.overdue_count > 0 && !isSelected && "border-rose-300 bg-rose-50/40",
                )}
              >
                <span className={cn(
                  "grid h-12 w-12 flex-none place-items-center rounded-xl text-center",
                  isToday ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900",
                )}>
                  <span>
                    <span className="block text-lg font-black leading-5">{date.getDate()}</span>
                    <span className="block text-[10px] font-bold uppercase leading-3">{date.toLocaleDateString(dateLocale, { month: "short" })}</span>
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{date.toLocaleDateString(dateLocale, { weekday: "long" })}</span>
                    <span className="text-xs font-bold text-slate-500">{t("pmSchedule.itemCount", { count: bucket.items.length })}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {bucket.overdue_count > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">{t("pmSchedule.overdueCount", { count: bucket.overdue_count })}</span>}
                    {bucket.open_count > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">{t("pmSchedule.openCount", { count: bucket.open_count })}</span>}
                    {bucket.completed_count > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">{t("pmSchedule.completedCount", { count: bucket.completed_count })}</span>}
                    {bucket.cancelled_count > 0 && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-800">{t("pmSchedule.cancelledCount", { count: bucket.cancelled_count })}</span>}
                  </span>
                  {firstItem && <span className="mt-1.5 block truncate text-xs font-medium text-slate-600">{firstItem.pmtitle || t("pmSchedule.defaultTitle")}{bucket.items.length > 1 ? ` · ${t("pmSchedule.more", { count: bucket.items.length - 1 })}` : ""}</span>}
                </span>
                <ChevronRight className="mt-4 h-4 w-4 flex-none text-slate-400" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        {visibleData?.total === 0 && <p className="hidden pt-4 text-center text-sm font-medium text-slate-500 sm:block">{t("pmSchedule.noScheduled")}</p>}
      </section>}

      {selectedBucket && (
        <section
          ref={detailsRef}
          aria-label={`Items on ${selectedDate}`}
          className="scroll-mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                {parseISODate(selectedBucket.date).toLocaleDateString(dateLocale, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h2>
              <p className="text-xs font-medium text-slate-500">
                {t("pmSchedule.itemsOnDay", { count: selectedBucket.items.length })}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 flex-none"
              onClick={() => setSelectedDate(null)}
            >
              {t("action.close")}
            </Button>
          </div>
          {selectedBucket.items.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm font-medium text-slate-500">
              {t("pmSchedule.noneOnDay")}
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedBucket.items.map((item) => {
                const targetPmId = item.generated_pm_id || item.pm_id;
                const itemKey = `${targetPmId || item.plan_id}-${item.calendar_date || item.scheduled_date}`;
                const cardBody = (
                  <>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 line-clamp-2">
                        {item.pmtitle || t("pmSchedule.defaultTitle")}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {targetPmId
                          ? `#${targetPmId}`
                          : `Plan #${item.plan_id}`}{" "}
                        · {item.frequency || t("pmSchedule.oneOff")}
                      </p>
                      <StatusBadge className="mt-1" size="sm" status={item.calendar_status || item.status || "open"} />
                      {item.machines && item.machines.length > 0 && (
                        <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-600">
                          {t("pmSchedule.machines", { names: item.machines.map((machine) => machine.name || machine.machine_id).join(", ") })}
                        </p>
                      )}
                      {item.assigned_to_name && <p className="mt-1 text-xs font-medium text-slate-600">{t("pmSchedule.assignedTo", { name: item.assigned_to_name })}</p>}
                      {item.calendar_date && (
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          {item.occurrence_type === "projected"
                            ? t("pmSchedule.projected")
                            : item.occurrence_type === "next_due"
                              ? t("pmSchedule.nextDue")
                              : t("status.scheduled")}{" "}
                          ·{" "}
                          {new Date(item.calendar_date).toLocaleTimeString(
                            dateLocale,
                            {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: visibleData?.timezone,
                            },
                          )}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                      {targetPmId ? t("action.viewDetails") : t("pmSchedule.viewPlan")}{" "}
                      <ArrowRight className="h-3 w-3 flex-none" aria-hidden="true" />
                    </span>
                  </>
                );
                return (
                  <li key={itemKey}>
                    {targetPmId ? (
                      <Link
                        href={`/dashboard/preventive-maintenance/${targetPmId}`}
                        className="flex min-h-11 flex-col items-stretch gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-slate-300 hover:bg-slate-50 sm:flex-row sm:items-start sm:justify-between"
                      >
                        {cardBody}
                      </Link>
                    ) : item.plan_id ? (
                      <Link
                        href={`/dashboard/preventive-maintenance/${item.plan_id}`}
                        className="flex min-h-11 flex-col items-stretch gap-3 rounded-xl border border-purple-200 bg-purple-50/50 p-3 transition-colors hover:border-purple-300 hover:bg-purple-50 sm:flex-row sm:items-start sm:justify-between"
                      >
                        {cardBody}
                      </Link>
                    ) : (
                      <div className="flex flex-col items-stretch gap-3 rounded-xl border border-purple-200 bg-purple-50/50 p-3 sm:flex-row sm:items-start sm:justify-between">{cardBody}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-600">
        <Sparkles className="mr-1 inline h-3 w-3 text-blue-500" aria-hidden="true" />
        {t("pmSchedule.tip")}
      </div>
    </div>
  );
}
