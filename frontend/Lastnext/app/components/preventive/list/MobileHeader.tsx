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
    <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-4 md:hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Maintenance</h1>
          <p className="text-sm text-muted-foreground">
            {totalCount} tasks • {overdueCount} overdue
            {currentFilters.machine && (
              <span className="text-blue-600"> • Filtered</span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link
            href="/dashboard/preventive-maintenance"
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
            title="Dashboard"
            aria-label="Open maintenance dashboard"
          >
            <BarChart3 className="h-5 w-5" />
          </Link>
          <Link
            href="/dashboard/preventive-maintenance/schedule"
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
            title="Calendar"
            aria-label="Open maintenance calendar"
          >
            <CalendarDays className="h-5 w-5" />
          </Link>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-50 rounded-lg hover:bg-muted transition-colors"
            title="Refresh"
            aria-label="Refresh maintenance data"
          >
            <RefreshCw
              className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={onToggleFilters}
            className={`relative p-2 rounded-lg transition-colors ${
              showFilters
                ? "bg-blue-50 text-blue-700"
                : "text-muted-foreground hover:bg-muted"
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
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            aria-label="Create new maintenance task"
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
