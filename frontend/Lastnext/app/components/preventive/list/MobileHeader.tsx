"use client";

import Link from "next/link";
import { BarChart3, RefreshCw, Filter, Plus, CalendarDays } from "lucide-react";

interface MobileHeaderProps {
  totalCount: number;
  overdueCount: number;
  currentFilters: any;
  isLoading: boolean;
  showFilters: boolean;
  activeFiltersCount: number;
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
  onRefresh,
  onToggleFilters,
}: MobileHeaderProps) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 shadow-soft md:hidden">
      <div className="space-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-foreground">
            Preventive Maintenance
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalCount} tasks • {overdueCount} overdue
            {currentFilters.machine && (
              <span className="text-blue-600"> • Filtered</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <Link
            href="/dashboard/preventive-maintenance/dashboard"
            className="grid h-11 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Dashboard"
            aria-label="Open maintenance dashboard"
          >
            <BarChart3 className="h-5 w-5" />
          </Link>
          <Link
            href="/dashboard/preventive-maintenance/schedule"
            className="grid h-11 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Calendar"
            aria-label="Open maintenance calendar"
          >
            <CalendarDays className="h-5 w-5" />
          </Link>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="grid h-11 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Refresh"
            aria-label="Refresh maintenance data"
          >
            <RefreshCw
              className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={onToggleFilters}
            className={`relative grid h-11 place-items-center rounded-lg border transition-colors ${
              showFilters
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
            aria-label="Toggle maintenance filters"
          >
            <Filter className="h-5 w-5" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <Link
            href="/dashboard/preventive-maintenance/create"
            className="grid h-11 place-items-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700"
            aria-label="Create new maintenance task"
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
