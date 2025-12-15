import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { UserProfile, Property, Job, JobStatus, JobPriority } from '../types';
import { logger } from '../utils/logger';

// Only enable devtools in development and on client-side
const isDevtoolsEnabled = typeof window !== 'undefined' && process.env.NODE_ENV === 'development';

// User & Auth State
interface UserState {
  userProfile: UserProfile | null;
  selectedPropertyId: string | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
}

// Property State
interface PropertyState {
  properties: Property[];
  selectedPropertyData: Property | null;
  propertyLoading: boolean;
  propertyError: string | null;
}

// Job State
interface JobState {
  jobs: Job[];
  filteredJobs: Job[];
  selectedJob: Job | null;
  jobLoading: boolean;
  jobError: string | null;
}

// Filter State
interface FilterState {
  status: JobStatus | 'all';
  priority: JobPriority | 'all';
  propertyId: string | null;
  dateRange: { start: Date | null; end: Date | null };
  searchQuery: string;
}

// Preventive Maintenance State
interface PreventiveMaintenanceState {
  maintenanceItems: any[];
  maintenanceLoading: boolean;
  maintenanceError: string | null;
}

// Combined Store Interface
interface MainStore extends 
  UserState, 
  PropertyState, 
  JobState, 
  FilterState, 
  PreventiveMaintenanceState {
  
  // User Actions
  setUserProfile: (profile: UserProfile | null) => void;
  setSelectedPropertyId: (propertyId: string | null) => void;
  setAuthTokens: (access: string, refresh: string) => void;
  logout: () => void;
  
  // Property Actions
  setProperties: (properties: Property[]) => void;
  setSelectedPropertyData: (property: Property | null) => void;
  setPropertyLoading: (loading: boolean) => void;
  setPropertyError: (error: string | null) => void;
  
  // Job Actions
  setJobs: (jobs: Job[]) => void;
  addJob: (job: Job) => void;
  updateJob: (id: number, updates: Partial<Job>) => void;
  deleteJob: (id: number) => void;
  setJobLoading: (loading: boolean) => void;
  setJobError: (error: string | null) => void;
  
  // Filter Actions
  setStatusFilter: (status: JobStatus | 'all') => void;
  setPriorityFilter: (priority: JobPriority | 'all') => void;
  setPropertyFilter: (propertyId: string | null) => void;
  setDateRangeFilter: (range: { start: Date | null; end: Date | null }) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;
  
  // Preventive Maintenance Actions
  setMaintenanceItems: (items: any[]) => void;
  setMaintenanceLoading: (loading: boolean) => void;
  setMaintenanceError: (error: string | null) => void;
  
  // Computed Values
  getFilteredJobs: () => Job[];
  getJobsByStatus: (status: JobStatus) => Job[];
  getJobsByProperty: (propertyId: string) => Job[];
}

// Initial State
const initialState = {
  // User
  userProfile: null,
  selectedPropertyId: null,
  isAuthenticated: false,
  accessToken: null,
  refreshToken: null,
  
  // Properties
  properties: [],
  selectedPropertyData: null,
  propertyLoading: false,
  propertyError: null,
  
  // Jobs
  jobs: [],
  filteredJobs: [],
  selectedJob: null,
  jobLoading: false,
  jobError: null,
  
  // Filters
  status: 'all' as JobStatus | 'all',
  priority: 'all' as JobPriority | 'all',
  propertyId: null,
  dateRange: { start: null, end: null },
  searchQuery: '',
  
  // Preventive Maintenance
  maintenanceItems: [],
  maintenanceLoading: false,
  maintenanceError: null,
};

// Persist middleware configuration
const persistConfig = {
  name: 'main-store',
  partialize: (state: MainStore) => ({
    userProfile: state.userProfile,
    selectedPropertyId: state.selectedPropertyId,
    properties: state.properties,
    // Don't persist sensitive data like tokens
  })
};

