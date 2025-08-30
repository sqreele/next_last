// app/lib/PreventiveContext.tsx

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useClientAuth0 } from './auth0';
import { useSession } from '@/app/lib/session.client';
import { Property } from '@/app/lib/types';
import { usePreventiveMaintenanceStore, useAuthStore } from '@/app/lib/stores';
import { 
  preventiveMaintenanceService,
  setPreventiveMaintenanceServiceToken,
  CreatePreventiveMaintenanceData, 
  UpdatePreventiveMaintenanceData,
  CompletePreventiveMaintenanceData
} from '@/app/lib/PreventiveMaintenanceService';
import { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';
import TopicService from '@/app/lib/TopicService';
import MachineService, { Machine } from '@/app/lib/MachineService';
import { Topic } from '@/app/lib/TopicService';
import type { SearchParams, DashboardStats } from '@/app/lib/stores';

export interface PreventiveMaintenanceContextType {
  maintenanceItems: any[];
  topics: Topic[];
  machines: Machine[];
  statistics: DashboardStats | null;
  selectedMaintenance: any | null;
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  filterParams: SearchParams;
  
  // Actions
  fetchMaintenanceItems: (params?: SearchParams) => Promise<void>;
  fetchStatistics: () => Promise<void>;
  fetchMaintenanceById: (pmId: string) => Promise<any | null>;
  fetchMaintenanceByMachine: (machineId: string) => Promise<void>;
  createMaintenance: (data: CreatePreventiveMaintenanceData) => Promise<any | null>;
  updateMaintenance: (pmId: string, data: UpdatePreventiveMaintenanceData) => Promise<any | null>;
  deleteMaintenance: (pmId: string) => Promise<boolean>;
  completeMaintenance: (pmId: string, data: CompletePreventiveMaintenanceData) => Promise<any | null>;
  fetchTopics: () => Promise<void>;
  fetchMachines: (propertyId?: string) => Promise<void>;
  setFilterParams: (params: SearchParams) => void;
  clearError: () => void;
  debugMachineFilter: (machineId: string) => Promise<void>;
  testMachineFiltering: () => void;
}

const PreventiveMaintenanceContext = createContext<PreventiveMaintenanceContextType | undefined>(undefined);

export function PreventiveMaintenanceProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useClientAuth0();
  const { selectedProperty } = useAuthStore();
  
  // Zustand store
  const {
    maintenanceItems,
    topics,
    machines,
    statistics,
    selectedMaintenance,
    totalCount,
    isLoading,
    error,
    filterParams,
    setMaintenanceItems,
    setTopics,
    setMachines,
    setStatistics,
    setSelectedMaintenance,
    setTotalCount,
    setLoading,
    setError,
    setFilterParams,
    clearError: clearStoreError,
    clear: clearStore
  } = usePreventiveMaintenanceStore();

  // Set the access token on the singleton service whenever it changes
  useEffect(() => {
    if (accessToken) {
      setPreventiveMaintenanceServiceToken(accessToken);
    }
  }, [accessToken]);

  // Enhanced fetchMachines function
  const fetchMachines = useCallback(async (propertyId?: string) => {
    try {
      // Production mode: Always make real API calls
      console.log('🏭 Fetching machines...');
      const machineService = new MachineService();
      const response = await machineService.getMachines(propertyId || selectedProperty || undefined);

      if (response.success && response.data) {
        console.log(`✅ Loaded ${response.data.length} machines:`, response.data);
        setMachines(response.data);
      } else {
        console.warn('⚠️ Failed to fetch machines:', response.message);
        setMachines([]);
      }
    } catch (err: any) {
      console.warn('⚠️ Error fetching machines (machines may not be available):', err.message);
      setMachines([]);
    }
  }, [selectedProperty, setMachines, accessToken]);

  // Fetch topics
  const fetchTopics = useCallback(async () => {
    try {
      // Production mode: Always make real API calls
      const topicService = new TopicService();
      const response = await topicService.getTopics(accessToken || undefined);
      if (response.success && response.data) {
        setTopics(response.data);
      }
    } catch (error) {
      console.error('Error fetching topics:', error);
    }
  }, [setTopics, accessToken]);

  // Fetch maintenance items
  const fetchMaintenanceItems = useCallback(async (params?: SearchParams) => {
    setLoading(true);
    clearStoreError();

    try {
      const fetchParams = { ...filterParams, property_id: selectedProperty || filterParams.property_id, ...params };
      console.log('🔄 Fetching maintenance items with params:', fetchParams);

      const response = await preventiveMaintenanceService.getAllPreventiveMaintenance(fetchParams);
      
      if (response.success && response.data) {
        // Handle both array and paginated responses
        let items: PreventiveMaintenance[];
        let total: number;
        
        if (Array.isArray(response.data)) {
          items = response.data;
          total = response.data.length;
        } else {
          // Paginated response
          items = response.data.results;
          total = response.data.count;
        }
        
        setMaintenanceItems(items);
        setTotalCount(total);
      } else {
        setError(response.message || 'Failed to fetch maintenance items');
        setMaintenanceItems([]);
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred while fetching maintenance items');
      setMaintenanceItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterParams, selectedProperty, setLoading, clearStoreError, setMaintenanceItems, setTotalCount, setError]);

  // Fetch statistics
  const fetchStatistics = useCallback(async () => {
    try {
      const response = await preventiveMaintenanceService.getEnhancedStatistics(30);
      if (response.success && response.data) {
        // Convert the service response to match the store's expected format
        const convertedStats = {
          ...response.data,
          frequency_distribution: response.data.frequency_distribution.reduce((acc, item) => {
            acc[item.frequency as any] = item.count;
            return acc;
          }, {} as Record<string, number>)
        };
        setStatistics(convertedStats);
      }
    } catch (error: any) {
      console.error('Error fetching statistics:', error);
    }
  }, [setStatistics]);

  // Fetch maintenance by ID
  const fetchMaintenanceById = useCallback(async (pmId: string) => {
    try {
      const response = await preventiveMaintenanceService.getPreventiveMaintenanceById(pmId);
      if (response.success && response.data) {
        setSelectedMaintenance(response.data);
        return response.data;
      }
      return null;
    } catch (error: any) {
      console.error('Error fetching maintenance by ID:', error);
      return null;
    }
  }, [setSelectedMaintenance]);

  // Fetch maintenance by machine
  const fetchMaintenanceByMachine = useCallback(async (machineId: string) => {
    try {
      const response = await preventiveMaintenanceService.getPreventiveMaintenanceByMachine(machineId);
      if (response.success && response.data) {
        // Handle both array and paginated responses
        let items: PreventiveMaintenance[];
        let total: number;
        
        if (Array.isArray(response.data)) {
          items = response.data;
          total = response.data.length;
        } else {
          // Paginated response
          items = response.data.results;
          total = response.data.count;
        }
        
        setMaintenanceItems(items);
        setTotalCount(total);
      }
    } catch (error: any) {
      console.error('Error fetching maintenance by machine:', error);
    }
  }, [setMaintenanceItems, setTotalCount]);

  // Create maintenance
  const createMaintenance = useCallback(async (data: CreatePreventiveMaintenanceData) => {
    try {
      const response = await preventiveMaintenanceService.createPreventiveMaintenance(data);
      if (response.success && response.data) {
        // Refresh the list
        await fetchMaintenanceItems();
        return response.data;
      }
      return null;
    } catch (error: any) {
      console.error('Error creating maintenance:', error);
      return null;
    }
  }, [fetchMaintenanceItems]);

  // Update maintenance
  const updateMaintenance = useCallback(async (pmId: string, data: UpdatePreventiveMaintenanceData) => {
    try {
      const response = await preventiveMaintenanceService.updatePreventiveMaintenance(pmId, data);
      if (response.success && response.data) {
        // Refresh the list
        await fetchMaintenanceItems();
        return response.data;
      }
      return null;
    } catch (error: any) {
      console.error('Error updating maintenance:', error);
      return null;
    }
  }, [fetchMaintenanceItems]);

  // Delete maintenance
  const deleteMaintenance = useCallback(async (pmId: string) => {
    try {
      const response = await preventiveMaintenanceService.deletePreventiveMaintenance(pmId);
      if (response.success) {
        // Refresh the list
        await fetchMaintenanceItems();
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Error deleting maintenance:', error);
      return false;
    }
  }, [fetchMaintenanceItems]);

  // Complete maintenance
  const completeMaintenance = useCallback(async (pmId: string, data: CompletePreventiveMaintenanceData) => {
    try {
      const response = await preventiveMaintenanceService.completePreventiveMaintenance(pmId, data);
      if (response.success && response.data) {
        // Refresh the list
        await fetchMaintenanceItems();
        return response.data;
      }
      return null;
    } catch (error: any) {
      console.error('Error completing maintenance:', error);
      return null;
    }
  }, [fetchMaintenanceItems]);

  // Debug functions
  const debugMachineFilter = useCallback(async (machineId: string) => {
    console.log('🔍 Debug machine filter for:', machineId);
    await fetchMaintenanceByMachine(machineId);
  }, [fetchMaintenanceByMachine]);

  const testMachineFiltering = useCallback(() => {
    console.log('🧪 Testing machine filtering...');
    console.log('Current machines:', machines);
    console.log('Current filter params:', filterParams);
  }, [machines, filterParams]);

  // Initialize data
  useEffect(() => {
    if (accessToken) {
      fetchTopics();
      fetchMachines();
      fetchMaintenanceItems();
      fetchStatistics();
    }
  }, [accessToken, fetchTopics, fetchMachines, fetchMaintenanceItems, fetchStatistics]);

  const contextValue: PreventiveMaintenanceContextType = {
    maintenanceItems,
    topics,
    machines,
    statistics,
    selectedMaintenance,
    totalCount,
    isLoading,
    error,
    filterParams,
    fetchMaintenanceItems,
    fetchStatistics,
    fetchMaintenanceById,
    fetchMaintenanceByMachine,
    createMaintenance,
    updateMaintenance,
    deleteMaintenance,
    completeMaintenance,
    fetchTopics,
    fetchMachines,
    setFilterParams,
    clearError: clearStoreError,
    debugMachineFilter,
    testMachineFiltering
  };

  return (
    <PreventiveMaintenanceContext.Provider value={contextValue}>
      {children}
    </PreventiveMaintenanceContext.Provider>
  );
}

export function usePreventiveMaintenance() {
  const context = useContext(PreventiveMaintenanceContext);
  
  if (context === undefined) {
    throw new Error("usePreventiveMaintenance must be used within a PreventiveMaintenanceProvider");
  }
  
  return context;
}