// @/app/lib/hooks/useJobsData.js
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "@/app/lib/session.client";
// Import specific functions needed from the updated data.server.ts
import { fetchAllJobsForProperty, fetchAllMyJobs } from "@/app/lib/data.server";
import { useUser } from "@/app/lib/stores/mainStore";
import { Job } from "@/app/lib/types";

interface UseJobsDataOptions {
  propertyId?: string | null;
  filters?: {
    room_id?: string | null;
    room_name?: string | null;
    status?: string;
    is_preventivemaintenance?: boolean | null;
    search?: string;
    user_id?: string | null;
  };
}

interface UseJobsDataReturn {
  jobs: Job[];
  setJobs: React.Dispatch<React.SetStateAction<Job[]>>;
  addJob: (newJob: Job) => void; // Kept for potential optimistic updates
  updateJob: (updatedJob: Job) => void; // Kept for local state updates
  removeJob: (jobId: string | number) => void; // Kept for local state updates
  isLoading: boolean;
  error: string | null;
  activePropertyId: string | null;
  refreshJobs: (showToast?: boolean) => Promise<boolean>;
  lastRefreshed: Date | null;
}

export function useJobsData(options?: UseJobsDataOptions): UseJobsDataReturn {
  const { data: session, status: sessionStatus } = useSession();
  const { userProfile } = useUser();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const activePropertyId = options?.propertyId !== undefined ? options.propertyId : null;

  const refreshJobs = useCallback(async (showToast = false): Promise<boolean> => {
    if (sessionStatus === 'loading') {
        setIsLoading(true);
        return false;
    }
    // Assuming api-client handles auth, we just need session to be loaded for user details
    if (sessionStatus === 'unauthenticated') {
      setJobs([]);
      setError("Not authenticated. Please sign in.");
      setIsLoading(false);
      return false;
    }
    // Need user details for client-side filtering
    if (!session?.user?.id || !session?.user?.username) {
        setJobs([]);
        setError("User details not available in session.");
        setIsLoading(false);
        return false;
    }


    setIsLoading(true);
    setError(null);

    try {
      let fetchedJobs: Job[] = [];
      // *** CHOOSE FETCH FUNCTION BASED ON PROPERTY ID ***
      if (activePropertyId) {
        console.log(`useJobsData: Fetching jobs for property ${activePropertyId}`);
        // Build query parameters for additional filtering
        const queryParams = new URLSearchParams();
        const filters = options?.filters;
        if (filters) {
          if (filters.room_id) queryParams.append('room_id', filters.room_id);
          if (filters.room_name) queryParams.append('room_name', filters.room_name);
          if (filters.status && filters.status !== 'all') queryParams.append('status', filters.status);
          if (filters.is_preventivemaintenance !== null && filters.is_preventivemaintenance !== undefined) queryParams.append('is_preventivemaintenance', filters.is_preventivemaintenance.toString());
          if (filters.search) queryParams.append('search', filters.search);
          if (filters.user_id && filters.user_id !== 'all') queryParams.append('user_id', filters.user_id);
        }
        
        const queryString = queryParams.toString();
        fetchedJobs = await fetchAllJobsForProperty(activePropertyId, session.user.accessToken, queryString);
      } else {
        console.log("useJobsData: Fetching my jobs (user-specific)");
        // Build query parameters for room filtering
        const queryParams = new URLSearchParams();
        const filters = options?.filters;
        if (filters) {
          if (filters.room_id) queryParams.append('room_id', filters.room_id);
          if (filters.room_name) queryParams.append('room_name', filters.room_name);
          if (filters.status && filters.status !== 'all') queryParams.append('status', filters.status);
          if (filters.is_preventivemaintenance !== null && filters.is_preventivemaintenance !== undefined) queryParams.append('is_preventivemaintenance', filters.is_preventivemaintenance.toString());
          if (filters.search) queryParams.append('search', filters.search);
          if (filters.user_id && filters.user_id !== 'all') queryParams.append('user_id', filters.user_id);
        }
        
        const queryString = queryParams.toString();
        fetchedJobs = await fetchAllMyJobs(session.user.accessToken, queryString);
      }

      console.log(`useJobsData: Fetched ${fetchedJobs.length} jobs`);
      console.log(`useJobsData: Jobs data:`, fetchedJobs);

      // *** NO NEED FOR CLIENT-SIDE USER FILTERING WHEN USING fetchMyJobs ***
      // The backend now handles user filtering automatically
      setJobs(fetchedJobs);
      setLastRefreshed(new Date());
      return true; // Success
    } catch (err) {
       // Error handling using the message from handleApiError (if thrown)
       let errorMessage = "Failed to fetch jobs. Please try again.";
       if (err instanceof Error) {
           // Use the message directly, as handleApiError structures it
           errorMessage = err.message;
           // Optionally check err.status if needed
           if ((err as any).status === 401) {
                errorMessage = `Authentication failed: ${err.message}. Please sign in again.`;
           }
       }
      console.error("Error refreshing jobs in useJobsData:", err);
      setError(errorMessage);
      setJobs([]); // Clear jobs on error
      return false; // Failure
    } finally {
      setIsLoading(false);
    }
    // Dependencies: activePropertyId and user session details used for filtering
  }, [activePropertyId, session?.user?.id, session?.user?.username, sessionStatus]);

  // Effect runs when refreshJobs identity changes
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  // Local state modifiers (addJob, updateJob, removeJob) remain the same as your provided code
  const addJob = useCallback((newJob: Job) => {
     // Check if the job matches the current filters (user filter mainly now)
     const userId = session?.user?.id;
     const username = session?.user?.username;
     const matchesUser = newJob.user && userId && username ? (String(newJob.user) === String(userId) || String(newJob.user) === username) : false;
     // Also check property if activePropertyId is set
     const matchesProperty = !activePropertyId || (newJob.property_id && String(newJob.property_id) === activePropertyId);

     if (matchesProperty && matchesUser) {
        setJobs(prevJobs => [newJob, ...prevJobs]);
     } else {
        console.log("New job added but does not match current user/property filters.");
     }
  }, [activePropertyId, session?.user?.id, session?.user?.username]);

  const updateJob = useCallback((updatedJob: Job) => {
    setJobs(prevJobs =>
      prevJobs.map(job =>
        String(job.job_id) === String(updatedJob.job_id) ? updatedJob : job
      )
    );
  }, []);

  const removeJob = useCallback((jobId: string | number) => {
    setJobs(prevJobs =>
      prevJobs.filter(job => String(job.job_id) !== String(jobId))
    );
  }, []);


  return {
    jobs,
    setJobs,
    addJob,
    updateJob,
    removeJob,
    isLoading,
    error,
    activePropertyId,
    refreshJobs,
    lastRefreshed
  };
}
