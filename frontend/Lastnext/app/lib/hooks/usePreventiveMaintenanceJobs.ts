"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Job, JobStatus } from '@/app/lib/types';
import { fetchData } from '@/app/lib/api-client';
import { ApiError } from '@/app/lib/api-client';
import { useJobsStore, usePropertyStore } from '@/app/lib/stores';
import { useSession } from '@/app/lib/session.client';

interface UsePreventiveMaintenanceJobsOptions {
  propertyId?: string;
  limit?: number;
  autoLoad?: boolean;
  initialJobs?: Job[];
  isPM?: boolean; // Option to filter by is_preventivemaintenance
}

interface PMJobsStats {
  total: number;
  active: number;
  completed: number;
  completionRate: number;
}

interface DebugInfo {
  lastRequestTime: string;
  requestDuration: number;
  cacheHits: number;
  cacheMisses: number;
  retryCount: number;
}

interface CachedData {
  data: Job[];
  timestamp: string;
}

// Debug logger function
const debug = (message: string, data?: any) => {
  const isDebugMode = process.env.NODE_ENV === 'development' || 
    (typeof localStorage !== 'undefined' && localStorage.getItem('debug_mode') === 'true');
  if (isDebugMode) {
    if (data) {
      console.log(`[PM Jobs Debug] ${message}`, data);
    } else {
      console.log(`[PM Jobs Debug] ${message}`);
    }
  }
};

