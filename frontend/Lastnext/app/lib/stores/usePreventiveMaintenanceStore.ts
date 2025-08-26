"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PreventiveMaintenance, FrequencyType, Topic } from "@/app/lib/preventiveMaintenanceModels";
import type { Machine } from "@/app/lib/MachineService";

export interface SearchParams {
  status?: string;
  frequency?: string;
  page?: number;
  page_size?: number;
  search?: string;
  start_date?: string;
  end_date?: string;
  property_id?: string;
  topic_id?: string;
  machine_id?: string;
}

export interface DashboardStats {
  counts: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
  };
  frequency_distribution: Record<FrequencyType, number>;
  upcoming: PreventiveMaintenance[];
  avg_completion_times: Record<string, number>;
}

interface PreventiveMaintenanceState {
  maintenanceItems: PreventiveMaintenance[];
  topics: Topic[];
  machines: Machine[];
  statistics: DashboardStats | null;
  selectedMaintenance: PreventiveMaintenance | null;
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  filterParams: SearchParams;
  
  // Actions
  setMaintenanceItems: (items: PreventiveMaintenance[]) => void;
  setTopics: (topics: Topic[]) => void;
  setMachines: (machines: Machine[]) => void;
  setStatistics: (stats: DashboardStats | null) => void;
  setSelectedMaintenance: (item: PreventiveMaintenance | null) => void;
  setTotalCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFilterParams: (params: Partial<SearchParams>) => void;
  clearError: () => void;
  clear: () => void;
  
  // Computed
  getFilteredItems: () => PreventiveMaintenance[];
  getItemsByStatus: (status: string) => PreventiveMaintenance[];
  getItemsByFrequency: (frequency: FrequencyType) => PreventiveMaintenance[];
}

export const usePreventiveMaintenanceStore = create<PreventiveMaintenanceState>()(
  persist(
    (set, get) => ({
      maintenanceItems: [],
      topics: [],
      machines: [],
      statistics: null,
      selectedMaintenance: null,
      totalCount: 0,
      isLoading: false,
      error: null,
      filterParams: {
        status: '',
        page: 1,
        page_size: 10,
      },

      setMaintenanceItems: (items) => set({ maintenanceItems: items, totalCount: items.length }),
      setTopics: (topics) => set({ topics }),
      setMachines: (machines) => set({ machines }),
      setStatistics: (stats) => set({ statistics: stats }),
      setSelectedMaintenance: (item) => set({ selectedMaintenance: item }),
      setTotalCount: (count) => set({ totalCount: count }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setFilterParams: (params) => set((state) => ({ 
        filterParams: { ...state.filterParams, ...params, page: 1 } 
      })),
      clearError: () => set({ error: null }),
      clear: () => set({
        maintenanceItems: [],
        topics: [],
        machines: [],
        statistics: null,
        selectedMaintenance: null,
        totalCount: 0,
        isLoading: false,
        error: null,
        filterParams: { status: '', page: 1, page_size: 10 },
      }),

      getFilteredItems: () => {
        const { maintenanceItems, filterParams } = get();
        let filtered = [...maintenanceItems];

        if (filterParams.status) {
          filtered = filtered.filter(item => item.status === filterParams.status);
        }

        if (filterParams.frequency) {
          filtered = filtered.filter(item => item.frequency === filterParams.frequency);
        }

        if (filterParams.search) {
          const search = filterParams.search.toLowerCase();
          filtered = filtered.filter(item => 
            item.pmtitle?.toLowerCase().includes(search) ||
            item.notes?.toLowerCase().includes(search)
          );
        }

        if (filterParams.property_id) {
          filtered = filtered.filter(item => item.property_id === filterParams.property_id);
        }

        if (filterParams.topic_id) {
          filtered = filtered.filter(item => 
            item.topics?.some(topic => topic.id === parseInt(filterParams.topic_id!))
          );
        }

        if (filterParams.machine_id) {
          filtered = filtered.filter(item => 
            item.machines?.some(machine => machine.machine_id === filterParams.machine_id)
          );
        }

        return filtered;
      },

      getItemsByStatus: (status) => {
        const { maintenanceItems } = get();
        return maintenanceItems.filter(item => item.status === status);
      },

      getItemsByFrequency: (frequency) => {
        const { maintenanceItems } = get();
        return maintenanceItems.filter(item => item.frequency === frequency);
      },
    }),
    {
      name: "pm-storage",
      partialize: (state) => ({
        filterParams: state.filterParams,
        selectedMaintenance: state.selectedMaintenance,
      }),
    }
  )
);
