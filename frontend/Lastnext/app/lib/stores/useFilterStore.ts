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

      setStatus: (status) => set({ status, page: 1 }),
      setPriority: (priority) => set({ priority, page: 1 }),
      setTimeRange: (timeRange) => set({ timeRange, page: 1 }),
      setSearch: (search) => set({ search, page: 1 }),
      setPropertyId: (propertyId) => set({ propertyId, page: 1 }),
      setFrequency: (frequency) => set({ frequency, page: 1 }),
      setStartDate: (start_date) => set({ start_date, page: 1 }),
      setEndDate: (end_date) => set({ end_date, page: 1 }),
      setPage: (page) => set({ page }),
      setPageSize: (page_size) => set({ page_size, page: 1 }),
      setMachineId: (machine_id) => set({ machine_id, page: 1 }),
      
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
      version: 2,
      migrate: (persistedState) => {
        const saved = (persistedState || {}) as Partial<FilterState>;
        // Deliberately omit page: hydration then keeps the store default of 1.
        return {
          status: saved.status ?? 'all',
          priority: saved.priority ?? 'all',
          timeRange: saved.timeRange ?? 'all',
          propertyId: saved.propertyId ?? null,
          frequency: saved.frequency ?? 'all',
          start_date: saved.start_date ?? '',
          end_date: saved.end_date ?? '',
          page_size: saved.page_size ?? 10,
          machine_id: saved.machine_id ?? '',
        };
      },
      partialize: (state) => ({
        status: state.status,
        priority: state.priority,
        timeRange: state.timeRange,
        propertyId: state.propertyId,
        frequency: state.frequency,
        start_date: state.start_date,
        end_date: state.end_date,
        page_size: state.page_size,
        machine_id: state.machine_id,
      }),
    }
  )
);
