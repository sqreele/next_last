import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from '../session.client';
import { jobsApi, JobsApiError } from '../api/jobsApi';
import { Job, JobStatus, Property } from '../types';
import { useToast } from './use-toast';

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
  },
  filters: {},
  viewMode: 'grid',
  selectedTab: 'all',
  pagination: {
    page: 1,
    pageSize: 25,
    total: 0,
  },
};

export function useJobsDashboard(): UseJobsDashboardReturn {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [state, setState] = useState<JobsDashboardState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const realTimeUnsubscribeRef = useRef<(() => void) | null>(null);

  // Memoized access token
  const accessToken = useMemo(() => session?.user?.accessToken, [session?.user?.accessToken]);

  // Check if user is authenticated
  const isAuthenticated = useMemo(() => !!accessToken, [accessToken]);

  // Refresh jobs data
  const refreshJobs = useCallback(async () => {
    if (!isAuthenticated || !accessToken) return;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // Invalidate any cached jobs/properties before refresh so we always fetch fresh
      jobsApi.invalidateCache('jobs');
      jobsApi.invalidateCache('properties');

      const [jobs, properties] = await Promise.all([
        jobsApi.getJobs(accessToken, state.filters),
        jobsApi.getProperties(accessToken)
      ]);

      setState(prev => ({
        ...prev,
        jobs,
        properties,
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
    }
  }, [isAuthenticated, accessToken, state.filters]);

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
  }, [isAuthenticated, accessToken, toast]);

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

  // Set page
  const setPage = useCallback((page: number) => {
    setState(prev => ({ ...prev, pagination: { ...prev.pagination, page } }));
  }, []);

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
      // Temporarily disabled since exportJobs method doesn't exist in new API
      // const blob = await jobsApi.exportJobs(format, accessToken, state.filters);
      
      // For now, just show a message that export is not implemented
      toast({
        title: "Info",
        description: 'Export functionality is not yet implemented'
      });
      return;
      
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
      console.error('Error exporting jobs:', error);
      
      if (error instanceof JobsApiError) {
        toast.error(error.message);
      } else {
        toast.error('Failed to export jobs');
      }
    }
  }, [isAuthenticated, accessToken, toast]);

  // Computed values
  const filteredJobs = useMemo(() => {
    let filtered = state.jobs;

    // Apply status filter based on selected tab
    if (state.selectedTab !== 'all') {
      filtered = filtered.filter(job => job.status === state.selectedTab);
    }

    // Apply search filter
    if (state.filters.search) {
      const searchLower = state.filters.search.toLowerCase();
      filtered = filtered.filter(job => 
        job.description?.toLowerCase().includes(searchLower) ||
        job.id?.toString().includes(searchLower)
      );
    }

    return filtered;
  }, [state.jobs, state.selectedTab, state.filters.search]);

  const isLoadingMore = useMemo(() => 
    state.loading && state.jobs.length > 0, 
    [state.loading, state.jobs.length]
  );

  const hasMoreJobs = useMemo(() => 
    state.jobs.length < state.pagination.total, 
    [state.jobs.length, state.pagination.total]
  );

  // Effects
  useEffect(() => {
    if (isAuthenticated) {
      refreshJobs();
    }
  }, [isAuthenticated, refreshJobs]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshJobs();
    }
  }, [state.filters, refreshJobs]);

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

  // Calculate stats based on filtered jobs
  const stats = useMemo(() => {
    const total = filteredJobs.length;
    const pending = filteredJobs.filter(job => job.status === 'pending').length;
    const inProgress = filteredJobs.filter(job => job.status === 'in_progress').length;
    const completed = filteredJobs.filter(job => job.status === 'completed').length;
    const cancelled = filteredJobs.filter(job => job.status === 'cancelled').length;
    const waitingSparepart = filteredJobs.filter(job => job.status === 'waiting_sparepart').length;
    const defect = filteredJobs.filter(job => job.is_defective).length;
    const preventiveMaintenance = filteredJobs.filter(job => job.is_preventivemaintenance).length;

    return {
      total,
      pending,
      inProgress,
      completed,
      cancelled,
      waitingSparepart,
      defect,
      preventiveMaintenance,
    };
  }, [filteredJobs]);

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
    stats, // Use calculated stats instead of state.stats
    trends, // Add calculated trends
    filteredJobs,
    isLoadingMore,
    hasMoreJobs,
    refreshJobs,
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
