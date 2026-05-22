"use client";

import { useState, useEffect, useMemo } from 'react';
import { Check } from 'lucide-react';
import { useUser, useProperties } from '@/app/lib/stores/mainStore';
import InstagramJobCard from '@/app/components/jobs/InstagramJobCard';
import Pagination from '@/app/components/jobs/Pagination';
import JobActions from '@/app/components/jobs/JobActions';
import { JobListMobileToolbar, type JobListFilters } from '@/app/components/jobs/JobListMobileToolbar';
import { JobBatchActionBar } from '@/app/components/jobs/JobBatchActionBar';
import { Job, TabValue, Property, SortOrder } from '@/app/lib/types';
import { EmptyState, LoadingSkeleton } from '@/app/components/pcms-ui';
import { cn } from '@/app/lib/utils/cn';
import {
  startOfDay, endOfDay, subDays,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  isWithinInterval
} from 'date-fns';

type DateFilter = "all" | "today" | "yesterday" | "thisWeek" | "thisMonth" | "custom";

interface JobListProps {
  jobs: Job[];
  filter: TabValue;
  properties: Property[];
  selectedRoom?: string | null;
  onRoomFilter?: (roomId: string | null) => void;
  viewMode?: 'grid' | 'list';
  onRefresh?: () => Promise<void> | void;
}

