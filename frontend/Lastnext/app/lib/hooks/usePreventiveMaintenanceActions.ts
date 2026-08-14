// Hook to provide Preventive Maintenance actions using Zustand store
// This bridges the gap between Context API and Zustand during migration

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSession } from '@/app/lib/session.client';
import { usePreventiveMaintenanceStore } from '@/app/lib/stores/usePreventiveMaintenanceStore';
import { useAuthStore } from '@/app/lib/stores/useAuthStore';
import { createPreventiveMaintenanceService } from '@/app/lib/PreventiveMaintenanceService';
import type { PMCompletionPayload, PMCompletionResponse, PMDetail, PMUpdatePayload, PMWriteResponse } from '@/app/lib/api/pm-contracts';
import { fetchTopics } from '@/app/lib/data.server';
import MachineService from '@/app/lib/MachineService';
import type { SearchParams, DashboardStats } from '@/app/lib/stores/usePreventiveMaintenanceStore';
import { logger } from '@/app/lib/utils/logger';

const MIN_LOADER_MS = 400;

export function usePreventiveMaintenanceActions() {
  const { data: session } = useSession();
  const { selectedProperty } = useAuthStore();
  const accessToken = session?.user?.accessToken || null;
  const loaderShownAtRef = useRef<number | null>(null);
  const maintenanceRequestRef = useRef(0);
  const deleteInFlightRef = useRef(false);
  const currentDeleteContextRef = useRef({
    propertyId: selectedProperty,
    sessionId: String(session?.user?.id || accessToken || ''),
  });
  currentDeleteContextRef.current = {
    propertyId: selectedProperty,
    sessionId: String(session?.user?.id || accessToken || ''),
  };

  // Invalidate an outstanding list request when its consumer unmounts. The
  // request may still complete at the transport layer, but it can no longer
  // write list data or pagination metadata into the shared store.
  useEffect(() => () => {
    maintenanceRequestRef.current += 1;
  }, []);

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

  const clearLoadingAfterMinTime = useCallback(() => {
    const shownAt = loaderShownAtRef.current;
    loaderShownAtRef.current = null;
    if (shownAt == null) {
      setLoading(false);
      return;
    }
    const elapsed = Date.now() - shownAt;
    const remaining = Math.max(0, MIN_LOADER_MS - elapsed);
    if (remaining === 0) {
      setLoading(false);
    } else {
      setTimeout(() => setLoading(false), remaining);
    }
  }, [setLoading]);

  // Fetch topics
  const fetchTopicsAction = useCallback(async () => {
    if (!accessToken) {
      logger.warn('No access token available for fetching topics');
      return;
    }

    try {
      setLoading(true);
      // Use fetchTopics from data.server.ts
      const topicsData = await fetchTopics(accessToken, selectedProperty);
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
  }, [accessToken, selectedProperty, setLoading, setTopics, setError]);

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

    // Only the newest pagination/filter request may update the list. Without
    // this guard, a slower response for page 1 can overwrite page 2 after the
    // user navigates quickly.
    const requestId = ++maintenanceRequestRef.current;
    const requestState = usePreventiveMaintenanceStore.getState();
    const requestFilterParams = requestState.filterParams;

    // Get current items count to determine if we should show loading state
    // Only show full loading state if we don't have existing data (initial load)
    // This prevents data from disappearing during refresh
    const hasExistingData = requestState.maintenanceItems.length > 0;
    if (!hasExistingData) {
      loaderShownAtRef.current = Date.now();
      setLoading(true);
    }
    clearStoreError();

    try {
      const fetchParams = { 
        ...requestFilterParams,
        property_id: selectedProperty || requestFilterParams.property_id,
        ...params 
      };
      
      logger.debug('Fetching maintenance items with params', fetchParams);

      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.getAllPreventiveMaintenance(fetchParams);

      if (requestId !== maintenanceRequestRef.current) return;
      
      if (response.success && response.data) {
        const items = response.data.results;
        const total = response.data.count;
        const totalPages = response.data.total_pages;
        const currentPage = response.data.current_page;
        
        setMaintenanceItems(items);
        setTotalCount(total);
        
        // Update filter params with current page if paginated (but don't trigger another fetch)
        // This ensures the UI state matches the backend response
        // Check if response is paginated (not an array) and has page_size property
        if (totalPages !== undefined && currentPage !== undefined) {
          const paginatedData = response.data;
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
      if (loaderShownAtRef.current != null) {
        clearLoadingAfterMinTime();
      } else {
        setLoading(false);
      }
    }
  }, [selectedProperty, accessToken, setLoading, clearStoreError, setMaintenanceItems, setTotalCount, setError, clearLoadingAfterMinTime, setFilterParams]);

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
    if (deleteInFlightRef.current) return false;
    if (!accessToken) {
      logger.warn('No access token available for deleting maintenance');
      return false;
    }

    const requestContext = { ...currentDeleteContextRef.current };
    const isCurrentContext = () => {
      const current = currentDeleteContextRef.current;
      return (
        current.propertyId === requestContext.propertyId
        && current.sessionId === requestContext.sessionId
      );
    };

    deleteInFlightRef.current = true;
    try {
      setLoading(true);
      clearStoreError();
      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.deletePreventiveMaintenance(pmId);

      if (!isCurrentContext()) return false;
      if (response.success) {
        // Reconcile the canonical list only after the server confirms deletion.
        // Reading the latest store state preserves unrelated records that may
        // have arrived while the DELETE request was pending.
        usePreventiveMaintenanceStore.setState((state) => {
          const exists = state.maintenanceItems.some(item => item.pm_id === pmId);
          if (!exists) return state;
          return {
            maintenanceItems: state.maintenanceItems.filter(item => item.pm_id !== pmId),
            totalCount: Math.max(0, state.totalCount - 1),
          };
        });
        return true;
      } else {
        setError(response.message || 'Failed to delete maintenance item');
        return false;
      }
    } catch (error: unknown) {
      if (!isCurrentContext()) return false;
      logger.error('Error deleting maintenance', error);
      setError(error instanceof Error ? error.message : 'Failed to delete maintenance item');
      return false;
    } finally {
      deleteInFlightRef.current = false;
      if (isCurrentContext()) setLoading(false);
    }
  }, [accessToken, setLoading, clearStoreError, setError]);

  // Fetch maintenance by ID
  const fetchMaintenanceById = useCallback(async (pmId: string): Promise<PMDetail | null> => {
    if (!accessToken) {
      logger.warn('No access token available for fetching maintenance by ID');
      return null;
    }

    try {
      setLoading(true);
      logger.debug('Fetching maintenance by ID', { pmId, hasAccessToken: !!accessToken });
      
      const service = createPreventiveMaintenanceService(accessToken);
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
  }, [accessToken, setLoading, setSelectedMaintenance, setError]);

  // Update maintenance
  const updateMaintenance = useCallback(async (pmId: string, data: PMUpdatePayload): Promise<PMWriteResponse | null> => {
    if (!accessToken) {
      logger.warn('No access token available for updating maintenance');
      return null;
    }

    try {
      setLoading(true);
      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.updatePreventiveMaintenance(pmId, data);
      
      if (response.success && response.data) {
        const updatedData = response.data;
        const refreshed = await service.getAllPreventiveMaintenance(filterParams);
        if (refreshed.success && refreshed.data) {
          setMaintenanceItems(refreshed.data.results);
          setTotalCount(refreshed.data.count);
        }
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
  }, [accessToken, filterParams, setLoading, setMaintenanceItems, setTotalCount, setError]);

  // Complete maintenance
  const completeMaintenance = useCallback(async (pmId: string, data: PMCompletionPayload): Promise<PMCompletionResponse | null> => {
    if (!accessToken) {
      logger.warn('No access token available for completing maintenance');
      return null;
    }

    try {
      setLoading(true);
      const service = createPreventiveMaintenanceService(accessToken);
      const response = await service.completePreventiveMaintenance(pmId, data);
      
      if (response.success && response.data) {
        const completedData = response.data;
        const refreshed = await service.getAllPreventiveMaintenance(filterParams);
        if (refreshed.success && refreshed.data) {
          setMaintenanceItems(refreshed.data.results);
          setTotalCount(refreshed.data.count);
        }
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
  }, [accessToken, filterParams, setLoading, setMaintenanceItems, setTotalCount, setError]);

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
