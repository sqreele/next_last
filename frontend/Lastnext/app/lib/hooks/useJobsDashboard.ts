import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from '../session.client';
import { jobsApi, JobsApiError } from '../api/jobsApi';
import { Job, JobStatus, Property } from '../types';
import { useToast } from './use-toast';
import { exportFilteredJobsToCSV } from '../utils/csv-export';
import { useMainStore } from '../stores/mainStore';

interface JobsDashboardState {
  jobs: Job[];
  properties: Property[];
  loading: boolean;
  error: string | null;
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    defect: number;
    preventiveMaintenance: number;
    waitingSparepart: number;
  };
  filters: {
    property?: string;
    status?: JobStatus;
    room?: string;
    user?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  };
  viewMode: 'grid' | 'list';
  selectedTab: string;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

interface UseJobsDashboardReturn extends JobsDashboardState {
  // Actions
  refreshJobs: () => Promise<void>;
  updateJobStatus: (jobId: string, status: JobStatus) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  updateFilters: (newFilters: Partial<JobsDashboardState['filters']>) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setSelectedTab: (tab: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  
  // Computed values
  filteredJobs: Job[];
  isLoadingMore: boolean;
  hasMoreJobs: boolean;
  
  // Real-time updates
  enableRealTime: () => void;
  disableRealTime: () => void;
  
  // Cache management
  clearCache: () => void;
  
  // Export
  exportJobs: (format: 'csv' | 'excel' | 'pdf') => Promise<void>;

  // Trends
  trends: {
    total: { value: number; isPositive: boolean };
    pending: { value: number; isPositive: boolean };
    inProgress: { value: number; isPositive: boolean };
    completed: { value: number; isPositive: boolean };
  };
}

const initialState: JobsDashboardState = {
  jobs: [],
  properties: [],
  loading: false,
  error: null,
  stats: {
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    defect: 0,
    preventiveMaintenance: 0,
    waitingSparepart: 0,
  },
  filters: {},
  viewMode: 'grid',
  selectedTab: 'all',
  pagination: {
    page: 1,
    pageSize: 24,
    total: 0,
  },
};

export function useJobsDashboard(): UseJobsDashboardReturn {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [state, setState] = useState<JobsDashboardState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const realTimeUnsubscribeRef = useRef<(() => void) | null>(null);
  
  // Rate limiting refs to prevent excessive calls
  const isLoadingRef = useRef(false);
  const lastCallTimeRef = useRef<number>(0);
  const MIN_CALL_INTERVAL = 2000; // Minimum 2 seconds between calls
  
  // Refs to store current state values for use in callbacks without dependencies
  const stateRef = useRef(state);
  const filtersRef = useRef(state.filters);
  const paginationRef = useRef(state.pagination);
  
  // Update refs when state changes
  useEffect(() => {
    stateRef.current = state;
    filtersRef.current = state.filters;
    paginationRef.current = state.pagination;
  }, [state]);
  
  // Get selected property from main store
  const selectedPropertyId = useMainStore(state => state.selectedPropertyId);

  // Memoized access token
  const accessToken = useMemo(() => session?.user?.accessToken, [session?.user?.accessToken]);

  // Check if user is authenticated
  const isAuthenticated = useMemo(() => !!accessToken, [accessToken]);

  // Refresh jobs data with pagination
  const refreshJobs = useCallback(async (loadMore: boolean = false) => {
    if (!isAuthenticated || !accessToken) return;
    
    // Prevent concurrent calls
    if (isLoadingRef.current) {
      console.log('useJobsDashboard: Already loading, skipping duplicate call');
      return;
    }
    
    // Prevent excessive calls (rate limiting)
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTimeRef.current;
    if (timeSinceLastCall < MIN_CALL_INTERVAL) {
      console.log(`useJobsDashboard: Rate limiting - ${timeSinceLastCall}ms since last call`);
      return;
    }
    
    isLoadingRef.current = true;
    lastCallTimeRef.current = now;

    try {
      setState(prev => ({ 
        ...prev, 
        loading: !loadMore, 
        error: null 
      }));
      
      // Use refs to get current values without dependencies
      const currentPagination = paginationRef.current;
      const currentFilters = filtersRef.current;
      
      // Calculate the page to load
      const pageToLoad = loadMore ? currentPagination.page + 1 : 1;
      
      // Invalidate cache if not loading more
      if (!loadMore) {
        jobsApi.invalidateCache('jobs');
        jobsApi.invalidateCache('properties');
      }

      // Include selected property in filters (use correct backend key: property_id)
      const filtersWithProperty = {
        ...currentFilters,
        property_id: selectedPropertyId || (currentFilters as any).property_id
      } as typeof currentFilters & { property_id?: string | null };

      const [jobsResponse, properties, stats] = await Promise.all([
        jobsApi.getJobs(accessToken, filtersWithProperty, pageToLoad, currentPagination.pageSize),
        jobsApi.getProperties(accessToken),
        jobsApi.getJobStats(accessToken, filtersWithProperty)
      ]);


      setState(prev => ({
        ...prev,
        jobs: loadMore ? [...prev.jobs, ...jobsResponse.results] : jobsResponse.results,
        properties,
        stats,
        pagination: {
          ...prev.pagination,
          page: pageToLoad,
          total: jobsResponse.count
        },
        loading: false,
        error: null
      }));
      
    } catch (error) {
      console.error('Error refreshing jobs:', error);
      
      if (error instanceof JobsApiError) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error.message
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to refresh jobs'
        }));
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, [isAuthenticated, accessToken, selectedPropertyId]);

