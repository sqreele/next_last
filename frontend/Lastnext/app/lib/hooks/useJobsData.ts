"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/app/lib/session.client";
import { useMainStore } from "@/app/lib/stores/mainStore";
import type { Job } from "@/app/lib/types";
import {
  isCurrentMyJobsRequest,
  isMyJobsAbortError,
  requestMyJobsPage,
  type MyJobsFilters,
  type MyJobsStatusCounts,
} from "@/app/lib/hooks/my-jobs-request.mjs";

interface UseJobsDataOptions {
  propertyId?: string | null;
  page?: number;
  pageSize?: number;
  filters?: MyJobsFilters;
}

interface UseJobsDataReturn {
  jobs: Job[];
  setJobs: React.Dispatch<React.SetStateAction<Job[]>>;
  addJob: (newJob: Job) => void;
  updateJob: (updatedJob: Job) => void;
  removeJob: (jobId: string | number) => void;
  isLoading: boolean;
  error: string | null;
  activePropertyId: string | null;
  refreshJobs: (showToast?: boolean) => Promise<boolean>;
  lastRefreshed: Date | null;
  totalCount: number;
  totalPages: number;
  canOperateProperty: boolean;
  statusCounts: MyJobsStatusCounts;
}

const EMPTY_STATUS_COUNTS: MyJobsStatusCounts = {
  total: 0,
  pending: 0,
  in_progress: 0,
  waiting_sparepart: 0,
  completed: 0,
  cancelled: 0,
};

export function useJobsData(options?: UseJobsDataOptions): UseJobsDataReturn {
  const { status: sessionStatus } = useSession();
  const activePropertyId = options?.propertyId || null;
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 24;
  const search = options?.filters?.search || "";
  const status = options?.filters?.status || "all";
  const priority = options?.filters?.priority || "all";
  const date = options?.filters?.date || "all";
  const roomName = options?.filters?.room_name || "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(sessionStatus === "loading");
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [canOperateProperty, setCanOperateProperty] = useState(false);
  const [statusCounts, setStatusCounts] = useState<MyJobsStatusCounts>(
    EMPTY_STATUS_COUNTS,
  );

  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const clearResults = useCallback(() => {
    setJobs([]);
    setTotalCount(0);
    setTotalPages(0);
    setCanOperateProperty(false);
    setStatusCounts(EMPTY_STATUS_COUNTS);
  }, []);

  const refreshJobs = useCallback(async (): Promise<boolean> => {
    controllerRef.current?.abort();
    const requestId = ++requestIdRef.current;

    if (sessionStatus === "loading") {
      setIsLoading(true);
      return false;
    }
    if (sessionStatus !== "authenticated") {
      clearResults();
      setError(
        sessionStatus === "unauthenticated"
          ? "Please sign in to view your jobs."
          : null,
      );
      setIsLoading(false);
      return false;
    }
    if (!activePropertyId) {
      clearResults();
      setError(null);
      setIsLoading(false);
      return false;
    }

    const requestPropertyId = activePropertyId;
    const controller = new AbortController();
    controllerRef.current = controller;
    clearResults();
    setError(null);
    setIsLoading(true);

    try {
      const response = await requestMyJobsPage({
        propertyId: requestPropertyId,
        page,
        pageSize,
        filters: { search, status, priority, date, room_name: roomName },
        signal: controller.signal,
      });
      const isCurrent = isCurrentMyJobsRequest({
        requestId,
        currentRequestId: requestIdRef.current,
        requestPropertyId,
        currentPropertyId: useMainStore.getState().selectedPropertyId,
      });
      if (!response || !isCurrent) return false;

      setJobs(response.results);
      setTotalCount(response.count);
      setTotalPages(response.total_pages);
      setCanOperateProperty(response.can_operate === true);
      setStatusCounts({ ...EMPTY_STATUS_COUNTS, ...response.status_counts });
      setLastRefreshed(new Date());
      return true;
    } catch (requestError) {
      if (controller.signal.aborted || isMyJobsAbortError(requestError)) {
        return false;
      }
      if (requestId !== requestIdRef.current) return false;
      clearResults();
      const statusCode = (requestError as Error & { status?: number }).status;
      if (statusCode === 403) {
        setError("You do not have access to My Jobs for this property.");
      } else if (statusCode === 401) {
        setError("Your session expired. Please sign in again.");
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load My Jobs.",
        );
      }
      return false;
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [
    activePropertyId,
    clearResults,
    date,
    page,
    pageSize,
    priority,
    roomName,
    search,
    sessionStatus,
    status,
  ]);

  useEffect(() => {
    void refreshJobs();
    return () => controllerRef.current?.abort();
  }, [refreshJobs]);

  const addJob = useCallback(
    (newJob: Job) => {
      if (String(newJob.property_id || "") === activePropertyId) {
        setJobs((current) => [newJob, ...current]);
      }
    },
    [activePropertyId],
  );

  const updateJob = useCallback((updatedJob: Job) => {
    setJobs((current) =>
      current.map((job) =>
        String(job.job_id) === String(updatedJob.job_id) ? updatedJob : job,
      ),
    );
  }, []);

  const removeJob = useCallback((jobId: string | number) => {
    setJobs((current) =>
      current.filter((job) => String(job.job_id) !== String(jobId)),
    );
    setTotalCount((current) => Math.max(0, current - 1));
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
    lastRefreshed,
    totalCount,
    totalPages,
    canOperateProperty,
    statusCounts,
  };
}