// Store implementation
const storeImplementation = (set: any, get: any) => ({
  ...initialState,
  
  // User Actions
  setUserProfile: (profile: UserProfile | null) => set({ userProfile: profile, isAuthenticated: !!profile }),
  setSelectedPropertyId: (propertyId: string | null) => {
    // ✅ SECURITY: Validate property access before setting
    if (propertyId === null) {
      set({ selectedPropertyId: null });
      return;
    }
    
    const state = get();
    const userProps = state.properties;
    
    // Verify user has access to this property
    const hasAccess = userProps.some((p: Property) => p.property_id === propertyId);
    if (!hasAccess) {
      logger.warn('Security: Attempted to select unauthorized property', {
        propertyId,
        userProperties: userProps.map((p: Property) => p.property_id)
      });
      // Don't set the unauthorized property
      return;
    }
    
    set({ selectedPropertyId: propertyId });
  },
  setAuthTokens: (access: string, refresh: string) => set({ accessToken: access, refreshToken: refresh }),
  logout: () => set({ 
    userProfile: null, 
    isAuthenticated: false, 
    accessToken: null, 
    refreshToken: null,
    selectedPropertyId: null 
  }),
  
  // Property Actions
  setProperties: (properties: Property[]) => set({ properties }),
  setSelectedPropertyData: (property: Property | null) => set({ selectedPropertyData: property }),
  setPropertyLoading: (loading: boolean) => set({ propertyLoading: loading }),
  setPropertyError: (error: string | null) => set({ propertyError: error }),
  
  // Job Actions
  setJobs: (jobs: Job[]) => set({ jobs, filteredJobs: jobs }),
  addJob: (job: Job) => set((state: MainStore) => ({ 
    jobs: [...state.jobs, job],
    filteredJobs: [...state.filteredJobs, job]
  })),
  updateJob: (id: number, updates: Partial<Job>) => set((state: MainStore) => ({
    jobs: state.jobs.map(job => job.id === id ? { ...job, ...updates } : job),
    filteredJobs: state.filteredJobs.map(job => job.id === id ? { ...job, ...updates } : job)
  })),
  deleteJob: (id: number) => set((state: MainStore) => ({
    jobs: state.jobs.filter(job => job.id !== id),
    filteredJobs: state.filteredJobs.filter(job => job.id !== id)
  })),
  setJobLoading: (loading: boolean) => set({ jobLoading: loading }),
  setJobError: (error: string | null) => set({ jobError: error }),
  
  // Filter Actions
  setStatusFilter: (status: JobStatus | 'all') => set({ status }),
  setPriorityFilter: (priority: JobPriority | 'all') => set({ priority }),
  setPropertyFilter: (propertyId: string | null) => set({ propertyId }),
  setDateRangeFilter: (dateRange: { start: Date | null; end: Date | null }) => set({ dateRange }),
  setSearchQuery: (searchQuery: string) => set({ searchQuery }),
  clearFilters: () => set({
    status: 'all',
    priority: 'all',
    propertyId: null,
    dateRange: { start: null, end: null },
    searchQuery: ''
  }),
  
  // Preventive Maintenance Actions
  setMaintenanceItems: (items: any[]) => set({ maintenanceItems: items }),
  setMaintenanceLoading: (loading: boolean) => set({ maintenanceLoading: loading }),
  setMaintenanceError: (error: string | null) => set({ maintenanceError: error }),
  
  // Computed Values
  getFilteredJobs: () => {
    const state = get();
    let filtered = state.jobs;
    
    if (state.status !== 'all') {
      filtered = filtered.filter((job: Job) => job.status === state.status);
    }
    
    if (state.priority !== 'all') {
      filtered = filtered.filter((job: Job) => job.priority === state.priority);
    }
    
    if (state.propertyId) {
      filtered = filtered.filter((job: Job) => 
        job.property_id === state.propertyId || 
        job.properties?.some((p) => {
          if (typeof p === 'string' || typeof p === 'number') {
            return String(p) === state.propertyId;
          }
          return String(p.property_id) === state.propertyId || String(p.id) === state.propertyId;
        })
      );
    }
    
    if (state.searchQuery) {
      filtered = filtered.filter((job: Job) => 
        job.description.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
        job.job_id.toLowerCase().includes(state.searchQuery.toLowerCase())
      );
    }
    
    return filtered;
  },
  
  getJobsByStatus: (status: JobStatus) => get().jobs.filter((job: Job) => job.status === status),
  getJobsByProperty: (propertyId: string) => get().jobs.filter((job: Job) => 
    job.property_id === propertyId || 
    job.properties?.some((p) => {
      if (typeof p === 'string' || typeof p === 'number') {
        return String(p) === propertyId;
      }
      return String(p.property_id) === propertyId || String(p.id) === propertyId;
    })
  ),
});

