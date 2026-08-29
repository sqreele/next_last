"use client";

import React from "react";
import { Search, X, ChevronDown } from "lucide-react";

const getFrequencyText = (freq: string | number) => {
  if (typeof freq === "number") return `Freq ${freq}`;
  if (!freq) return "";
  return freq.charAt(0).toUpperCase() + freq.slice(1);
};

interface FilterState {
  search: string;
  status: string;
  frequency: string | number;
  machine: string;
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
}

type SortField = "date" | "status" | "machine";

interface FilterPanelProps {
  currentFilters?: Partial<FilterState>;
  machineOptions: any[];
  totalCount: number;
  sortBy: SortField;
  sortOrder: "asc" | "desc";
  onFilterChangeAction: (
    key: keyof FilterState,
    value: string | number,
  ) => void;
  onClearFiltersAction: () => void;
  onSortChangeAction: (sortBy: SortField, sortOrder: "asc" | "desc") => void;
}

const defaultFilters: FilterState = {
  search: "",
  status: "",
  frequency: "",
  machine: "",
  startDate: "",
  endDate: "",
  page: 1,
  pageSize: 10,
};

export default function FilterPanel({
  currentFilters = defaultFilters,
  machineOptions,
  totalCount,
  sortBy,
  sortOrder,
  onFilterChangeAction,
  onClearFiltersAction,
  onSortChangeAction,
}: FilterPanelProps) {
  const getMachineNameById = (machineId: string) => {
    const machine = machineOptions.find((m) => m.id === machineId);
    return machine ? machine.name : machineId;
  };

  const handleSortChange = (value: string) => {
    const [field, order] = value.split("-");
    onSortChangeAction(field as SortField, order as "asc" | "desc");
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5" aria-label="Preventive maintenance filters">
      {/* Search */}
      <div className="relative mb-4 min-w-0">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          placeholder="Search maintenance tasks..."
          aria-label="Search preventive maintenance tasks"
          value={currentFilters.search || ""}
          onChange={(e) => onFilterChangeAction("search", e.target.value)}
          className="h-12 w-full min-w-0 rounded-lg border border-input bg-background py-3 pl-10 pr-11 text-base text-foreground shadow-soft transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:text-sm"
        />
        {currentFilters.search && (
          <button
            onClick={() => onFilterChangeAction("search", "")}
            className="absolute right-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Clear maintenance search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {currentFilters.status && (
          <FilterChip
            label={`Status: ${currentFilters.status}`}
            onRemove={() => onFilterChangeAction("status", "")}
            color="blue"
          />
        )}
        {currentFilters.frequency && (
          <FilterChip
            label={`Freq: ${getFrequencyText(currentFilters.frequency)}`}
            onRemove={() => onFilterChangeAction("frequency", "")}
            color="green"
          />
        )}
        {currentFilters.machine && (
          <FilterChip
            label={`Machine: ${getMachineNameById(currentFilters.machine)}`}
            onRemove={() => onFilterChangeAction("machine", "")}
            color="purple"
          />
        )}
      </div>

      {/* Expandable sections */}
      <div className="divide-y divide-border rounded-lg border border-border bg-background px-3 sm:px-4">
        <FilterSection title="Status & Frequency">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              aria-label="Filter by maintenance status"
              value={currentFilters.status || ""}
              onChange={(e) => onFilterChangeAction("status", e.target.value)}
              className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:text-sm"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Upcoming</option>
              <option value="overdue">Overdue</option>
            </select>
            <select
              aria-label="Filter by maintenance frequency"
              value={currentFilters.frequency || ""}
              onChange={(e) =>
                onFilterChangeAction("frequency", e.target.value)
              }
              className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:text-sm"
            >
              <option value="">All Frequencies</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="semi_annual">Semi-Annual</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </FilterSection>

        <FilterSection title="Machine & Dates">
          <div className="space-y-3">
            <select
              aria-label="Filter by machine"
              value={currentFilters.machine || ""}
              onChange={(e) => onFilterChangeAction("machine", e.target.value)}
              className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:text-sm"
            >
              <option value="">All Machines</option>
              {machineOptions.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.label} ({machine.count})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Start Date
                </label>
                <input
                  type="date"
                  value={currentFilters.startDate || ""}
                  onChange={(e) =>
                    onFilterChangeAction("startDate", e.target.value)
                  }
                  className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  End Date
                </label>
                <input
                  type="date"
                  value={currentFilters.endDate || ""}
                  onChange={(e) =>
                    onFilterChangeAction("endDate", e.target.value)
                  }
                  className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:text-sm"
                />
              </div>
            </div>
          </div>
        </FilterSection>

        <FilterSection title="Sort & Display">
          <select
            aria-label="Sort preventive maintenance tasks"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => handleSortChange(e.target.value)}
            className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-soft focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 sm:text-sm"
          >
            <option value="date-desc">Date (Newest First)</option>
            <option value="date-asc">Date (Oldest First)</option>
            <option value="status-asc">Status (A-Z)</option>
            <option value="status-desc">Status (Z-A)</option>
            <option value="machine-asc">Machine (A-Z)</option>
            <option value="machine-desc">Machine (Z-A)</option>
          </select>
        </FilterSection>
      </div>

      {/* Filter actions */}
      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0 text-sm text-muted-foreground">
          {totalCount} tasks found
          {currentFilters.machine && (
            <span className="mt-1 block break-words font-semibold text-primary">
              Filtered by: {getMachineNameById(currentFilters.machine)}
            </span>
          )}
        </span>
        <button
          onClick={onClearFiltersAction}
          className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 hover:text-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Clear all
        </button>
      </div>
    </section>
  );
}

// Helper components
function FilterChip({
  label,
  onRemove,
  color,
}: {
  label: string;
  onRemove: () => void;
  color: string;
}) {
  const colorClasses = {
    blue: "bg-primary/10 text-primary",
    green: "bg-success/10 text-success",
    purple: "bg-info/10 text-info",
  };

  return (
    <div
      className={`flex min-h-9 max-w-full items-center rounded-full px-3 py-1 text-sm ${colorClasses[color as keyof typeof colorClasses]}`}
    >
      <span className="min-w-0 break-words">{label}</span>
      <button onClick={onRemove} className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remove ${label} filter`}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="font-semibold text-foreground">{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
  );
}