  // Store refreshJobs in a ref early to avoid dependency loops
  const refreshJobsRef = useRef<typeof refreshJobs>(async () => {});
  useEffect(() => {
    refreshJobsRef.current = refreshJobs;
  }, [refreshJobs]);

  // Update job status
  const updateJobStatus = useCallback(async (jobId: string, status: string) => {
    if (!isAuthenticated || !accessToken) return;

    try {
      const updatedJob = await jobsApi.updateJob(accessToken, jobId, { status });
      
      // Update local state
      setState(prev => ({
        ...prev,
        jobs: prev.jobs.map(job => 
          job.id === Number(jobId) ? updatedJob : job
        )
      }));

      // Refresh stats - temporarily disabled since getJobStats doesn't exist
      // const stats = await jobsApi.getJobStats(accessToken, state.filters);
      // setState(prev => ({ ...prev, stats }));
      
      toast.success('Job status updated successfully');
      
    } catch (error) {
      console.error('Error updating job status:', error);
      
      if (error instanceof JobsApiError) {
        toast.error(error.message);
      } else {
        toast.error('Failed to update job status');
      }
    }
  }, [isAuthenticated, accessToken, state.filters, toast]);

  // Delete job
  const deleteJob = useCallback(async (jobId: string) => {
    if (!isAuthenticated || !accessToken) return;

    try {
      await jobsApi.deleteJob(accessToken, jobId);
      
      // Update local state
      setState(prev => ({
        ...prev,
        jobs: prev.jobs.filter(job => job.id !== Number(jobId))
      }));

      // Refresh stats - temporarily disabled since getJobStats doesn't exist
      // const stats = await jobsApi.getJobStats(accessToken, state.filters);
      // setState(prev => ({ ...prev, stats }));
      
      toast.success('Job deleted successfully');
      
    } catch (error) {
      console.error('Error deleting job:', error);
      
      if (error instanceof JobsApiError) {
        toast.error(error.message);
      } else {
        toast.error('Failed to delete job');
      }
    }
  }, [isAuthenticated, accessToken, state.jobs, state.properties, state.filters, toast]);