// Create Store with conditional devtools (disabled in production/server to prevent /dev/lrt errors)
export const useMainStore = create<MainStore>()(
  isDevtoolsEnabled
    ? devtools(
        persist(storeImplementation, persistConfig),
        { name: 'MainStore', enabled: true }
      )
    : persist(storeImplementation, persistConfig)
);

// Selector functions - defined outside to prevent recreation
const userSelector = (state: MainStore) => ({
  userProfile: state.userProfile,
  selectedPropertyId: state.selectedPropertyId,
  isAuthenticated: state.isAuthenticated,
  setUserProfile: state.setUserProfile,
  setSelectedPropertyId: state.setSelectedPropertyId,
  setAuthTokens: state.setAuthTokens,
  logout: state.logout,
});

const propertiesSelector = (state: MainStore) => ({
  properties: state.properties,
  selectedPropertyData: state.selectedPropertyData,
  propertyLoading: state.propertyLoading,
  propertyError: state.propertyError,
  setProperties: state.setProperties,
  setSelectedPropertyData: state.setSelectedPropertyData,
  setPropertyLoading: state.setPropertyLoading,
  setPropertyError: state.setPropertyError,
});

const jobsSelector = (state: MainStore) => ({
  jobs: state.jobs,
  filteredJobs: state.filteredJobs,
  selectedJob: state.selectedJob,
  jobLoading: state.jobLoading,
  jobError: state.jobError,
  setJobs: state.setJobs,
  addJob: state.addJob,
  updateJob: state.updateJob,
  deleteJob: state.deleteJob,
  setJobLoading: state.setJobLoading,
  setJobError: state.setJobError,
  getFilteredJobs: state.getFilteredJobs,
  getJobsByStatus: state.getJobsByStatus,
  getJobsByProperty: state.getJobsByProperty,
});

const filtersSelector = (state: MainStore) => ({
  status: state.status,
  priority: state.priority,
  propertyId: state.propertyId,
  dateRange: state.dateRange,
  searchQuery: state.searchQuery,
  setStatusFilter: state.setStatusFilter,
  setPriorityFilter: state.setPriorityFilter,
  setPropertyFilter: state.setPropertyFilter,
  setDateRangeFilter: state.setDateRangeFilter,
  setSearchQuery: state.setSearchQuery,
  clearFilters: state.clearFilters,
});

const preventiveMaintenanceSelector = (state: MainStore) => ({
  maintenanceItems: state.maintenanceItems,
  maintenanceLoading: state.maintenanceLoading,
  maintenanceError: state.maintenanceError,
  setMaintenanceItems: state.setMaintenanceItems,
  setMaintenanceLoading: state.setMaintenanceLoading,
  setMaintenanceError: state.setMaintenanceError,
});

// Export selector functions for components to use with useMainStore
export { userSelector, propertiesSelector, jobsSelector, filtersSelector, preventiveMaintenanceSelector };

// Optimized selector hooks that prevent infinite loops by using individual selectors
export const useUser = () => {
  const userProfile = useMainStore(state => state.userProfile);
  const selectedPropertyId = useMainStore(state => state.selectedPropertyId);
  const isAuthenticated = useMainStore(state => state.isAuthenticated);
  const setUserProfile = useMainStore(state => state.setUserProfile);
  const setSelectedPropertyId = useMainStore(state => state.setSelectedPropertyId);
  const setAuthTokens = useMainStore(state => state.setAuthTokens);
  const logout = useMainStore(state => state.logout);
  
  return {
    userProfile,
    selectedPropertyId,
    isAuthenticated,
    setUserProfile,
    setSelectedPropertyId,
    setAuthTokens,
    logout,
  };
};

