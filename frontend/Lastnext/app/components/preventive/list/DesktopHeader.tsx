"use client";

import Link from "next/link";
import {
  BarChart3,
  RefreshCw,
  Filter,
  Plus,
  CalendarDays,
  Repeat2,
} from "lucide-react";

interface DesktopHeaderProps {
  currentFilters: any;
  isLoading: boolean;
  showFilters: boolean;
  activeFiltersCount: number;
  canOperate: boolean;
  getMachineNameById: (id: string) => string;
  onRefresh: () => void;
  onToggleFilters: () => void;
}

export default function DesktopHeader({
  currentFilters,
  isLoading,
  showFilters,
  activeFiltersCount,
  canOperate,
  getMachineNameById,
  onRefresh,
  onToggleFilters,
}: DesktopHeaderProps) {
  return (
    <header className="mx-auto hidden w-full max-w-7xl py-3 md:block">
      <div className="flex flex-col gap-5 border-b border-border pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Maintenance workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            Preventive Maintenance
          </h1>
          <p className="mt-2 text-base leading-6 text-muted-foreground">
            Manage your scheduled maintenance tasks
            {currentFilters.machine && (
              <span className="font-semibold text-primary">
                {" "}
                • Filtered by: {getMachineNameById(currentFilters.machine)}
              </span>
            )}
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:flex-wrap xl:w-auto xl:shrink-0">
          <Link
            href="/dashboard/preventive-maintenance/dashboard"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Link>

          <Link
            href="/dashboard/preventive-maintenance/schedule"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Calendar
          </Link>

          <Link
            href="/dashboard/preventive-maintenance/plans"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Repeat2 className="h-4 w-4" aria-hidden="true" />
            Master Plans
          </Link>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh Data"
            aria-label="Refresh maintenance data"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </button>

          <button
            onClick={onToggleFilters}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              showFilters
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            }`}
            aria-label="Toggle maintenance filters"
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {canOperate && (
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Maintenance
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
