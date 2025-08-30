// Export all stores
export { usePropertyStore } from './usePropertyStore';
export { useJobsStore } from './useJobsStore';
export { useAuthStore } from './useAuthStore';
export { usePreventiveMaintenanceStore } from './usePreventiveMaintenanceStore';
export { useFilterStore } from './useFilterStore';

// Export the comprehensive hook
export { useZustandStores } from '../hooks/useZustandStores';

// Export types
export type { Property } from '../types';
export type { UserProfile } from './useAuthStore';
export type { SearchParams, DashboardStats } from './usePreventiveMaintenanceStore';
export type { FilterState } from './useFilterStore';
