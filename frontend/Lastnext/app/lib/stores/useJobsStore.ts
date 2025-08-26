"use client";

import { create } from "zustand";
import type { Job } from "@/app/lib/types";

interface JobsState {
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  lastLoadTime: number | null; // epoch ms
  setJobs: (jobs: Job[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastLoadTime: (ms: number | null) => void;
  updateJob: (updated: Job) => void;
  clear: () => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  isLoading: false,
  error: null,
  lastLoadTime: null,
  setJobs: (jobs) => set({ jobs }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setLastLoadTime: (ms) => set({ lastLoadTime: ms }),
  updateJob: (updated) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.job_id === updated.job_id ? updated : j)),
    })),
  clear: () => set({ jobs: [], isLoading: false, error: null, lastLoadTime: null }),
}));


