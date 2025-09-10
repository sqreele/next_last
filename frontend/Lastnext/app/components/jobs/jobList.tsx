"use client";

import { useState, useEffect } from 'react';
import { useUser } from '@/app/lib/stores/mainStore';
import { JobCard } from '@/app/components/jobs/JobCard';
import Pagination from '@/app/components/jobs/Pagination';
import JobActions from '@/app/components/jobs/JobActions';
import { Job, TabValue, Property, SortOrder } from '@/app/lib/types';
import { Loader2 } from 'lucide-react';
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

  // Build a set of identifiers that represent the currently selected property
  // This ensures we match both the human-readable property code and the numeric PK
  const selectedPropertyIdentifiers = (() => {
    const identifiers = new Set<string>();
    if (selectedProperty) identifiers.add(String(selectedProperty));

    const matched = properties?.find(
      (p) => String(p.property_id) === String(selectedProperty) || String(p.id) === String(selectedProperty)
    );

    if (matched) {
      if (matched.property_id) identifiers.add(String(matched.property_id));
      if (matched.id) identifiers.add(String(matched.id));
    }

    return identifiers;
  })();

  // Debug logging

  const [itemsPerPage, setItemsPerPage] = useState(25);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, sortOrder, selectedProperty, dateFilter]);

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

  const filteredJobs = jobs.filter(job => {

    // Apply property-based filtering
    let matchesProperty = true;
    
    if (selectedProperty) {
      matchesProperty = false;
      
      // Direct property_id match
      if (job.property_id && String(job.property_id) === String(selectedProperty)) {
        matchesProperty = true;
      }
      
      // Check if job has properties array
      if (!matchesProperty && job.properties && Array.isArray(job.properties)) {
        matchesProperty = job.properties.some(prop => {
          if (typeof prop === 'string' || typeof prop === 'number') {
            return String(prop) === String(selectedProperty);
          }
          if (prop && typeof prop === 'object' && 'property_id' in prop) {
            return String(prop.property_id) === String(selectedProperty);
          }
          return false;
        });
      }
      
      // Check rooms for property match
      if (!matchesProperty && job.rooms && Array.isArray(job.rooms)) {
        matchesProperty = job.rooms.some((room: any) => {
          if (room && room.properties && Array.isArray(room.properties)) {
            return room.properties.some((prop: any) => {
              if (typeof prop === 'string' || typeof prop === 'number') {
                return String(prop) === String(selectedProperty);
              }
              if (prop && typeof prop === 'object' && 'property_id' in prop) {
                return String(prop.property_id) === String(selectedProperty);
              }
              return false;
            });
          }
          return false;
        });
      }
    }

    if (!matchesProperty) {
      console.log('❌ Job', job.job_id, 'filtered out by property');
      return false;
    }

    // Room filtering
    if (selectedRoom) {
      if (!job.rooms || !Array.isArray(job.rooms) || job.rooms.length === 0) {
        console.log('❌ Job', job.job_id, 'filtered out by room - no rooms');
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
        console.log('❌ Job', job.job_id, 'filtered out by room - no room match');
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
    
    
    // Status filtering enabled
    
    if (!matchesStatus) return false;

    const dateFilterResult = applyDateFilter(job);
    
    return dateFilterResult;
  });


  const sortedJobs = [...filteredJobs].sort((a, b) => {
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

  if (sortedJobs.length === 0 && !isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end mb-2">
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

        <div className="flex flex-col items-center justify-center min-h-[200px] p-4 text-center bg-white rounded-lg shadow-sm">
          <p className="text-base font-medium text-gray-600 mb-2">
            No jobs found
          </p>
          <p className="text-sm text-gray-500">
            {selectedProperty
              ? `No jobs match your current filters`
              : 'No property selected.'}
          </p>
          {/* Debug information */}
          <div className="mt-4 p-4 bg-gray-100 rounded text-left text-xs">
            <p><strong>Debug Info:</strong></p>
            <p>Total jobs: {jobs?.length || 0}</p>
            <p>Selected property: {selectedProperty || 'None'}</p>
            <p>Filtered jobs: {filteredJobs?.length || 0}</p>
            <p>Sorted jobs: {sortedJobs?.length || 0}</p>
            <p>Properties count: {properties?.length || 0}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-2">
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

      <div className="text-sm text-gray-500 mb-2">
        Showing {Math.min(currentJobs.length, itemsPerPage)} of {sortedJobs.length} results
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px] bg-white rounded-lg shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="job-grid-container mb-10">
          <div className={viewMode === 'list' 
            ? "gap-3 space-y-3" 
            : "gap-2 sm:gap-3 grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          }>
            {currentJobs.map((job, index) => (
              <div key={job.job_id || `job-${index}`} className={viewMode === 'list' ? "h-full w-full" : "h-full"}>
                <div className="h-full touch-action-manipulation">
                  <JobCard job={job} properties={properties} viewMode={viewMode} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 px-4 flex justify-center items-center">
          <div className="bg-white rounded-lg shadow-sm p-2 touch-action-manipulation">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      )}

      {/* Extra space at bottom to avoid overlap */}
      <div className="h-24 md:h-8" />
    </div>
  );
}
