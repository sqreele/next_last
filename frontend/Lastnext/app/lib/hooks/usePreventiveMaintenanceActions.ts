// Hook to provide Preventive Maintenance actions using Zustand store
// This bridges the gap between Context API and Zustand during migration

'use client';

import { useCallback } from 'react';
import { useSession } from '@/app/lib/session.client';
import { usePreventiveMaintenanceStore } from '@/app/lib/stores/usePreventiveMaintenanceStore';
import { useAuthStore } from '@/app/lib/stores/useAuthStore';
import { createPreventiveMaintenanceService } from '@/app/lib/PreventiveMaintenanceService';
import { fetchTopics } from '@/app/lib/data.server';
import MachineService from '@/app/lib/MachineService';
import type { SearchParams, DashboardStats } from '@/app/lib/stores/usePreventiveMaintenanceStore';
import { logger } from '@/app/lib/utils/logger';

export function usePreventiveMaintenanceActions() {
  const { data: session } = useSession();
  const { selectedProperty } = useAuthStore();
  const accessToken = session?.user?.accessToken || null;

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
  } = usePreventiveMaintenanceStore();

  // Fetch topics
  const fetchTopicsAction = useCallback(async () => {
    if (!accessToken) {
      logger.warn('No access token available for fetching topics');
      return;
    }

    try {
      setLoading(true);
      // Use fetchTopics from data.server.ts
      const topicsData = await fetchTopics(accessToken);
      // Map topics to match the expected type (convert null to undefined for description)
      const mappedTopics = Array.isArray(topicsData) 
        ? topicsData.map(topic => ({
            ...topic,
            description: topic.description ?? undefined
          }))
        : [];
      setTopics(mappedTopics);
    } catch (error) {
      logger.error('Error fetching topics', error);
      setError('Failed to fetch topics');
    } finally {
      setLoading(false);
    }
  }, [accessToken, setLoading, setTopics, setError]);

  // Fetch machines
  const fetchMachines = useCallback(async (propertyId?: string) => {
    if (!accessToken) {
      logger.warn('No access token available for fetching machines');
      return;
    }

    try {
      setLoading(true);
      const machineService = new MachineService();
      const targetPropertyId = propertyId || selectedProperty || undefined;
      const response = await machineService.getMachines(targetPropertyId, accessToken);
      
      if (response.success && response.data) {
        setMachines(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
      logger.error('Error fetching machines', error);
      setError('Failed to fetch machines');
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedProperty, setLoading, setMachines, setError]);

  // Fetch maintenance items
  const fetchMaintenanceItems = useCallback(async (params?: SearchParams) => {
    if (!accessToken) {
      logger.warn('No access token available for fetching maintenance items');
      return;
    }

    setLoading(true);
    clearStoreError();

    try {
      const fetchParams = { 
        ...filterParams, 
        property_id: selectedProperty || filterParams.property_id, 
        ...params 
      };
      logger.debug('Fetching maintenance items with params', fetchParams);

      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.getAllPreventiveMaintenance(fetchParams);
      
      if (response.success && response.data) {
        let items: any[];
        let total: number;
        
        if (Array.isArray(response.data)) {
          items = response.data;
          total = response.data.length;
        } else {
          items = response.data.results || [];
          total = response.data.count || 0;
        }
        
        setMaintenanceItems(items);
        setTotalCount(total);
      } else {
        setError(response.message || 'Failed to fetch maintenance items');
        setMaintenanceItems([]);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while fetching maintenance items';
      logger.error('Error fetching maintenance items', error);
      setError(errorMessage);
      setMaintenanceItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterParams, selectedProperty, accessToken, setLoading, clearStoreError, setMaintenanceItems, setTotalCount, setError]);

  // Fetch statistics
  const fetchStatistics = useCallback(async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.getMaintenanceStatistics({
        property_id: selectedProperty || undefined
      });
      
      if (response.success && response.data) {
        // Type assertion to match store's DashboardStats interface
        // The API returns array format but store expects Record format
        setStatistics(response.data as unknown as DashboardStats);
      }
    } catch (error) {
      logger.error('Error fetching statistics', error);
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedProperty, setLoading, setStatistics]);

  // Delete maintenance
  const deleteMaintenance = useCallback(async (pmId: string): Promise<boolean> => {
    if (!accessToken) {
      logger.warn('No access token available for deleting maintenance');
      return false;
    }

    try {
      setLoading(true);
      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.deletePreventiveMaintenance(pmId);
      
      if (response.success) {
        // Remove from store
        setMaintenanceItems(maintenanceItems.filter(item => item.pm_id !== pmId));
        setTotalCount(totalCount - 1);
        return true;
      } else {
        setError(response.message || 'Failed to delete maintenance item');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting maintenance', error);
      setError('Failed to delete maintenance item');
      return false;
    } finally {
      setLoading(false);
    }
  }, [accessToken, maintenanceItems, totalCount, setLoading, setMaintenanceItems, setTotalCount, setError]);

  // Fetch maintenance by ID
  const fetchMaintenanceById = useCallback(async (pmId: string): Promise<any | null> => {
    if (!accessToken) {
      logger.warn('No access token available for fetching maintenance by ID');
      return null;
    }

    try {
      setLoading(true);
      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.getPreventiveMaintenanceById(pmId);
      
      if (response.success && response.data) {
        setSelectedMaintenance(response.data);
        return response.data;
      } else {
        setError(response.message || 'Failed to fetch maintenance item');
        return null;
      }
    } catch (error) {
      logger.error('Error fetching maintenance by ID', error);
      setError('Failed to fetch maintenance item');
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken, setLoading, setSelectedMaintenance, setError]);

  // Update maintenance
  const updateMaintenance = useCallback(async (pmId: string, data: any): Promise<any | null> => {
    if (!accessToken) {
      logger.warn('No access token available for updating maintenance');
      return null;
    }

    try {
      setLoading(true);
      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.updatePreventiveMaintenance(pmId, data);
      
      if (response.success && response.data) {
        // Update in store
        const updatedData = response.data;
        setMaintenanceItems(maintenanceItems.map(item => 
          item.pm_id === pmId ? updatedData : item
        ));
        return updatedData;
      } else {
        setError(response.message || 'Failed to update maintenance item');
        return null;
      }
    } catch (error) {
      logger.error('Error updating maintenance', error);
      setError('Failed to update maintenance item');
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken, maintenanceItems, setLoading, setMaintenanceItems, setError]);

  // Complete maintenance
  const completeMaintenance = useCallback(async (pmId: string, data: any): Promise<any | null> => {
    if (!accessToken) {
      logger.warn('No access token available for completing maintenance');
      return null;
    }

    try {
      setLoading(true);
      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.completePreventiveMaintenance(pmId, data);
      
      if (response.success && response.data) {
        // Update in store
        const completedData = response.data;
        setMaintenanceItems(maintenanceItems.map(item => 
          item.pm_id === pmId ? completedData : item
        ));
        return completedData;
      } else {
        setError(response.message || 'Failed to complete maintenance item');
        return null;
      }
    } catch (error) {
      logger.error('Error completing maintenance', error);
      setError('Failed to complete maintenance item');
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken, maintenanceItems, setLoading, setMaintenanceItems, setError]);

  return {
    // State
    maintenanceItems,
    topics,
    machines,
    statistics,
    selectedMaintenance,
    totalCount,
    isLoading,
    error,
    filterParams,
    
    // Actions
    fetchMaintenanceItems,
    fetchStatistics,
    fetchTopics: fetchTopicsAction,
    fetchMachines,
    fetchMaintenanceById,
    updateMaintenance,
    completeMaintenance,
    deleteMaintenance,
    setFilterParams,
    clearError: clearStoreError,
    setSelectedMaintenance,
  };
}

