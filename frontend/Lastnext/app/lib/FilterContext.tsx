// app/lib/FilterContext.tsx

"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useFilterStore } from '@/app/lib/stores';

interface FilterContextType {
  status: string;
  priority: string;
  timeRange: string;
  search: string;
  propertyId: string | null;
  setStatus: (status: string) => void;
  setPriority: (priority: string) => void;
  setTimeRange: (timeRange: string) => void;
  setSearch: (search: string) => void;
  setPropertyId: (propertyId: string | null) => void;
  resetFilters: () => void;
  updateFilters: (filters: Partial<{
    status: string;
    priority: string;
    timeRange: string;
    search: string;
    propertyId: string | null;
  }>) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
  const {
    status,
    priority,
    timeRange,
    search,
    propertyId,
    setStatus,
    setPriority,
    setTimeRange,
    setSearch,
    setPropertyId,
    resetFilters,
    updateFilters
  } = useFilterStore();

  const contextValue: FilterContextType = {
    status,
    priority,
    timeRange,
    search,
    propertyId,
    setStatus,
    setPriority,
    setTimeRange,
    setSearch,
    setPropertyId,
    resetFilters,
    updateFilters
  };

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const context = useContext(FilterContext);
  
  if (context === undefined) {
    throw new Error("useFilter must be used within a FilterProvider");
  }
  
  return context;
}