export default function JobList({ jobs, filter, properties, selectedRoom, onRoomFilter, viewMode = 'grid', onRefresh }: JobListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("Newest first");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customDateRange, setCustomDateRange] = useState<{ start?: Date, end?: Date }>({});
  const { selectedPropertyId: selectedProperty } = useUser();
  const { properties: globalProperties } = useProperties();

  // Build a set of identifiers that represent the currently selected property
  // This ensures we match both the human-readable property code and the numeric PK
  const selectedPropertyIdentifiers = (() => {
    const identifiers = new Set<string>();
    if (selectedProperty) identifiers.add(String(selectedProperty));

    // Use provided properties list or fall back to global store properties
    const propertyList = Array.isArray(properties) && properties.length > 0 ? properties : (Array.isArray(globalProperties) ? globalProperties : []);

    const matched = propertyList?.find(
      (p) => String(p.property_id) === String(selectedProperty) || String(p.id) === String(selectedProperty)
    );

    if (matched) {
      if (matched.property_id) identifiers.add(String(matched.property_id));
      if (matched.id) identifiers.add(String(matched.id));
    }

    return identifiers;
  })();

  // Debug logging

  const [itemsPerPage, setItemsPerPage] = useState(24);

  // Mobile toolbar filters — applied AFTER the legacy filters above so the desktop
  // JobActions controls keep working unchanged.
  const [mobileFilters, setMobileFilters] = useState<JobListFilters>({
    search: '',
    statuses: [],
    priorities: [],
    pmOnly: null,
    defectOnly: null,
    dateFilter: 'all',
  });

  // Batch selection state
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, sortOrder, selectedProperty, dateFilter, mobileFilters]);

  useEffect(() => {
    if (!selectionEnabled) setSelectedJobIds(new Set());
  }, [selectionEnabled]);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, [filter, sortOrder, selectedProperty, dateFilter]);

  const handleDateFilterChange = (
    filterType: DateFilter,
    startDate?: Date,
    endDate?: Date
  ) => {
    setIsLoading(true);
    setDateFilter(filterType);
    if (filterType === "custom" && startDate && endDate) {
      setCustomDateRange({ start: startDate, end: endDate });
    }
    setTimeout(() => setIsLoading(false), 300);
  };

  const applyDateFilter = (job: Job): boolean => {
    const jobDate = job.created_at ? new Date(job.created_at) : null;
    if (!jobDate) return true;

    const now = new Date();

    switch (dateFilter) {
      case "today":
        return isWithinInterval(jobDate, { start: startOfDay(now), end: endOfDay(now) });
      case "yesterday":
        const yesterday = subDays(now, 1);
        return isWithinInterval(jobDate, { start: startOfDay(yesterday), end: endOfDay(yesterday) });
      case "thisWeek":
        return isWithinInterval(jobDate, { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) });
      case "thisMonth":
        return isWithinInterval(jobDate, { start: startOfMonth(now), end: endOfMonth(now) });
      case "custom":
        if (customDateRange.start && customDateRange.end) {
          return isWithinInterval(jobDate, {
            start: startOfDay(customDateRange.start),
            end: endOfDay(customDateRange.end)
          });
        }
        return true;
      default:
        return true;
    }
  };

  // Helper to check if a job belongs to the selected property by examining
  // all possible locations where a property reference might exist
  const doesMatchSelectedProperty = (job: Job): boolean => {
    if (!selectedProperty) return true;

    const selectedIds = selectedPropertyIdentifiers;
    const matches = (value: unknown): boolean => {
      if (value === undefined || value === null) return false;
      return selectedIds.has(String(value));
    };

    // Direct property reference on job
    if (matches((job as any).property_id)) return true;

    // Job-level properties collection
    if (Array.isArray((job as any).properties)) {
      for (const prop of (job as any).properties) {
        if (typeof prop === 'string' || typeof prop === 'number') {
          if (matches(prop)) return true;
        } else if (prop && typeof prop === 'object') {
          if ('property_id' in prop && matches((prop as any).property_id)) return true;
          if ('id' in prop && matches((prop as any).id)) return true;
        }
      }
    }

    // Properties via profile image metadata
    if ((job as any).profile_image && Array.isArray((job as any).profile_image.properties)) {
      for (const prop of (job as any).profile_image.properties) {
        if (prop && typeof prop === 'object') {
          if ('property_id' in prop && matches((prop as any).property_id)) return true;
          if ('id' in prop && matches((prop as any).id)) return true;
        }
      }
    }

    // Room-level properties or direct room property references
    if (Array.isArray((job as any).rooms)) {
      for (const room of (job as any).rooms) {
        if (room && matches((room as any).property_id)) return true;
        if (room && Array.isArray((room as any).properties)) {
          for (const prop of (room as any).properties) {
            if (typeof prop === 'string' || typeof prop === 'number') {
              if (matches(prop)) return true;
            } else if (prop && typeof prop === 'object') {
              if ('property_id' in prop && matches((prop as any).property_id)) return true;
              if ('id' in prop && matches((prop as any).id)) return true;
            }
          }
        }
      }
    }

    return false;
  };

  const filteredJobs = jobs.filter(job => {
    // Apply property-based filtering across all known sources
    if (selectedProperty) {
      const matchesProperty = doesMatchSelectedProperty(job);
      if (!matchesProperty) {
        return false;
      }
    }

    // Room filtering
    if (selectedRoom) {
      if (!job.rooms || !Array.isArray(job.rooms) || job.rooms.length === 0) {
        return false;
      }

      const matchesRoom = job.rooms.some((room: any) => {
        if (typeof room === "string" || typeof room === "number") {
          return String(room) === selectedRoom;
        }
        if (room && typeof room === "object" && "room_id" in room) {
          return String(room.room_id) === selectedRoom;
        }
        if (room && typeof room === "object" && "id" in room) {
          return String(room.id) === selectedRoom;
        }
        return false;
      });

      if (!matchesRoom) {
        return false;
      }
    }

    // Status filtering
    let matchesStatus = true;
    switch (filter) {
      case 'all':
        matchesStatus = true;
        break;
      case 'pending':
        matchesStatus = job.status === 'pending';
        break;
      case 'in_progress':
        matchesStatus = job.status === 'in_progress';
        break;
      case 'completed':
        matchesStatus = job.status === 'completed';
        break;
      case 'cancelled':
        matchesStatus = job.status === 'cancelled';
        break;
      case 'waiting_sparepart':
        matchesStatus = job.status === 'waiting_sparepart';
        break;
      case 'defect':
        matchesStatus = job.is_defective === true;
        break;
      case 'preventive_maintenance':
        matchesStatus = job.is_preventivemaintenance === true;
        break;
    }
    
    // Debug logging for defect and in_progress filters
    if (filter === 'defect' && process.env.NODE_ENV === 'development') {
    }
    if (filter === 'in_progress' && process.env.NODE_ENV === 'development') {
    }
    
    
    // Status filtering enabled
    
    if (!matchesStatus) return false;

    const dateFilterResult = applyDateFilter(job);
    
    return dateFilterResult;
  });


  // Apply mobile toolbar filters on top of legacy filters
  const filteredJobsWithMobile = useMemo(() => {
    let out = filteredJobs;
    if (mobileFilters.search.trim()) {
      const term = mobileFilters.search.trim().toLowerCase();
      out = out.filter((j) => {
        const haystack = [
          j.job_id,
          j.description,
          j.remarks,
          j.room_name,
          j.topics?.[0]?.title,
          j.rooms?.[0]?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      });
    }
    if (mobileFilters.statuses.length) {
      out = out.filter((j) => mobileFilters.statuses.includes(j.status as any));
    }
    if (mobileFilters.priorities.length) {
      out = out.filter((j) => mobileFilters.priorities.includes(j.priority as any));
    }
    if (mobileFilters.pmOnly !== null) {
      out = out.filter((j) => Boolean(j.is_preventivemaintenance) === mobileFilters.pmOnly);
    }
    if (mobileFilters.defectOnly !== null) {
      out = out.filter((j) => Boolean(j.is_defective) === mobileFilters.defectOnly);
    }
    if (mobileFilters.dateFilter !== 'all') {
      const now = new Date();
      out = out.filter((j) => {
        if (!j.created_at) return false;
        const d = new Date(j.created_at);
        switch (mobileFilters.dateFilter) {
          case 'today':
            return isWithinInterval(d, { start: startOfDay(now), end: endOfDay(now) });
          case 'yesterday': {
            const y = subDays(now, 1);
            return isWithinInterval(d, { start: startOfDay(y), end: endOfDay(y) });
          }
          case 'thisWeek':
            return isWithinInterval(d, {
              start: startOfWeek(now, { weekStartsOn: 1 }),
              end: endOfWeek(now, { weekStartsOn: 1 }),
            });
          case 'thisMonth':
            return isWithinInterval(d, { start: startOfMonth(now), end: endOfMonth(now) });
          default:
            return true;
        }
      });
    }
    return out;
  }, [filteredJobs, mobileFilters]);

  const sortedJobs = [...filteredJobsWithMobile].sort((a, b) => {
    const dateA = new Date(a.created_at || '').getTime();
    const dateB = new Date(b.created_at || '').getTime();
    return sortOrder === "Newest first" ? dateB - dateA : dateA - dateB;
  });


  const totalPages = Math.ceil(sortedJobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentJobs = sortedJobs.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setIsLoading(true);
    setCurrentPage(page);
    window.scrollTo({
      top: document.querySelector('.job-grid-container')?.getBoundingClientRect().top
        ? window.scrollY + (document.querySelector('.job-grid-container')?.getBoundingClientRect().top || 0) - 80
        : 0,
      behavior: 'smooth'
    });
    setTimeout(() => setIsLoading(false), 300);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setTimeout(() => setIsLoading(false), 300);
    }
  };

  const toggleSelection = (jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedJobIds(new Set(sortedJobs.map((j) => String(j.job_id))));
  };

  const clearSelection = () => {
    setSelectedJobIds(new Set());
    setSelectionEnabled(false);
  };

  const mobileToolbar = (
    <div className="md:hidden">
      <JobListMobileToolbar
        filters={mobileFilters}
        onFiltersChange={setMobileFilters}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        selectionEnabled={selectionEnabled}
        onToggleSelection={() => setSelectionEnabled((s) => !s)}
        resultCount={sortedJobs.length}
      />
    </div>
  );

  const selectedJobs = useMemo(
    () => sortedJobs.filter((j) => selectedJobIds.has(String(j.job_id))),
    [sortedJobs, selectedJobIds],
  );

  if (sortedJobs.length === 0 && !isLoading) {
    return (
      <div className="space-y-4">
        {mobileToolbar}
        <div className="hidden md:flex justify-end mb-2">
          <JobActions
            jobs={sortedJobs}
            currentTab={filter}
            properties={properties}
            onRefresh={handleRefresh}
            onSort={(order) => setSortOrder(order)}
            currentSort={sortOrder}
            onDateFilter={handleDateFilterChange}
            currentDateFilter={dateFilter}
            onRoomFilter={onRoomFilter}
            currentRoomFilter={selectedRoom}
          />
        </div>

        <EmptyState
          title="No maintenance jobs found"
          description={selectedProperty ? 'No jobs match the selected room, date, status, or search filters.' : 'Select a property to view hotel maintenance jobs.'}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mobileToolbar}
      <div className="hidden md:flex justify-end mb-2">
        <JobActions
          jobs={sortedJobs}
          currentTab={filter}
          properties={properties}
          onRefresh={handleRefresh}
          onSort={(order) => setSortOrder(order)}
          currentSort={sortOrder}
          onDateFilter={handleDateFilterChange}
          currentDateFilter={dateFilter}
          onRoomFilter={onRoomFilter}
          currentRoomFilter={selectedRoom}
        />
      </div>

      <div className="hidden rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-[var(--pcms-text-muted)] shadow-[var(--pcms-shadow-sm)] md:block">
        Showing {Math.min(currentJobs.length, itemsPerPage)} of {sortedJobs.length} maintenance jobs
      </div>

      {isLoading ? (
        <div className="pcms-section-card p-4">
          <LoadingSkeleton rows={6} />
        </div>
      ) : (
        <div className="job-grid-container mb-10">
          <div className={viewMode === 'list'
            ? "gap-4 space-y-4"
            : "pcms-job-grid auto-rows-fr"
          }>
            {currentJobs.map((job, index) => {
              const jobIdStr = String(job.job_id || `job-${index}`);
              const selected = selectedJobIds.has(jobIdStr);
              const cardEl = (
                <div className="h-full touch-action-manipulation">
                  <InstagramJobCard job={job} viewMode={viewMode} />
                </div>
              );
              if (!selectionEnabled) {
                return (
                  <div key={jobIdStr} className={viewMode === 'list' ? "h-full w-full" : "h-full"}>
                    {cardEl}
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  key={jobIdStr}
                  onClick={() => toggleSelection(jobIdStr)}
                  aria-pressed={selected}
                  aria-label={`${selected ? 'Deselect' : 'Select'} job ${jobIdStr}`}
                  className={cn(
                    'relative block w-full rounded-2xl text-left transition-all',
                    viewMode === 'list' ? 'h-full' : 'h-full',
                    selected ? 'ring-4 ring-blue-500 ring-offset-2' : 'ring-2 ring-transparent hover:ring-blue-200',
                  )}
                >
                  <span
                    className={cn(
                      'absolute left-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full border-2 shadow-sm',
                      selected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white/90 text-transparent',
                    )}
                    aria-hidden="true"
                  >
                    <Check className="h-4 w-4" />
                  </span>
                  <div className="pointer-events-none">{cardEl}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 px-4 flex justify-center items-center">
          <div className="rounded-full border border-[var(--pcms-border)] bg-white/90 p-2 shadow-[var(--pcms-shadow-sm)] touch-action-manipulation">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      )}

      {selectionEnabled && selectedJobs.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-40 md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2">
          <JobBatchActionBar
            selected={selectedJobs}
            totalVisible={sortedJobs.length}
            properties={properties}
            onClear={clearSelection}
            onSelectAll={selectAllVisible}
            onComplete={handleRefresh}
          />
        </div>
      )}

      {/* Extra space at bottom to avoid overlap */}
      <div className="h-24 md:h-8" />
    </div>
  );
}
