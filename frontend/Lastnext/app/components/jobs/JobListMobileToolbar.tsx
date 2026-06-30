'use client';

import React, { useMemo, useState } from 'react';
import {
  Search,
  Filter as FilterIcon,
  ArrowDownUp,
  CheckSquare,
  X,
  Calendar as CalendarIcon,
  Sparkles,
} from 'lucide-react';
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
} from '@/app/components/ui/bottom-sheet';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Badge } from '@/app/components/ui/badge';
import { StatusBadge, PriorityBadge } from '@/app/components/pcms-ui';
import { JobStatus, JobPriority, SortOrder } from '@/app/lib/types';
import { cn } from '@/app/lib/utils/cn';

export type DateFilter = 'all' | 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'custom';

export interface JobListFilters {
  search: string;
  statuses: JobStatus[];
  priorities: JobPriority[];
  pmOnly: boolean | null;
  defectOnly: boolean | null;
  dateFilter: DateFilter;
}

interface JobListMobileToolbarProps {
  filters: JobListFilters;
  onFiltersChange: (filters: JobListFilters) => void;
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
  selectionEnabled: boolean;
  onToggleSelection: () => void;
  resultCount: number;
  className?: string;
}

const ALL_STATUSES: JobStatus[] = [
  'pending',
  'in_progress',
  'waiting_sparepart',
  'completed',
  'cancelled',
];

const ALL_PRIORITIES: JobPriority[] = ['low', 'medium', 'high'];

const DATE_OPTIONS: Array<{ value: DateFilter; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'thisMonth', label: 'This month' },
];

function countActive(filters: JobListFilters): number {
  let n = 0;
  if (filters.search.trim()) n += 1;
  if (filters.statuses.length) n += 1;
  if (filters.priorities.length) n += 1;
  if (filters.pmOnly !== null) n += 1;
  if (filters.defectOnly !== null) n += 1;
  if (filters.dateFilter !== 'all') n += 1;
  return n;
}

