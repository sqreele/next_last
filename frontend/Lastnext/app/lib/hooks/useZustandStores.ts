"use client";

import { useCallback, useEffect } from 'react';
import { useSession } from '@/app/lib/next-auth-compat';
import { 
  useAuthStore, 
  usePropertyStore, 
  useJobsStore, 
  usePreventiveMaintenanceStore, 
  useFilterStore 
} from '@/app/lib/stores';
import { preventiveMaintenanceService } from '@/app/lib/PreventiveMaintenanceService';
import TopicService from '@/app/lib/TopicService';
import MachineService from '@/app/lib/MachineService';

/**
 * Comprehensive hook that provides direct access to all Zustand stores
 * This replaces the need for multiple context providers
 */
export function useZustandStores() {
  const { data: session } = useSession();
  
  // All stores
  const authStore = useAuthStore();
  const propertyStore = usePropertyStore();
  const jobsStore = useJobsStore();
  const pmStore = usePreventiveMaintenanceStore();
  const filterStore = useFilterStore();

  // Initialize data when session is available
  useEffect(() => {
    if (session?.user?.accessToken) {
      // Initialize topics and machines
      const topicService = new TopicService();
      const machineService = new MachineService();

      // Fetch initial data
      Promise.all([
        topicService.getTopics(session.user.accessToken).then(response => {
          if (response.success && response.data) {
            pmStore.setTopics(response.data);
          }
        }),
        machineService.getMachines(authStore.selectedProperty || undefined).then(response => {
          if (response.success && response.data) {
            pmStore.setMachines(response.data);
          }
        }),
        preventiveMaintenanceService.getEnhancedStatistics(30).then(response => {
          if (response.success && response.data) {
            // Convert the service response to match the store's expected format
            const convertedStats = {
              ...response.data,
              frequency_distribution: response.data.frequency_distribution.reduce((acc, item) => {
                acc[item.frequency as any] = item.count;
                return acc;
              }, {} as Record<string, number>)
            };
            pmStore.setStatistics(convertedStats);
          }
        })
      ]).catch(error => {
        console.error('Error initializing stores:', error);
      });
    }
  }, [session?.user?.accessToken, authStore.selectedProperty, pmStore]);

  // Property management
  const updateSelectedProperty = useCallback((propertyId: string | null) => {
    authStore.setSelectedProperty(propertyId);
    propertyStore.setSelectedProperty(propertyId);
    
    // Update filter store
    filterStore.setPropertyId(propertyId);
    
    // Refresh PM data for new property
    if (propertyId) {
      pmStore.setFilterParams({ property_id: propertyId });
      // Trigger refresh of maintenance items
      preventiveMaintenanceService.getAllPreventiveMaintenance({ property_id: propertyId })
        .then((response: any) => {
          if (response.success && response.data) {
            // Handle both array and paginated responses
            let items: any[];
            let total: number;
            
            if (Array.isArray(response.data)) {
              items = response.data;
              total = response.data.length;
            } else {
              items = response.data.results;
              total = response.data.count;
            }
            
            pmStore.setMaintenanceItems(items);
            pmStore.setTotalCount(total);
          }
        })
        .catch((error: any) => {
          console.error('Error refreshing PM data for new property:', error);
        });
    }
  }, [authStore, propertyStore, filterStore, pmStore]);

  // Jobs management
  const refreshJobs = useCallback(async (propertyId?: string) => {
    const targetProperty = propertyId || authStore.selectedProperty;
    if (!targetProperty) return;

    jobsStore.setLoading(true);
    try {
      const response = await preventiveMaintenanceService.getAllPreventiveMaintenance({ 
        property_id: targetProperty,
        limit: 100
      });
      
      if (response.success && response.data) {
        // Handle both array and paginated responses
        let items: any[];
        
        if (Array.isArray(response.data)) {
          items = response.data;
        } else {
          items = response.data.results;
        }
        
        jobsStore.setJobs(items);
        jobsStore.setLastLoadTime(Date.now());
      }
    } catch (error: any) {
      jobsStore.setError(error.message || 'Failed to refresh jobs');
    } finally {
      jobsStore.setLoading(false);
    }
  }, [authStore.selectedProperty, jobsStore]);

  // PM management
  const refreshPMData = useCallback(async (params?: any) => {
    pmStore.setLoading(true);
    try {
      const fetchParams = { 
        ...pmStore.filterParams, 
        property_id: authStore.selectedProperty || pmStore.filterParams.property_id,
        ...params 
      };
      
      const response = await preventiveMaintenanceService.getAllPreventiveMaintenance(fetchParams);
      
      if (response.success && response.data) {
        // Handle both array and paginated responses
        let items: any[];
        let total: number;
        
        if (Array.isArray(response.data)) {
          items = response.data;
          total = response.data.length;
        } else {
          items = response.data.results;
          total = response.data.count;
        }
        
        pmStore.setMaintenanceItems(items);
        pmStore.setTotalCount(total);
      } else {
        pmStore.setError(response.message || 'Failed to fetch maintenance items');
      }
    } catch (error: any) {
      pmStore.setError(error.message || 'An error occurred while fetching maintenance items');
    } finally {
      pmStore.setLoading(false);
    }
  }, [authStore.selectedProperty, pmStore]);

  // Clear all stores (useful for logout)
  const clearAllStores = useCallback(() => {
    authStore.clearAuth();
    propertyStore.clear();
    jobsStore.clear();
    pmStore.clear();
    filterStore.resetFilters();
  }, [authStore, propertyStore, jobsStore, pmStore, filterStore]);

  return {
    // Store states
    auth: authStore,
    property: propertyStore,
    jobs: jobsStore,
    pm: pmStore,
    filter: filterStore,
    
    // Actions
    updateSelectedProperty,
    refreshJobs,
    refreshPMData,
    clearAllStores,
    
    // Computed values
    hasProperties: propertyStore.userProperties.length > 0,
    selectedProperty: authStore.selectedProperty,
    userProfile: authStore.userProfile,
    isLoading: pmStore.isLoading || jobsStore.isLoading,
    hasError: !!(pmStore.error || jobsStore.error),
  };
}