export function usePreventiveMaintenanceJobs({
  propertyId,
  limit = 10,
  autoLoad = true,
  initialJobs = [],
  isPM = true // Default to true since this is specifically for PM jobs
}: UsePreventiveMaintenanceJobsOptions) {
  // Get session for authentication
  const { data: session } = useSession();
  
  // Zustand stores
  const { 
    jobs, 
    isLoading, 
    error, 
    lastLoadTime,
    setJobs, 
    setLoading, 
    setError, 
    setLastLoadTime,
    updateJob: updateStoreJob
  } = useJobsStore();

  const { selectedProperty } = usePropertyStore();

  // Local state for component-specific data
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isPMProperty, setIsPMProperty] = useState<boolean | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  // Server-side pagination state
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(limit || 10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  
  // Use refs to avoid dependency issues
  const lastLoadTimeRef = useRef<Date | null>(null);
  const retryCountRef = useRef<number>(0);
  const isLoadingRef = useRef<boolean>(false);
  const lastQueryKeyRef = useRef<string | null>(null);
  
  // Create a cache key based on query parameters
  const cacheKey = useMemo(() => 
    `pm_jobs_${propertyId || 'all'}_${page}_${pageSize}_${isPM ? 'true' : 'false'}`,
    [propertyId, page, pageSize, isPM]
  );

  // Helper function to create authenticated config
  const createAuthConfig = useCallback(() => {
    if (!session?.user?.accessToken) {
      debug('No access token available');
      return {};
    }
    
    return {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json'
      }
    };
  }, [session?.user?.accessToken]);

  // Modified function to safely check if property has preventive maintenance
  const checkPropertyPMStatus = useCallback(async (): Promise<boolean> => {
    if (!propertyId) return true; // Default to true if no property ID
    
    debug(`Checking PM status for property ${propertyId}`);
    
    // For now, skip the PM status check to avoid authentication issues
    // This check is not critical for the main functionality
    debug(`Skipping PM status check - assuming PM is enabled`);
    return true;
    
    // TODO: Re-enable this check once authentication is properly configured
    // try {
    //   // Call the Django backend directly for property PM status
    //   const pmStatusUrl = `/api/v1/properties/${propertyId}/is-preventivemaintenance/`;
    //   debug(`PM status API call to: ${pmStatusUrl}`);
    //   
    //   const response = await fetchData<PropertyPMStatus>(pmStatusUrl);
    //   debug(`PM status response:`, response);
    //   
    //   // Check if response has the expected structure
    //   if (response && 'is_preventivemaintenance' in response) {
    //     setIsPMProperty(response.is_preventivemaintenance);
    //     debug(`Property has PM: ${response.is_preventivemaintenance}`);
    //     return response.is_preventivemaintenance;
    //   }
    //   
    //   debug(`Unexpected PM status response format - assuming PM is enabled`);
    //   return true; // Default to true if response format is unexpected
    // } catch (error) {
    //   debug(`Error checking PM status - assuming PM is enabled:`, error);
    //   console.warn('Error checking PM status (this is expected if the column does not exist yet):', error);
    //   
    //   // Log more details about the error for debugging
    //   if (error instanceof Error) {
    //     console.warn('Error details:', {
    //       message: error.message,
    //       name: error.name,
    //       stack: error.stack
    //     });
    //   }
    //   
    //   return true; // Default to true if there's an error (missing column)
    // }
  }, [propertyId]);

  const loadJobs = useCallback(async (forceRefresh: boolean = false) => {
    // Prevent multiple simultaneous calls
    if (isLoadingRef.current && !forceRefresh) {
      debug(`Load jobs already in progress, skipping`);
      return;
    }
    
    // Use cached data if we loaded recently for the SAME query and not forcing refresh
    const now = new Date();
    if (!forceRefresh && lastLoadTimeRef.current && lastQueryKeyRef.current === cacheKey &&
        (now.getTime() - lastLoadTimeRef.current.getTime()) < 2 * 60 * 1000) {
      debug(`Using recently loaded data for same query (${(now.getTime() - lastLoadTimeRef.current.getTime()) / 1000}s ago)`);
      isLoadingRef.current = false;
      return; // Use existing data if loaded within last 2 minutes for same query
    }

    if (!autoLoad && initialJobs.length > 0 && !forceRefresh) {
      debug(`Using initial jobs data (${initialJobs.length} jobs)`);
      setJobs(initialJobs);
      isLoadingRef.current = false;
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
      setError(null);
      debug(`Loading jobs: propertyId=${propertyId}, page=${page}, pageSize=${pageSize}, isPM=${isPM}`);
      
      // Check if this property has PM enabled, but don't fail if it doesn't
      let hasPM = true;
      if (propertyId) {
        // Skip the PM status check for now to avoid authentication issues
        // hasPM = await checkPropertyPMStatus();
        debug(`Skipping PM status check - assuming PM is enabled for property ${propertyId}`);
        hasPM = true;
      }
      
      // Try to use cached data if not forcing refresh
      if (!forceRefresh) {
        const cachedDataString = localStorage.getItem(cacheKey);
        if (cachedDataString) {
          try {
            const cachedData: CachedData = JSON.parse(cachedDataString);
            const cacheTime = new Date(cachedData.timestamp);
            
            // Use cache if it's less than 5 minutes old
            if ((now.getTime() - cacheTime.getTime()) < 5 * 60 * 1000) {
              debug(`Using cached data from ${(now.getTime() - cacheTime.getTime()) / 1000}s ago`);
              setJobs(cachedData.data);
              setLastLoadTime(cacheTime.getTime());
              lastLoadTimeRef.current = cacheTime;
              lastQueryKeyRef.current = cacheKey;
              isLoadingRef.current = false;
              setLoading(false);
              return;
            }
          } catch (e) {
            debug(`Error parsing cached data:`, e);
            console.warn('Error parsing cached data:', e);
            // Continue to fetch fresh data
          }
        }
      }
      
      // Prefer the dedicated preventive maintenance jobs endpoint that returns { jobs, count }
      // Fallback to /api/v1/jobs/ if needed
      const params: Record<string, string> = {};
      if (propertyId) params.property_id = propertyId;
      // Prefer page/page_size over legacy limit
      params.page = String(page);
      params.page_size = String(pageSize);

      // Build querystring
      const toQuery = (obj: Record<string, string>) =>
        Object.entries(obj)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');

      const requestStartTime = performance.now();

      // 1) Try dedicated PM jobs endpoint
      let fetchedJobs: Job[] | null = null;
      try {
        const pmUrl = `/api/v1/preventive-maintenance/jobs${Object.keys(params).length ? `?${toQuery(params)}` : ''}`;
        debug(`Fetching PM jobs via dedicated endpoint: ${pmUrl}`);
        const pmResponse = await fetchData<any>(pmUrl, createAuthConfig());
        if (pmResponse) {
          if (Array.isArray(pmResponse.results)) {
            fetchedJobs = pmResponse.results as Job[];
            setTotalCount(typeof pmResponse.count === 'number' ? pmResponse.count : fetchedJobs.length);
            setTotalPages(typeof pmResponse.total_pages === 'number' ? pmResponse.total_pages : 1);
            debug(`Received ${fetchedJobs.length} jobs (paginated). Total ${pmResponse.count}, pages ${pmResponse.total_pages}`);
          } else if (Array.isArray(pmResponse.jobs)) {
            // Backward compatibility
            fetchedJobs = pmResponse.jobs as Job[];
            setTotalCount(typeof pmResponse.count === 'number' ? pmResponse.count : fetchedJobs.length);
            setTotalPages(Math.ceil((pmResponse.count || fetchedJobs.length) / pageSize));
            debug(`Received ${fetchedJobs.length} jobs (legacy shape).`);
          } else if (Array.isArray(pmResponse)) {
            fetchedJobs = pmResponse as Job[];
            setTotalCount(fetchedJobs.length);
            setTotalPages(1);
          } else {
            debug(`Unexpected PM jobs response format:`, pmResponse);
          }
        }
      } catch (e) {
        debug(`PM jobs endpoint failed:`, e);
      }

      // 2) Fallback to generic jobs endpoint with is_preventivemaintenance=true
      if (!fetchedJobs) {
        const fallbackParams = { ...params, is_preventivemaintenance: 'true' };
        const fallbackUrl = `/api/v1/jobs${Object.keys(fallbackParams).length ? `?${toQuery(fallbackParams)}` : ''}`;
        debug(`Falling back to jobs endpoint: ${fallbackUrl}`);
        const response = await fetchData<any>(fallbackUrl, createAuthConfig());
        if (response) {
          if (Array.isArray(response.results)) {
            fetchedJobs = response.results as Job[];
            setTotalCount(typeof response.count === 'number' ? response.count : fetchedJobs.length);
            setTotalPages(Math.ceil((response.count || fetchedJobs.length) / pageSize));
            debug(`Received ${fetchedJobs.length} jobs from fallback (paginated)`);
          } else if (Array.isArray(response)) {
            fetchedJobs = response as Job[];
            setTotalCount(fetchedJobs.length);
            setTotalPages(1);
            debug(`Received ${fetchedJobs.length} jobs from fallback (array)`);
          } else {
            debug(`Unexpected fallback jobs response format:`, response);
            fetchedJobs = [];
          }
        }
      }

      const requestEndTime = performance.now();
      const requestDuration = requestEndTime - requestStartTime;
      debug(`Request completed in ${requestDuration.toFixed(2)}ms`);
      
      // Update state with fetched jobs
      setJobs(fetchedJobs || []);
      setLastLoadTime(now.getTime());
      setRetryCount(0);
      
      // Also update refs
      lastLoadTimeRef.current = now;
      lastQueryKeyRef.current = cacheKey;
      retryCountRef.current = 0;
      
      // Cache the results
      if (cacheKey) {
        localStorage.setItem(cacheKey, JSON.stringify({
          data: fetchedJobs || [],
          timestamp: now.toISOString()
        }));
      }
      
      debug(`Successfully loaded ${(fetchedJobs || []).length} PM jobs`);
      
    } catch (err) {
      debug(`Error loading jobs:`, err);

      // Surface the error instead of silently returning empty results
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      
      // Set the error message
      setError(errorMessage);
      
      // Do not clear existing jobs on error
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [propertyId, page, pageSize, autoLoad, initialJobs, isPM, cacheKey, checkPropertyPMStatus, setJobs, setLoading, setError, setLastLoadTime, createAuthConfig]);

  useEffect(() => {
    if (autoLoad) {
      debug(`Auto-loading jobs (initialJobs=${initialJobs.length})`);
      if (initialJobs.length === 0) {
        loadJobs();
      } else {
        setJobs(initialJobs);
        const now = new Date();
        setLastLoadTime(now.getTime());
        lastLoadTimeRef.current = now;
      }
    }
  }, [autoLoad, initialJobs, loadJobs, setJobs, setLastLoadTime]);

  const updateJob = useCallback((updatedJob: Job) => {
    debug(`Updating job ${updatedJob.job_id}`);
    updateStoreJob(updatedJob);
    
    // Update the cache with the modified job list
    const cachedDataString = localStorage.getItem(cacheKey);
    if (cachedDataString) {
      try {
        const cachedData: CachedData = JSON.parse(cachedDataString);
        const updatedJobs = cachedData.data.map((job: Job) => 
          job.job_id === updatedJob.job_id ? updatedJob : job
        );
        
        localStorage.setItem(cacheKey, JSON.stringify({
          data: updatedJobs,
          timestamp: new Date().toISOString()
        }));
        debug(`Updated job in cache`);
      } catch (e) {
        debug(`Error updating job in cache:`, e);
        console.warn('Error updating job in cache:', e);
      }
    }
  }, [cacheKey, updateStoreJob]);

  const getStats = useCallback((): PMJobsStats => {
    const total = jobs.length;
    const completed = jobs.filter(job => job.status === 'completed').length;
    const active = jobs.filter(job => job.status !== 'completed' && job.status !== 'cancelled').length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    
    return {
      total,
      active,
      completed,
      completionRate
    };
  }, [jobs]);

  // Clear cache function for testing
  const clearCache = useCallback(() => {
    debug(`Clearing cache for ${cacheKey}`);
    localStorage.removeItem(cacheKey);
    setLastLoadTime(null);
    lastLoadTimeRef.current = null;
  }, [cacheKey, setLastLoadTime]);

  // Toggle debug mode
  const toggleDebugMode = useCallback(() => {
    const currentMode = localStorage.getItem('debug_mode') === 'true';
    localStorage.setItem('debug_mode', (!currentMode).toString());
    debug(`Debug mode ${!currentMode ? 'enabled' : 'disabled'}`);
    return !currentMode;
  }, []);

  return {
    jobs,
    isLoading,
    error,
    loadJobs,
    updateJob,
    getStats,
    retryCount,
    lastLoadTime: lastLoadTime ? new Date(lastLoadTime) : null,
    isPMProperty,
    clearCache,
    debugInfo,
    toggleDebugMode,
    // Pagination API
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    totalCount
  };
}