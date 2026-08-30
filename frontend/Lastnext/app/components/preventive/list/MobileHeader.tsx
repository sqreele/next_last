"use client";

import Link from "next/link";
import { BarChart3, RefreshCw, Filter, Plus, CalendarDays, Repeat2 } from "lucide-react";

interface MobileHeaderProps {
  totalCount: number;
  overdueCount?: number;
  currentFilters: any;
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
  return (
    <header className="rounded-xl border border-border bg-card p-4 shadow-soft md:hidden">
      <div className="space-y-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Maintenance workspace
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight tracking-tight text-foreground">
            Preventive Maintenance
          </h1>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {totalCount} tasks • {overdueCount === undefined ? "…" : overdueCount} overdue
            {currentFilters.machine && (
              <span className="font-semibold text-primary"> • Filtered</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/dashboard/preventive-maintenance/dashboard"
            className="grid min-h-11 place-items-center rounded-lg border border-border bg-background text-muted-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title="Dashboard"
            aria-label="Open maintenance dashboard"
          >
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link
            href="/dashboard/preventive-maintenance/schedule"
            className="grid min-h-11 place-items-center rounded-lg border border-border bg-background text-muted-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title="Calendar"
            aria-label="Open maintenance calendar"
          >
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link
            href="/dashboard/preventive-maintenance/plans"
            className="grid min-h-11 place-items-center rounded-lg border border-border bg-background text-muted-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title="Master Plans"
            aria-label="Open PM master plans"
          >
            <Repeat2 className="h-5 w-5" aria-hidden="true" />
          </Link>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="grid min-h-11 place-items-center rounded-lg border border-border bg-background text-muted-foreground shadow-soft transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh"
            aria-label="Refresh maintenance data"
          >
            <RefreshCw
              className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
          <button
            onClick={onToggleFilters}
            className={`relative grid min-h-11 place-items-center rounded-lg border shadow-soft transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              showFilters
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            }`}
            aria-label="Toggle maintenance filters"
          >
            <Filter className="h-5 w-5" aria-hidden="true" />
            {activeFiltersCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {canOperate && (
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="grid min-h-11 place-items-center rounded-lg border border-primary bg-primary text-primary-foreground shadow-soft transition-colors hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Create new maintenance task"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