export const useProperties = () => {
  const properties = useMainStore(state => state.properties);
  const selectedPropertyData = useMainStore(state => state.selectedPropertyData);
  const propertyLoading = useMainStore(state => state.propertyLoading);
  const propertyError = useMainStore(state => state.propertyError);
  const setProperties = useMainStore(state => state.setProperties);
  const setSelectedPropertyData = useMainStore(state => state.setSelectedPropertyData);
  const setPropertyLoading = useMainStore(state => state.setPropertyLoading);
  const setPropertyError = useMainStore(state => state.setPropertyError);
  
  return {
    properties,
    selectedPropertyData,
    propertyLoading,
    propertyError,
    setProperties,
    setSelectedPropertyData,
    setPropertyLoading,
    setPropertyError,
  };
};

export const useJobs = () => {
  const jobs = useMainStore(state => state.jobs);
  const filteredJobs = useMainStore(state => state.filteredJobs);
  const selectedJob = useMainStore(state => state.selectedJob);
  const jobLoading = useMainStore(state => state.jobLoading);
  const jobError = useMainStore(state => state.jobError);
  const setJobs = useMainStore(state => state.setJobs);
  const addJob = useMainStore(state => state.addJob);
  const updateJob = useMainStore(state => state.updateJob);
  const deleteJob = useMainStore(state => state.deleteJob);
  const setJobLoading = useMainStore(state => state.setJobLoading);
  const setJobError = useMainStore(state => state.setJobError);
  const getFilteredJobs = useMainStore(state => state.getFilteredJobs);
  const getJobsByStatus = useMainStore(state => state.getJobsByStatus);
  const getJobsByProperty = useMainStore(state => state.getJobsByProperty);
  
  return {
    jobs,
    filteredJobs,
    selectedJob,
    jobLoading,
    jobError,
    setJobs,
    addJob,
    updateJob,
    deleteJob,
    setJobLoading,
    setJobError,
    getFilteredJobs,
    getJobsByStatus,
    getJobsByProperty,
  };
};

export const useFilters = () => {
  const status = useMainStore(state => state.status);
  const priority = useMainStore(state => state.priority);
  const propertyId = useMainStore(state => state.propertyId);
  const dateRange = useMainStore(state => state.dateRange);
  const searchQuery = useMainStore(state => state.searchQuery);
  const setStatusFilter = useMainStore(state => state.setStatusFilter);
  const setPriorityFilter = useMainStore(state => state.setPriorityFilter);
  const setPropertyFilter = useMainStore(state => state.setPropertyFilter);
  const setDateRangeFilter = useMainStore(state => state.setDateRangeFilter);
  const setSearchQuery = useMainStore(state => state.setSearchQuery);
  const clearFilters = useMainStore(state => state.clearFilters);
  
  return {
    status,
    priority,
    propertyId,
    dateRange,
    searchQuery,
    setStatusFilter,
    setPriorityFilter,
    setPropertyFilter,
    setDateRangeFilter,
    setSearchQuery,
    clearFilters,
  };
};

export const usePreventiveMaintenance = () => {
  const maintenanceItems = useMainStore(state => state.maintenanceItems);
  const maintenanceLoading = useMainStore(state => state.maintenanceLoading);
  const maintenanceError = useMainStore(state => state.maintenanceError);
  const setMaintenanceItems = useMainStore(state => state.setMaintenanceItems);
  const setMaintenanceLoading = useMainStore(state => state.setMaintenanceLoading);
  const setMaintenanceError = useMainStore(state => state.setMaintenanceError);
  
  return {
    maintenanceItems,
    maintenanceLoading,
    maintenanceError,
    setMaintenanceItems,
    setMaintenanceLoading,
    setMaintenanceError,
  };
};
