"use client";

import Link from "next/link";
import {
  BarChart3,
  RefreshCw,
  Filter,
  Plus,
  CalendarDays,
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
    <div className="hidden md:block container w-full max-w-none px-3 sm:px-6 lg:mx-auto lg:max-w-7xl py-8">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Preventive Maintenance
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your scheduled maintenance tasks
            {currentFilters.machine && (
              <span className="text-blue-600 font-medium">
                {" "}
                • Filtered by: {getMachineNameById(currentFilters.machine)}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/dashboard/preventive-maintenance/dashboard"
            className="flex items-center px-4 py-2 border border-border text-muted-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </Link>

          <Link
            href="/dashboard/preventive-maintenance/schedule"
            className="flex items-center px-4 py-2 border border-border text-muted-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            Calendar
          </Link>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center px-4 py-2 border border-border text-muted-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh Data"
            aria-label="Refresh maintenance data"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>

          <button
            onClick={onToggleFilters}
            className={`flex items-center px-4 py-2 border rounded-lg transition-colors ${
              showFilters
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
            aria-label="Toggle maintenance filters"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {canOperate && (
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Maintenance
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