export function JobListMobileToolbar({
  filters,
  onFiltersChange,
  sortOrder,
  onSortChange,
  selectionEnabled,
  onToggleSelection,
  resultCount,
  className,
}: JobListMobileToolbarProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<JobListFilters>(filters);

  React.useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const activeCount = useMemo(() => countActive(filters), [filters]);

  const applyDraft = () => {
    onFiltersChange(draft);
    setOpen(false);
  };

  const clearAll = () => {
    const cleared: JobListFilters = {
      search: '',
      statuses: [],
      priorities: [],
      pmOnly: null,
      defectOnly: null,
      dateFilter: 'all',
    };
    setDraft(cleared);
    onFiltersChange(cleared);
  };

  const toggleStatus = (value: JobStatus) => {
    setDraft((d) => ({
      ...d,
      statuses: d.statuses.includes(value)
        ? d.statuses.filter((s) => s !== value)
        : [...d.statuses, value],
    }));
  };
  const togglePriority = (value: JobPriority) => {
    setDraft((d) => ({
      ...d,
      priorities: d.priorities.includes(value)
        ? d.priorities.filter((s) => s !== value)
        : [...d.priorities, value],
    }));
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="Search jobs, rooms, topics..."
            className="h-11 rounded-xl border-2 border-slate-200 bg-white pl-9 text-sm"
            aria-label="Search jobs"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, search: '' })}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          className="relative h-11 w-11 flex-none rounded-xl border-2 border-slate-200 bg-white p-0"
          aria-label={`Open filters${activeCount ? `, ${activeCount} active` : ''}`}
        >
          <FilterIcon className="h-4 w-4" aria-hidden="true" />
          {activeCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-600">
        <span>{resultCount} jobs</span>
        <div className="flex flex-none items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSortChange(sortOrder === 'Newest first' ? 'Oldest first' : 'Newest first')}
            className="h-9 rounded-full border-slate-200 bg-white px-3 text-xs font-bold"
            aria-label={`Sort: ${sortOrder}, tap to flip`}
          >
            <ArrowDownUp className="mr-1 h-3.5 w-3.5" />
            {sortOrder === 'Newest first' ? 'Newest' : 'Oldest'}
          </Button>
          <Button
            type="button"
            variant={selectionEnabled ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleSelection}
            className={cn(
              'h-9 rounded-full px-3 text-xs font-bold',
              selectionEnabled
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'border-slate-200 bg-white',
            )}
          >
            <CheckSquare className="mr-1 h-3.5 w-3.5" />
            {selectionEnabled ? 'Done' : 'Select'}
          </Button>
        </div>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.statuses.map((status) => (
            <button
              key={`fs-${status}`}
              type="button"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  statuses: filters.statuses.filter((s) => s !== status),
                })
              }
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
              aria-label={`Remove status filter ${status}`}
            >
              <StatusBadge status={status} size="sm" />
              <X className="h-3 w-3" />
            </button>
          ))}
          {filters.priorities.map((priority) => (
            <button
              key={`fp-${priority}`}
              type="button"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  priorities: filters.priorities.filter((s) => s !== priority),
                })
              }
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
              aria-label={`Remove priority filter ${priority}`}
            >
              <PriorityBadge priority={priority} />
              <X className="h-3 w-3" />
            </button>
          ))}
          {filters.dateFilter !== 'all' && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, dateFilter: 'all' })}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
            >
              <CalendarIcon className="h-3 w-3" />
              {DATE_OPTIONS.find((d) => d.value === filters.dateFilter)?.label}
              <X className="h-3 w-3" />
            </button>
          )}
          {filters.pmOnly !== null && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, pmOnly: null })}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
            >
              {filters.pmOnly ? 'PM only' : 'Non-PM only'}
              <X className="h-3 w-3" />
            </button>
          )}
          {filters.defectOnly !== null && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, defectOnly: null })}
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
            >
              {filters.defectOnly ? 'Defective' : 'Non-defective'}
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-[11px] font-bold text-rose-700 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent>
          <BottomSheetHeader>
            <BottomSheetTitle>Filter jobs</BottomSheetTitle>
            <BottomSheetDescription>
              Choose any combination. Tap Apply when ready.
            </BottomSheetDescription>
          </BottomSheetHeader>

          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</h3>
              <div className="flex flex-wrap gap-2">
                {ALL_STATUSES.map((status) => {
                  const active = draft.statuses.includes(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => toggleStatus(status)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-xl border-2 p-1.5 transition-all touch-manipulation',
                        active
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <StatusBadge status={status} size="sm" />
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Priority</h3>
              <div className="flex flex-wrap gap-2">
                {ALL_PRIORITIES.map((priority) => {
                  const active = draft.priorities.includes(priority);
                  return (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => togglePriority(priority)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-xl border-2 p-1.5 transition-all touch-manipulation',
                        active
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <PriorityBadge priority={priority} />
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Date created</h3>
              <div className="grid grid-cols-2 gap-2">
                {DATE_OPTIONS.map((option) => {
                  const active = draft.dateFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDraft({ ...draft, dateFilter: option.value })}
                      aria-pressed={active}
                      className={cn(
                        'min-h-[44px] rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all touch-manipulation',
                        active
                          ? 'border-blue-600 bg-blue-50 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Job type</h3>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: 'Any', value: null },
                  { label: 'PM only', value: true },
                  { label: 'Non-PM', value: false },
                ] as const).map((option) => {
                  const active = draft.pmOnly === option.value;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      onClick={() => setDraft({ ...draft, pmOnly: option.value })}
                      aria-pressed={active}
                      className={cn(
                        'min-h-[44px] rounded-xl border-2 px-2 py-2 text-xs font-bold transition-all touch-manipulation sm:text-sm',
                        active
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                      )}
                    >
                      <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Defects</h3>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: 'Any', value: null },
                  { label: 'Defective', value: true },
                  { label: 'Non-defective', value: false },
                ] as const).map((option) => {
                  const active = draft.defectOnly === option.value;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      onClick={() => setDraft({ ...draft, defectOnly: option.value })}
                      aria-pressed={active}
                      className={cn(
                        'min-h-[44px] rounded-xl border-2 px-2 py-2 text-xs font-bold transition-all touch-manipulation sm:text-sm',
                        active
                          ? 'border-rose-600 bg-rose-50 text-rose-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <BottomSheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={clearAll}
              className="h-11 w-full"
            >
              Clear all
            </Button>
            <Button
              type="button"
              onClick={applyDraft}
              className="h-11 w-full bg-blue-600 font-bold text-white hover:bg-blue-700"
            >
              Apply filters
            </Button>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
