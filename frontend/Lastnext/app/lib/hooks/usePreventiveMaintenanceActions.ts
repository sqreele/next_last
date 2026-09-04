// Hook to provide Preventive Maintenance actions using Zustand store
// This bridges the gap between Context API and Zustand during migration

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePreventiveMaintenanceStore } from '@/app/lib/stores/usePreventiveMaintenanceStore';
import { useMainStore } from '@/app/lib/stores/mainStore';
import { createPreventiveMaintenanceService } from '@/app/lib/PreventiveMaintenanceService';
import MachineService from '@/app/lib/MachineService';
import TopicService from '@/app/lib/TopicService';
import type { SearchParams } from '@/app/lib/stores/usePreventiveMaintenanceStore';
import type { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';
import { logger } from '@/app/lib/utils/logger';
import { useMinLoaderTime } from '@/app/lib/hooks/useMinLoaderTime';

export function usePreventiveMaintenanceActions() {
  const selectedProperty = useMainStore(state => state.selectedPropertyId);
  const maintenanceRequestRef = useRef(0);
  const statisticsRequestRef = useRef(0);
  const machineRequestRef = useRef(0);
  const renderedPropertyRef = useRef(selectedProperty);

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
  const { recordLoaderShown, clearLoadingAfterMinTime } =
    useMinLoaderTime(setLoading);

  const propertyChangedDuringRender = renderedPropertyRef.current !== selectedProperty;
  if (propertyChangedDuringRender) {
    renderedPropertyRef.current = selectedProperty;
  }

  // A property switch is a hard data boundary. Invalidate in-flight work and
  // remove the previous property's records before any new request can resolve.
  useEffect(() => {
    maintenanceRequestRef.current += 1;
    statisticsRequestRef.current += 1;
    machineRequestRef.current += 1;
    setMaintenanceItems([]);
    setMachines([]);
    setStatistics(null);
    setTotalCount(0);
    setError(null);
    setLoading(false);
  }, [selectedProperty, setError, setLoading, setMachines, setMaintenanceItems, setStatistics, setTotalCount]);

  // Fetch topics
  const fetchTopicsAction = useCallback(async () => {
    if (!selectedProperty) {
      setTopics([]);
      return;
    }

    try {
      const topicsData = await new TopicService().getTopics(selectedProperty);
      // Map topics to match the expected type (convert null to undefined for description)
      const mappedTopics = Array.isArray(topicsData.data)
        ? topicsData.data.map(topic => ({
            ...topic,
            description: topic.description ?? undefined
          }))
        : [];
      setTopics(mappedTopics);
    } catch (error) {
      logger.error('Error fetching topics', error);
      setError('Failed to fetch topics');
    }
  }, [selectedProperty, setTopics, setError]);

  // Fetch machines
  const fetchMachines = useCallback(async (propertyId?: string) => {
    const targetPropertyId = propertyId || selectedProperty;
    if (!targetPropertyId) {
      machineRequestRef.current += 1;
      setMachines([]);
      return;
    }

    const requestId = ++machineRequestRef.current;
    try {
      const machineService = new MachineService();
      const response = await machineService.getMachines(targetPropertyId);
      
      if (
        requestId === machineRequestRef.current &&
        useMainStore.getState().selectedPropertyId === targetPropertyId &&
        response.success &&
        response.data
      ) {
        setMachines(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
      if (
        requestId !== machineRequestRef.current ||
        useMainStore.getState().selectedPropertyId !== targetPropertyId
      ) return;
      logger.error('Error fetching machines', error);
      setError('Failed to fetch machines');
    }
  }, [selectedProperty, setMachines, setError]);

  // Fetch maintenance items
  const fetchMaintenanceItems = useCallback(async (params?: SearchParams) => {
    if (!selectedProperty) {
      maintenanceRequestRef.current += 1;
      setMaintenanceItems([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    // Only the newest pagination/filter request may update the list. Without
    // this guard, a slower response for page 1 can overwrite page 2 after the
    // user navigates quickly.
    const requestId = ++maintenanceRequestRef.current;

    // The page chooses a full skeleton or an in-place overlay based on whether
    // settled items already exist. Both states share one request-safe timer.
    const currentState = usePreventiveMaintenanceStore.getState();
    const loaderGeneration = recordLoaderShown();
    setLoading(true);
    clearStoreError();

    try {
      const { property_id: _storedPropertyId, ...storedFilters } = currentState.filterParams;
      const { property_id: _requestedPropertyId, ...requestedFilters } = params || {};
      const fetchParams = {
        ...storedFilters,
        ...requestedFilters,
        property_id: selectedProperty,
      };
      
      logger.debug('Fetching maintenance items with params', fetchParams);

      const service = createPreventiveMaintenanceService();
      const response = await service.getAllPreventiveMaintenance(fetchParams);

      if (requestId !== maintenanceRequestRef.current) return;
      
      if (response.success && response.data) {
        let items: any[];
        let total: number;
        let totalPages: number | undefined;
        let currentPage: number | undefined;
        
        if (Array.isArray(response.data)) {
          items = response.data;
          total = response.data.length;
          totalPages = 1;
          currentPage = 1;
        } else {
          // Paginated response - TypeScript now knows this is PaginatedMaintenanceResponse
          // Import the type from PreventiveMaintenanceService or define it locally
          type PaginatedResponse = {
            results?: PreventiveMaintenance[];
            count?: number;
            total_pages?: number;
            current_page?: number;
            page_size?: number;
          };
          
          const paginatedResponse = response.data as PaginatedResponse;
          
          items = paginatedResponse.results || [];
          total = paginatedResponse.count || 0;
          totalPages = paginatedResponse.total_pages;
          currentPage = paginatedResponse.current_page;
        }
        
        setMaintenanceItems(items);
        setTotalCount(total);
        
        // Update filter params with current page if paginated (but don't trigger another fetch)
        // This ensures the UI state matches the backend response
        // Check if response is paginated (not an array) and has page_size property
        if (totalPages !== undefined && currentPage !== undefined && !Array.isArray(response.data)) {
          // Type guard: check if it's a paginated response
          const paginatedData = response.data as { page_size?: number };
          
          // Only proceed if page_size exists
          if (paginatedData.page_size !== undefined) {
            // Validate that currentPage doesn't exceed totalPages
            const validCurrentPage = Math.max(1, Math.min(currentPage, totalPages));
            
            if (validCurrentPage !== currentPage) {
              console.warn('[PM Fetch] Backend returned invalid page, correcting:', {
                returnedPage: currentPage,
                totalPages,
                validPage: validCurrentPage
              });
            }
            
            // Only update if different to avoid infinite loops
            const currentFilterParams = usePreventiveMaintenanceStore.getState().filterParams;
            if (currentFilterParams.page !== validCurrentPage || currentFilterParams.page_size !== paginatedData.page_size) {
              setFilterParams({ 
                page: validCurrentPage,
                page_size: paginatedData.page_size
              });
              // Note: The page component's useEffect will sync this back to useFilterStore
              // when it detects the change, but we don't want to trigger another fetch here
            }
          }
        }
      } else {
        setError(response.message || 'Failed to fetch maintenance items');
        // Only clear items if we don't have existing data
        // This prevents clearing data that was visible before the error
        if (usePreventiveMaintenanceStore.getState().maintenanceItems.length === 0) {
          setMaintenanceItems([]);
        }
      }
    } catch (error: unknown) {
      if (requestId !== maintenanceRequestRef.current) return;
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while fetching maintenance items';
      logger.error('Error fetching maintenance items', error);
      setError(errorMessage);
      // Only clear items on error if we don't have existing data
      // This prevents clearing data that was visible before the error
      if (usePreventiveMaintenanceStore.getState().maintenanceItems.length === 0) {
        setMaintenanceItems([]);
      }
    } finally {
      if (requestId !== maintenanceRequestRef.current) return;
      clearLoadingAfterMinTime(loaderGeneration);
    }
  }, [selectedProperty, setLoading, clearStoreError, setMaintenanceItems, setTotalCount, setError, setFilterParams, recordLoaderShown, clearLoadingAfterMinTime]);

  // Fetch statistics
  const fetchStatistics = useCallback(async () => {
    if (!selectedProperty) {
      statisticsRequestRef.current += 1;
      setStatistics(null);
      return;
    }

    const requestId = ++statisticsRequestRef.current;

    try {
      const service = createPreventiveMaintenanceService();
      const response = await service.getMaintenanceStatistics({
        property_id: selectedProperty
      });
      
      if (requestId === statisticsRequestRef.current && response.success && response.data) {
        setStatistics(response.data);
      }
    } catch (error) {
      logger.error('Error fetching statistics', error);
      if (requestId === statisticsRequestRef.current) {
        setError('Failed to fetch maintenance statistics');
      }
    }
  }, [selectedProperty, setError, setStatistics]);

  // Delete maintenance
  const deleteMaintenance = useCallback(async (pmId: string): Promise<boolean> => {
    try {
      const service = createPreventiveMaintenanceService();
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
    }
  }, [maintenanceItems, totalCount, setMaintenanceItems, setTotalCount, setError]);

  // Fetch maintenance by ID
  const fetchMaintenanceById = useCallback(async (pmId: string): Promise<any | null> => {
    try {
      setLoading(true);
      logger.debug('Fetching maintenance by ID', { pmId });
      
      const service = createPreventiveMaintenanceService();
      const response = await service.getPreventiveMaintenanceById(pmId);
      
      logger.debug('Fetch maintenance by ID response', { 
        success: response.success, 
        hasData: !!response.data,
        message: response.message 
      });
      
      if (response.success && response.data) {
        setSelectedMaintenance(response.data);
        return response.data;
      } else {
        const errorMsg = response.message || 'Failed to fetch maintenance item';
        logger.error('Failed to fetch maintenance', { pmId, message: errorMsg });
        setError(errorMsg);
        return null;
      }
    } catch (error: any) {
      logger.error('Error fetching maintenance by ID', { 
        pmId, 
        error: error.message,
        status: error.status,
        response: error.response 
      });
      setError(error.message || 'Failed to fetch maintenance item');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setSelectedMaintenance, setError]);

  // Update maintenance
  const updateMaintenance = useCallback(async (pmId: string, data: any): Promise<any | null> => {
    try {
      setLoading(true);
      const service = createPreventiveMaintenanceService();
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
    } catch (error: any) {
      logger.error('Error updating maintenance', error);
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update maintenance item';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [maintenanceItems, setLoading, setMaintenanceItems, setError]);

  // Complete maintenance
  const completeMaintenance = useCallback(async (pmId: string, data: any): Promise<any | null> => {
    try {
      setLoading(true);
      const service = createPreventiveMaintenanceService();
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
  }, [maintenanceItems, setLoading, setMaintenanceItems, setError]);

  return {
    // State
    maintenanceItems: propertyChangedDuringRender ? [] : maintenanceItems,
    topics,
    machines: propertyChangedDuringRender ? [] : machines,
    statistics: propertyChangedDuringRender ? null : statistics,
    selectedMaintenance,
    totalCount: propertyChangedDuringRender ? 0 : totalCount,
    isLoading: propertyChangedDuringRender && Boolean(selectedProperty) ? true : isLoading,
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
