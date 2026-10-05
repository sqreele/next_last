"use client";

import Link from "next/link";
import { BarChart3, RefreshCw, Filter, Plus, CalendarDays, Repeat2 } from "lucide-react";
import { useT } from "@/app/lib/i18n/LocaleProvider";

interface MobileHeaderProps {
  totalCount: number;
  overdueCount?: number;
  currentFilters: { machine?: string };
  isLoading: boolean;
  showFilters: boolean;
  activeFiltersCount: number;
  canOperate: boolean;
  onRefresh: () => void;
  onToggleFilters: () => void;
}

export default function MobileHeader({
  totalCount,
  overdueCount,
  currentFilters,
  isLoading,
  showFilters,
  activeFiltersCount,
  canOperate,
  onRefresh,
  onToggleFilters,
}: MobileHeaderProps) {
  const t = useT();
  return (
    <header className="rounded-xl border border-border bg-card p-4 shadow-soft md:hidden">
      <div className="space-y-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("pm.workspace")}
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight tracking-tight text-foreground">
            {t("pm.title")}
          </h1>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {t("pm.tasksOverdue", { tasks: totalCount, overdue: overdueCount === undefined ? "…" : overdueCount })}
            {currentFilters.machine && (
              <span className="font-semibold text-primary"> • {t("pm.filtered")}</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/dashboard/preventive-maintenance/dashboard"
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background px-1 text-muted-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title={t("pm.dashboard")}
            aria-label={t("pm.dashboard")}
          >
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
            <span className="text-center text-[11px] font-semibold leading-tight">{t("pm.dashboard")}</span>
          </Link>
          <Link
            href="/dashboard/preventive-maintenance/schedule"
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background px-1 text-muted-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title={t("nav.calendar")}
            aria-label={t("nav.calendar")}
          >
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            <span className="text-center text-[11px] font-semibold leading-tight">{t("nav.calendar")}</span>
          </Link>
          <Link
            href="/dashboard/preventive-maintenance/plans"
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background px-1 text-muted-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title={t("pm.masterPlans")}
            aria-label={t("pm.masterPlans")}
          >
            <Repeat2 className="h-5 w-5" aria-hidden="true" />
            <span className="text-center text-[11px] font-semibold leading-tight">{t("pm.masterPlans")}</span>
          </Link>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background px-1 text-muted-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            title={t("action.refresh")}
            aria-label={t("action.refresh")}
          >
            <RefreshCw
              className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span className="text-center text-[11px] font-semibold leading-tight">{t("action.refresh")}</span>
          </button>
          <button
            onClick={onToggleFilters}
            className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-1 shadow-soft transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              showFilters
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            }`}
            aria-label={t("action.filter")}
          >
            <Filter className="h-5 w-5" aria-hidden="true" />
            <span className="text-center text-[11px] font-semibold leading-tight">{t("action.filter")}</span>
            {activeFiltersCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {canOperate && (
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-primary bg-primary px-1 text-primary-foreground shadow-soft transition-colors hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t("action.create")}
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              <span className="text-center text-[11px] font-semibold leading-tight">{t("action.create")}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
