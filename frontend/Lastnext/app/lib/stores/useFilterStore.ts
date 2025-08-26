"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FilterState {
  status: string;
  priority: string;
  timeRange: string;
  search: string;
  propertyId: string | null;
  frequency: string;
  start_date: string;
  end_date: string;
  page: number;
  page_size: number;
  machine_id: string;
  
  // Actions
  setStatus: (status: string) => void;
  setPriority: (priority: string) => void;
  setTimeRange: (timeRange: string) => void;
  setSearch: (search: string) => void;
  setPropertyId: (propertyId: string | null) => void;
  setFrequency: (frequency: string) => void;
  setStartDate: (start_date: string) => void;
  setEndDate: (end_date: string) => void;
  setPage: (page: number) => void;
  setPageSize: (page_size: number) => void;
  setMachineId: (machine_id: string) => void;
  resetFilters: () => void;
  updateFilters: (filters: Partial<Omit<FilterState, 'resetFilters' | 'updateFilters'>>) => void;
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      status: 'all',
      priority: 'all',
      timeRange: 'all',
      search: '',
      propertyId: null,
      frequency: 'all',
      start_date: '',
      end_date: '',
      page: 1,
      page_size: 10,
      machine_id: '',

      setStatus: (status) => set({ status }),
      setPriority: (priority) => set({ priority }),
      setTimeRange: (timeRange) => set({ timeRange }),
      setSearch: (search) => set({ search }),
      setPropertyId: (propertyId) => set({ propertyId }),
      setFrequency: (frequency) => set({ frequency }),
      setStartDate: (start_date) => set({ start_date }),
      setEndDate: (end_date) => set({ end_date }),
      setPage: (page) => set({ page }),
      setPageSize: (page_size) => set({ page_size }),
      setMachineId: (machine_id) => set({ machine_id }),
      
      resetFilters: () => set({
        status: 'all',
        priority: 'all',
        timeRange: 'all',
        search: '',
        propertyId: null,
        frequency: 'all',
        start_date: '',
        end_date: '',
        page: 1,
        page_size: 10,
        machine_id: '',
      }),

      updateFilters: (filters) => set((state) => ({ ...state, ...filters })),
    }),
    {
      name: "filter-storage",
      partialize: (state) => ({
        status: state.status,
        priority: state.priority,
        timeRange: state.timeRange,
        propertyId: state.propertyId,
        frequency: state.frequency,
        start_date: state.start_date,
        end_date: state.end_date,
        page: state.page,
        page_size: state.page_size,
        machine_id: state.machine_id,
      }),
    }
  )
);