  // Update filters
  const updateFilters = useCallback((newFilters: Partial<JobsDashboardState['filters']>) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...newFilters },
      pagination: { ...prev.pagination, page: 1 }, // Reset to first page
    }));
  }, []);

  // Set view mode
  const setViewMode = useCallback((mode: 'grid' | 'list') => {
    setState(prev => ({ ...prev, viewMode: mode }));
  }, []);

  // Set selected tab
  const setSelectedTab = useCallback((tab: string) => {
    setState(prev => ({ ...prev, selectedTab: tab }));
  }, []);

  // Set page and load more
  const setPage = useCallback((page: number) => {
    setState(prev => {
      if (page > prev.pagination.page) {
        // Load more data - use ref to avoid dependency
        if (refreshJobsRef.current) {
          refreshJobsRef.current(true);
        }
        return prev; // State update handled by refreshJobs
      } else {
        return { ...prev, pagination: { ...prev.pagination, page } };
      }
    });
  }, []); // No dependencies - uses refs and functional setState

  // Set page size
  const setPageSize = useCallback((pageSize: number) => {
    setState(prev => ({ 
      ...prev, 
      pagination: { ...prev.pagination, pageSize, page: 1 } 
    }));
  }, []);

  // Enable real-time updates
  const enableRealTime = useCallback(() => {
    if (!isAuthenticated || !accessToken) return;

    try {
      jobsApi.enableRealTime(accessToken);
      
      const unsubscribe = jobsApi.subscribeToUpdates((data) => {
        // Handle real-time updates
        if (data.type === 'job_updated') {
          setState(prev => ({
            ...prev,
            jobs: prev.jobs.map(job => 
              job.id === data.job.id ? data.job : job
            ),
          }));
        } else if (data.type === 'job_created') {
          setState(prev => ({
            ...prev,
            jobs: [data.job, ...prev.jobs],
          }));
        } else if (data.type === 'job_deleted') {
          setState(prev => ({
            ...prev,
            jobs: prev.jobs.filter(job => job.id !== data.jobId),
          }));
        }
        
        // Refresh stats - temporarily disabled since getJobStats doesn't exist
        // jobsApi.getJobStats(accessToken, state.filters).then(stats => {
        //   setState(prev => ({ ...prev, stats }));
        // });
      });
      
      realTimeUnsubscribeRef.current = unsubscribe;
      
    } catch (error) {
      console.error('Error enabling real-time updates:', error);
    }
  }, [isAuthenticated, accessToken, state.filters]);

  // Disable real-time updates
  const disableRealTime = useCallback(() => {
    try {
      jobsApi.disableRealTime();
      
      if (realTimeUnsubscribeRef.current) {
        realTimeUnsubscribeRef.current();
        realTimeUnsubscribeRef.current = null;
      }
    } catch (error) {
      console.error('Error disabling real-time updates:', error);
    }
  }, []);

  // Clear cache
  const clearCache = useCallback(() => {
    jobsApi.clearCache();
    toast.success('Cache cleared');
  }, [toast]);

  // Export jobs
  const exportJobs = useCallback(async (format: 'csv' | 'excel' | 'pdf') => {
    if (!isAuthenticated || !accessToken) return;

    try {
      if (format === 'csv') {
        // Export as CSV
        exportFilteredJobsToCSV(
          state.jobs,
          state.properties,
          state.filters,
          {
            includeImages: false,
            includeUserDetails: true,
            includeRoomDetails: true,
            includePropertyDetails: true,
            dateFormat: 'readable'
          }
        );
        
        toast({
          title: "Export Successful",
          description: `Exported ${state.jobs.length} jobs as CSV`
        });
      } else if (format === 'excel') {
        // For now, export as CSV with Excel extension
        exportFilteredJobsToCSV(
          state.jobs,
          state.properties,
          state.filters,
          {
            filename: `jobs-export-${new Date().toISOString().split('T')[0]}.xlsx`,
            includeImages: false,
            includeUserDetails: true,
            includeRoomDetails: true,
            includePropertyDetails: true,
            dateFormat: 'readable'
          }
        );
        
        toast({
          title: "Export Successful",
          description: `Exported ${state.jobs.length} jobs as Excel (CSV format)`
        });
      } else if (format === 'pdf') {
        // PDF export - show message that it's not implemented yet
        toast({
          title: "Info",
          description: 'PDF export is not yet implemented. Use CSV export for now.'
        });
      }
      
      // Create download link
      // const url = window.URL.createObjectURL(blob);
      // const a = document.createElement('a');
      // a.href = url;
      // a.download = `jobs-${new Date().toISOString().split('T')[0]}.${format}`;
      // document.body.appendChild(a);
      // a.click();
      // window.URL.revokeObjectURL(url);
      // document.body.removeChild(a);
      
      // toast.success(`Jobs exported as ${format.toUpperCase()}`);
      
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Error",
        description: 'Failed to export jobs'
      });
    }
  }, [isAuthenticated, accessToken, state.jobs, state.properties, state.filters, toast]);

  // Computed values - return raw jobs for JobList to handle filtering
  const filteredJobs = useMemo(() => {
    let filtered = state.jobs;

    // Only apply search filter here, let JobList handle tab filtering
    if (state.filters.search) {
      const searchLower = state.filters.search.toLowerCase();
      filtered = filtered.filter(job => 
        job.description?.toLowerCase().includes(searchLower) ||
        job.id?.toString().includes(searchLower)
      );
    }

    return filtered;
  }, [state.jobs, state.filters.search]);

  const isLoadingMore = useMemo(() => 
    state.loading && state.jobs.length > 0, 
    [state.loading, state.jobs.length]
  );

  const hasMoreJobs = useMemo(() => 
    state.jobs.length < state.pagination.total, 
    [state.jobs.length, state.pagination.total]
  );


  // Effects - use refs to prevent dependency loops
  useEffect(() => {
    if (isAuthenticated && !isLoadingRef.current) {
      const timeoutId = setTimeout(() => {
        refreshJobsRef.current(false);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [isAuthenticated]);

  // Debounce filter changes to prevent excessive calls
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const timeoutId = setTimeout(() => {
      if (!isLoadingRef.current) {
        refreshJobsRef.current(false);
      }
    }, 300); // 300ms debounce for filter changes
    
    return () => clearTimeout(timeoutId);
  }, [isAuthenticated, state.filters]);
  
  // Apply server-side filters when selected tab changes to ensure we load
  // the correct status from the backend (rather than filtering only the
  // currently loaded page on the client). This prevents empty tabs when
  // the first page doesn't contain the desired status.
  useEffect(() => {
    if (!isAuthenticated) return;

    // Map selectedTab to backend filters
    const nextFilters: Partial<JobsDashboardState['filters']> = { ...state.filters };

    // Reset tab-related filters
    delete (nextFilters as any).status;
    delete (nextFilters as any).is_preventivemaintenance;

    switch (state.selectedTab) {
      case 'pending':
        nextFilters.status = 'pending' as any;
        break;
      case 'in_progress':
        nextFilters.status = 'in_progress' as any;
        break;
      case 'completed':
        nextFilters.status = 'completed' as any;
        break;
      case 'cancelled':
        nextFilters.status = 'cancelled' as any;
        break;
      case 'waiting_sparepart':
        nextFilters.status = 'waiting_sparepart' as any;
        break;
      case 'preventive_maintenance':
        // Server supports this via is_preventivemaintenance flag
        (nextFilters as any).is_preventivemaintenance = true as any;
        break;
      case 'defect':
        // No server-side filter available for defect; keep client-side filtering
        break;
      case 'all':
      default:
        // No status filter for 'all'
        break;
    }

    // Only update filters (and trigger refresh) if something actually changed
    const filtersChanged = JSON.stringify(state.filters) !== JSON.stringify(nextFilters);
    if (filtersChanged) {
      updateFilters(nextFilters);
    }
    // If filters didn't change (e.g., re-clicking same tab), still ensure we refresh
    // to avoid cases where the list is stale after updates.
    if (!filtersChanged && !isLoadingRef.current) {
      const timeoutId = setTimeout(() => {
        refreshJobsRef.current(false);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [isAuthenticated, state.selectedTab, state.filters, updateFilters]);
  
  // Refresh when selected property changes
  useEffect(() => {
    if (isAuthenticated && selectedPropertyId !== undefined && !isLoadingRef.current) {
      const timeoutId = setTimeout(() => {
        refreshJobsRef.current(false);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [isAuthenticated, selectedPropertyId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (realTimeUnsubscribeRef.current) {
        realTimeUnsubscribeRef.current();
      }
      disableRealTime();
    };
  }, [disableRealTime]);


  // Calculate trends by comparing current week vs last week
  const trends = useMemo(() => {
    const now = new Date();
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
    currentWeekStart.setHours(0, 0, 0, 0);
    
    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(currentWeekStart.getDate() - 7);
    
    const currentWeekJobs = state.jobs.filter(job => {
      const jobDate = new Date(job.created_at);
      return jobDate >= currentWeekStart && jobDate <= now;
    });
    
    const lastWeekJobs = state.jobs.filter(job => {
      const jobDate = new Date(job.created_at);
      return jobDate >= lastWeekStart && jobDate < currentWeekStart;
    });

    const calculateTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? { value: 100, isPositive: true } : { value: 0, isPositive: true };
      const change = ((current - previous) / previous) * 100;
      return { value: Math.abs(Math.round(change)), isPositive: change >= 0 };
    };

    const totalTrend = calculateTrend(
      currentWeekJobs.length,
      lastWeekJobs.length
    );
    
    const pendingTrend = calculateTrend(
      currentWeekJobs.filter(job => job.status === 'pending').length,
      lastWeekJobs.filter(job => job.status === 'pending').length
    );
    
    const inProgressTrend = calculateTrend(
      currentWeekJobs.filter(job => job.status === 'in_progress').length,
      lastWeekJobs.filter(job => job.status === 'in_progress').length
    );
    
    const completedTrend = calculateTrend(
      currentWeekJobs.filter(job => job.status === 'completed').length,
      lastWeekJobs.filter(job => job.status === 'completed').length
    );

    return {
      total: totalTrend,
      pending: pendingTrend,
      inProgress: inProgressTrend,
      completed: completedTrend,
    };
  }, [state.jobs]);

  return {
    ...state,
    trends, // Add calculated trends
    filteredJobs,
    isLoadingMore,
    hasMoreJobs,
    refreshJobs: () => refreshJobs(false), // Wrap to provide default parameter
    updateJobStatus,
    deleteJob,
    updateFilters,
    setViewMode,
    setSelectedTab,
    setPage,
    setPageSize,
    enableRealTime,
    disableRealTime,
    clearCache,
    exportJobs,
  };
}
