// app/lib/PreventiveMaintenanceService.ts

import apiClient from './api-client';
import { handleApiError, ApiError } from './api-client';
import {
  validateFrequency,
  type PreventiveMaintenance,
  type FrequencyType,
  type ServiceResponse,
} from './preventiveMaintenanceModels';
// Removed next-auth usage; apiClient handles auth headers
import { jwtDecode } from "jwt-decode";
import axios from "axios";

export type CreatePreventiveMaintenanceData = {
  pmtitle: string;
  // property_id is not sent to backend - it's determined by the machines assigned
  machine_ids: string[];
  scheduled_date: string;
  frequency: string;
  custom_days?: number;
  notes?: string;
  topic_ids: number[];
  before_image?: File;
  after_image?: File;
  procedure?: string;
  completed_date?: string;
  procedure_template?: number; // FK to MaintenanceProcedure task template
  assigned_to?: number; // User ID (pk value)
  remarks?: string;
  status?: string;
  next_due_date?: string;
};

export type UpdatePreventiveMaintenanceData = Partial<CreatePreventiveMaintenanceData>;

export interface CompletePreventiveMaintenanceData {
  completed_date?: string;
  completion_notes?: string;
  after_image?: File;
}

export interface DashboardStats {
  avg_completion_times: Record<string, number>; 
  counts: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
  };
  frequency_distribution: {
    frequency: string;
    count: number;
  }[];
  completion_rate?: number;
  machine_distribution?: {
    machine_id: string;
    name: string;
    count: number;
  }[];
  upcoming: PreventiveMaintenance[];
}

export interface UploadImagesData {
  before_image?: File;
  after_image?: File;
}

// Add interface for paginated response - matches backend MaintenancePagination response
interface PaginatedMaintenanceResponse {
  results: PreventiveMaintenance[];
  count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  next?: string | null;
  previous?: string | null;
}

// Union type for API responses
type MaintenanceApiResponse = PreventiveMaintenance[] | PaginatedMaintenanceResponse;

class PreventiveMaintenanceService {
  private baseUrl: string = '/api/v1/preventive-maintenance';
  private accessToken?: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
  }

  // Helper method to get authorization headers
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    } else {
      console.warn('⚠️ No access token provided for API request');
      console.warn('⚠️ Service instance:', this);
      console.warn('⚠️ accessToken value:', this.accessToken);
    }
    return headers;
  }

  // Public method to set the access token
  public setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  // Helper method to check if an item matches a machine
  private itemMatchesMachine(item: PreventiveMaintenance, machineId: string): boolean {
    if (!machineId) return true;

    // Check direct machine_id property
    if (item.machine_id === machineId) {
      return true;
    }

    // Check machines array/object
    if (item.machines) {
      if (Array.isArray(item.machines)) {
        const arrayMatch = item.machines.some(machine => {
          if (typeof machine === 'string') {
            return machine === machineId;
          }
          if (typeof machine === 'object' && machine !== null) {
            return (machine as any).machine_id === machineId || 
                   String((machine as any).id) === machineId ||
                   (machine as any).machineId === machineId;
          }
          return false;
        });
        
        if (arrayMatch) {
          return true;
        }
      } else if (typeof item.machines === 'object' && item.machines !== null) {
        const machine = item.machines as any;
        const objectMatch = machine.machine_id === machineId || 
                          String(machine.id) === machineId ||
                          machine.machineId === machineId;
        
        if (objectMatch) {
          return true;
        }
      }
    }
    return false;
  }

  // Helper method to extract items from API response
  private extractItemsFromResponse(data: MaintenanceApiResponse): { items: PreventiveMaintenance[], count: number } {
    if (Array.isArray(data)) {
      return { items: data, count: data.length };
    } else {
      return { items: data.results || [], count: data.count || 0 };
    }
  }

  // ENHANCED: getAllPreventiveMaintenance with better typing
  async getAllPreventiveMaintenance(
    params?: Record<string, any>
  ): Promise<ServiceResponse<MaintenanceApiResponse>> {
    try {
      
      // Create clean params object - remove empty strings and undefined values
      const cleanParams: Record<string, any> = {};
      
      // Always ensure page and page_size are set (required for Django pagination)
      cleanParams.page = params?.page ? parseInt(String(params.page), 10) : 1;
      cleanParams.page_size = params?.page_size ? parseInt(String(params.page_size), 10) : 10;
      
      // Include other non-empty filter params
      if (params) {
        Object.keys(params).forEach(key => {
          // Skip page and page_size as we've already handled them
          if (key === 'page' || key === 'page_size') return;
          
          const value = params[key];
          // Only include non-empty, non-null, non-undefined values
          if (value !== null && value !== undefined && value !== '') {
            cleanParams[key] = value;
          }
        });
      }
      
      // Log pagination params specifically
      
      // Log the machine_id specifically
      if (cleanParams.machine_id) {
      }

            let response: any;
      
      if (this.accessToken) {
        // Use direct backend call with stored token
        response = await apiClient.get<MaintenanceApiResponse>(`${this.baseUrl}/`, { 
          params: cleanParams,
          headers: this.getAuthHeaders()
        });
      } else {
        // Use Next.js API proxy to include auth automatically
        
        const queryString = new URLSearchParams(cleanParams).toString();
        const url = `/api/preventive-maintenance/${queryString ? `?${queryString}` : ''}`;
        
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
          throw new Error(`Failed to fetch preventive maintenance: ${res.status}`);
        }
        const data = await res.json();
        
        // Return in the same format as apiClient
        response = { data };
      }
      
      // Extract items for logging
      const { items, count } = this.extractItemsFromResponse(response.data);
      
      if (Array.isArray(response.data)) {
      } else {
      }
      
      // Log machine filtering results
      if (cleanParams.machine_id && items.length > 0) {
        
        items.forEach((item, index) => {
        });
      }
      
      return { 
        success: true, 
        data: response.data,
        message: `Fetched ${items.length} maintenance items successfully`
      };
    } catch (error: any) {
      console.error('Service error fetching with filters:', error);
      console.error('Error details:', {
        status: error.status,
        message: error.message,
        response: error.response?.data
      });
      throw handleApiError(error);
    }
  }

  // ENHANCED: Better machine-specific fetching with proper typing
  async getPreventiveMaintenanceByMachine(
    machineId: string,
    additionalParams?: Record<string, any>
  ): Promise<ServiceResponse<MaintenanceApiResponse>> {
    if (!machineId) {
      console.error('Cannot fetch: Machine ID is undefined or empty');
      return { success: false, message: 'Machine ID is required to fetch related maintenance' };
    }

    try {
      // Strategy 1: Try the standard endpoint with machine_id parameter
      const params = { machine_id: machineId, ...additionalParams };
      const response = await this.getAllPreventiveMaintenance(params);
      
      if (response.success && response.data) {
        // Extract items for validation
        const { items } = this.extractItemsFromResponse(response.data);
        
        // Verify that the items actually match the machine
        const matchingItems = items.filter(item => this.itemMatchesMachine(item, machineId));
        
        if (matchingItems.length === items.length || items.length === 0) {
          return response;
        } else {
          // Continue to fallback strategies
        }
      }

      // Strategy 2: Try alternative parameter names
      const alternativeParams = [
        { machine: machineId, ...additionalParams },
        { machine_ids: machineId, ...additionalParams },
        { machineId: machineId, ...additionalParams },
      ];

      for (const altParams of alternativeParams) {
        try {
          const altResponse = await this.getAllPreventiveMaintenance(altParams);
          
          if (altResponse.success && altResponse.data) {
            const { items: altItems } = this.extractItemsFromResponse(altResponse.data);
            const matchingAltItems = altItems.filter(item => this.itemMatchesMachine(item, machineId));
            
            if (matchingAltItems.length > 0) {
              return altResponse;
            }
          }
        } catch (error) {
        }
      }

      // Strategy 3: Get all items and filter client-side
      const allResponse = await this.getAllPreventiveMaintenance(additionalParams);
      
      if (allResponse.success && allResponse.data) {
        const { items: allItems } = this.extractItemsFromResponse(allResponse.data);
        const filteredItems = allItems.filter(item => this.itemMatchesMachine(item, machineId));
        
        // Return in the same format as the original response
        if (Array.isArray(allResponse.data)) {
          return { 
            success: true, 
            data: filteredItems, 
            message: `Found ${filteredItems.length} maintenance items for machine ${machineId}` 
          };
        } else {
          const paginatedResponse: PaginatedMaintenanceResponse = {
            ...allResponse.data,
            results: filteredItems,
            count: filteredItems.length
          };
          return { 
            success: true, 
            data: paginatedResponse, 
            message: `Found ${filteredItems.length} maintenance items for machine ${machineId}` 
          };
        }
      }

      // If all strategies fail
      return { success: false, message: `No maintenance items found for machine ${machineId}` };

    } catch (error: any) {
      console.error(`Service error fetching maintenance for machine ${machineId}:`, error);
      throw handleApiError(error);
    }
  }

  // NEW: Debug method specifically for machine filtering
  async debugMachineFiltering(machineId: string): Promise<void> {
    
    try {
      // Test 1: Get all maintenance items
      const allResponse = await this.getAllPreventiveMaintenance();
      
      if (allResponse.success && allResponse.data) {
        const { items: allItems } = this.extractItemsFromResponse(allResponse.data);
        
        // Analyze machine data structure
        allItems.slice(0, 5).forEach((item, index) => {
        });

        // Test client-side filtering
        const clientFiltered = allItems.filter(item => this.itemMatchesMachine(item, machineId));
      }

      // Test 2: Try API filtering
      const apiFiltered = await this.getAllPreventiveMaintenance({ machine_id: machineId });
      
      if (apiFiltered.success && apiFiltered.data) {
        const { items: apiItems } = this.extractItemsFromResponse(apiFiltered.data);
      }

    } catch (error) {
      console.error('Debug error:', error);
    }
  }

  // Keep all your existing methods exactly as they are...
  async createPreventiveMaintenance(
    data: CreatePreventiveMaintenanceData
  ): Promise<ServiceResponse<PreventiveMaintenance>> {

    // Validate machine_ids is an array (but allow empty array - machines are optional)
    if (!Array.isArray(data.machine_ids)) {
      console.error('ERROR: machine_ids must be an array:', {
        machine_ids: data.machine_ids,
        type: typeof data.machine_ids,
        isArray: Array.isArray(data.machine_ids),
      });
      throw new Error('machine_ids must be an array.');
    }
    
    // Log machine_ids for debugging

    try {
      const formData = new FormData();
      
      // Add basic fields
        if (data.pmtitle?.trim()) {
          formData.append('pmtitle', data.pmtitle.trim());
        }
        formData.append('scheduled_date', data.scheduled_date);
        // Only append completed_date if it's provided, not empty, and not undefined/null
        // For new records (no pmId), completed_date should always be undefined and not sent
        if (data.completed_date !== undefined && 
            data.completed_date !== null && 
            data.completed_date !== '' &&
            (typeof data.completed_date !== 'string' || data.completed_date.trim() !== '')) {
          formData.append('completed_date', data.completed_date);
        } else {
        }
        formData.append('frequency', data.frequency);
        if (data.custom_days != null) {
          formData.append('custom_days', String(data.custom_days));
        }
        if (data.notes !== undefined) {
          formData.append('notes', data.notes?.trim() || '');
        }
        if (data.procedure !== undefined) {
          formData.append('procedure', data.procedure?.trim() || '');
        }
        if (data.procedure_template !== undefined && data.procedure_template !== null) {
          formData.append('procedure_template', String(data.procedure_template));
        } else {
        }
        if (data.assigned_to !== undefined && data.assigned_to !== null) {
          formData.append('assigned_to', String(data.assigned_to));
        }
        if (data.remarks !== undefined) {
          formData.append('remarks', data.remarks?.trim() || '');
        }
      
      // Add array fields - FIXED: removed [] from field names
      // Ensure we're working with arrays, not strings
      if (data.topic_ids && Array.isArray(data.topic_ids) && data.topic_ids.length > 0) {
        data.topic_ids.forEach((id) => {
          formData.append('topic_ids', String(id));
        });
      }
      
      // CRITICAL: Ensure machine_ids is an array and append each ID individually
      if (data.machine_ids && Array.isArray(data.machine_ids) && data.machine_ids.length > 0) {
        data.machine_ids.forEach((id) => {
          // Ensure ID is converted to string
          formData.append('machine_ids', String(id));
        });
      } else {
        console.error('ERROR: machine_ids is missing or not an array:', {
          machine_ids: data.machine_ids,
          type: typeof data.machine_ids,
          isArray: Array.isArray(data.machine_ids),
          length: data.machine_ids?.length
        });
        // This should not happen as form validation requires at least one machine
        throw new Error('At least one machine is required. machine_ids must be an array.');
      }
      
      // Note: property_id is not sent to backend - it's determined by the machines assigned
      // if (data.property_id) formData.append('property_id', data.property_id);

      // Add image files directly to the initial request
      // CRITICAL: Only append if it's actually a File object with size > 0
      // Do NOT append empty strings, null, undefined, or empty objects
      // Backend will reject non-file data for these fields
      if (data.before_image !== undefined && data.before_image !== null) {
        if (data.before_image instanceof File && data.before_image.size > 0) {
          formData.append('before_image', data.before_image);
        } else {
          console.warn('⚠️ Skipping before_image - not a valid file:', {
            isFile: data.before_image instanceof File,
            type: typeof data.before_image,
            value: data.before_image,
            isObject: typeof data.before_image === 'object' && data.before_image !== null,
            isEmptyObject: typeof data.before_image === 'object' && Object.keys(data.before_image).length === 0
          });
          // DO NOT append anything - backend will reject non-file data
        }
      }
      
      if (data.after_image !== undefined && data.after_image !== null) {
        if (data.after_image instanceof File && data.after_image.size > 0) {
          formData.append('after_image', data.after_image);
        } else {
          console.warn('⚠️ Skipping after_image - not a valid file:', {
            isFile: data.after_image instanceof File,
            type: typeof data.after_image,
            value: data.after_image,
            isObject: typeof data.after_image === 'object' && data.after_image !== null,
            isEmptyObject: typeof data.after_image === 'object' && Object.keys(data.after_image).length === 0
          });
          // DO NOT append anything - backend will reject non-file data
        }
      }
      const formDataEntries: Array<[string, any]> = [];
      for (const [key, value] of formData.entries()) {
        const displayValue = value instanceof File 
          ? `File: ${value.name} (${value.size} bytes, ${value.type})`
          : typeof value === 'object' && value !== null
          ? `Object: ${JSON.stringify(value)}`
          : value;
        formDataEntries.push([key, displayValue]);
      }

      // CRITICAL: Don't set Content-Type header - let axios/browser set it automatically with boundary
      // The apiClient interceptor will detect FormData and remove Content-Type header
      // apiClient interceptor will add Authorization header automatically
      const createResponse = await apiClient.post<any>(`${this.baseUrl}/`, formData, {
        // Don't set headers here - let interceptor handle it
        // FormData will be detected and Content-Type will be removed automatically
      });

      const responseData = createResponse.data;

      let actualRecord: PreventiveMaintenance;

      if ('data' in responseData && responseData.data && 'pm_id' in responseData.data) {
        actualRecord = responseData.data;
      } else if ('pm_id' in responseData) {
        actualRecord = responseData;
      } else if (
        responseData &&
        typeof responseData === 'object' &&
        'results' in responseData &&
        Array.isArray((responseData as any).results) &&
        (responseData as any).results.length > 0 &&
        'pm_id' in (responseData as any).results[0]
      ) {
        actualRecord = (responseData as any).results[0];
        console.warn('Response was paginated; using first result:', actualRecord.pm_id);
      } else {
        console.error('Unexpected response format:', responseData);
        throw new Error('Invalid response format: Missing pm_id');
      }

      return { success: true, data: actualRecord, message: 'Maintenance created successfully' };
    } catch (error: any) {
      console.error('Service error creating maintenance:', error);
      throw handleApiError(error);
    }
  }

  async uploadMaintenanceImages(
    pmId: string,
    data: UploadImagesData
  ): Promise<ServiceResponse<null>> {

    if (!pmId) {
      console.error('Cannot upload images: PM ID is undefined or empty');
      return { success: false, message: 'PM ID is required for image upload' };
    }

    const hasBefore = data.before_image instanceof File;
    const hasAfter = data.after_image instanceof File;

    if (!hasBefore && !hasAfter) {
      return { success: true, data: null, message: 'No images provided' };
    }

    try {
      const imageFormData = new FormData();
      if (hasBefore) {
        imageFormData.append('before_image', data.before_image!);
      }
      if (hasAfter) {
        imageFormData.append('after_image', data.after_image!);
      }
      for (const [key, value] of imageFormData.entries()) {
      }

      await apiClient.post(`${this.baseUrl}/${pmId}/upload-images/`, imageFormData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          ...this.getAuthHeaders()
        },
      });
      return { success: true, data: null, message: 'Images uploaded successfully' };
    } catch (error: any) {
      console.error(`Service error uploading images for PM ${pmId}:`, error);
      throw handleApiError(error);
    }
  }

  async updatePreventiveMaintenance(
    id: string,
    data: UpdatePreventiveMaintenanceData
  ): Promise<ServiceResponse<PreventiveMaintenance>> {

    if (!id) {
      console.error('Cannot update: PM ID is undefined or empty');
      return { success: false, message: 'PM ID is required for updates' };
    }

    try {
      const formData = new FormData();
      
      // Add basic fields
      if (data.pmtitle !== undefined) formData.append('pmtitle', data.pmtitle.trim() || 'Untitled Maintenance');
      if (data.scheduled_date !== undefined) formData.append('scheduled_date', data.scheduled_date);
      if (data.completed_date !== undefined) {
        formData.append('completed_date', data.completed_date || '');
      }
      if (data.frequency !== undefined) formData.append('frequency', validateFrequency(data.frequency));
      if (data.custom_days !== undefined) {
        formData.append('custom_days', data.custom_days != null ? String(data.custom_days) : '');
      }
      if (data.notes !== undefined) formData.append('notes', data.notes?.trim() || '');
      if (data.procedure !== undefined) formData.append('procedure', data.procedure?.trim() || '');
      if (data.procedure_template !== undefined && data.procedure_template !== null) {
        formData.append('procedure_template', String(data.procedure_template));
      } else {
      }
        if (data.assigned_to !== undefined) {
          if (data.assigned_to === null) {
            formData.append('assigned_to', '');
          } else {
            formData.append('assigned_to', String(data.assigned_to));
          }
        }
        if (data.remarks !== undefined) {
          formData.append('remarks', data.remarks?.trim() || '');
        }
      
      // Add array fields - FIXED: removed [] from field names
      if (data.topic_ids !== undefined) {
        if (data.topic_ids.length) {
          data.topic_ids.forEach((id) => formData.append('topic_ids', String(id)));
        }
      }
      
      if (data.machine_ids !== undefined) {
        if (data.machine_ids.length) {
          data.machine_ids.forEach((id) => formData.append('machine_ids', id));
        }
      }
      
      // Note: property_id is not sent to backend - it's determined by the machines assigned
      // if (data.property_id !== undefined) {
      //   formData.append('property_id', data.property_id || '');
      // }
      
      // Add image files directly to the formData
      if (data.before_image instanceof File) {
        formData.append('before_image', data.before_image);
      }
      
      if (data.after_image instanceof File) {
        formData.append('after_image', data.after_image);
      }
      for (const [key, value] of formData.entries()) {
      }

      const response = await apiClient.put<PreventiveMaintenance>(
        `${this.baseUrl}/${id}/`,
        formData,
        { 
          headers: { 
            'Content-Type': 'multipart/form-data',
            ...this.getAuthHeaders()
          } 
        }
      );

      return { success: true, data: response.data, message: 'Maintenance updated successfully' };
    } catch (error: any) {
      console.error('Service error updating maintenance:', error);
      throw handleApiError(error);
    }
  }

  async completePreventiveMaintenance(
    id: string,
    data: CompletePreventiveMaintenanceData
  ): Promise<ServiceResponse<PreventiveMaintenance>> {

    if (!id) {
      console.error('Cannot complete: PM ID is undefined or empty');
      return { success: false, message: 'PM ID is required to mark as complete' };
    }

    try {
      const formData = new FormData();
      
      if (data.completed_date) {
        formData.append('completed_date', data.completed_date);
      }
      
      if (data.completion_notes?.trim()) {
        formData.append('completion_notes', data.completion_notes.trim());
      }
      
      // Add after image directly to the completion request
      if (data.after_image instanceof File) {
        formData.append('after_image', data.after_image);
      }
      for (const [key, value] of formData.entries()) {
      }

      const response = await apiClient.post<PreventiveMaintenance>(
        `${this.baseUrl}/${id}/complete/`,
        formData,
        { 
          headers: { 
            'Content-Type': 'multipart/form-data',
            ...this.getAuthHeaders()
          } 
        }
      );

      return { success: true, data: response.data, message: 'Maintenance completed successfully' };
    } catch (error: any) {
      console.error('Service error completing maintenance:', error);
      throw handleApiError(error);
    }
  }

  async getPreventiveMaintenanceById(
    id: string
  ): Promise<ServiceResponse<PreventiveMaintenance>> {
    if (!id) {
      console.error('Cannot fetch: PM ID is undefined or empty');
      return { success: false, message: 'PM ID is required to fetch details' };
    }

    try {
      const response = await apiClient.get<PreventiveMaintenance>(`${this.baseUrl}/${id}/`, {
        headers: this.getAuthHeaders()
      });
      return { success: true, data: response.data, message: 'Maintenance fetched successfully' };
    } catch (error: any) {
      console.error('Service error fetching maintenance:', error);
      throw handleApiError(error);
    }
  }

  async getPreventiveMaintenances(): Promise<ServiceResponse<PreventiveMaintenance[]>> {
    try {
      const response = await apiClient.get<PreventiveMaintenance[]>(`${this.baseUrl}/`, {
        headers: this.getAuthHeaders()
      });
      return { success: true, data: response.data, message: 'Maintenances fetched successfully' };
    } catch (error: any) {
      console.error('Service error fetching maintenances:', error);
      throw handleApiError(error);
    }
  }

  async getMaintenanceStatistics(params?: Record<string, any>): Promise<ServiceResponse<DashboardStats>> {
    try {
      const response = await apiClient.get<DashboardStats>(`${this.baseUrl}/stats/`, { 
        params,
        headers: this.getAuthHeaders()
      });
      
      return { success: true, data: response.data, message: 'Statistics fetched successfully' };
    } catch (error: any) {
      console.error('Service error fetching maintenance statistics:', error);
      
      // Handle the case where no data exists (404 error)
      if (error.status === 404 || (error.response && error.response.status === 404)) {
        const emptyStats: DashboardStats = {
          counts: {
            total: 0,
            completed: 0,
            pending: 0,
            overdue: 0
          },
          frequency_distribution: [],
          avg_completion_times: {},
          upcoming: []
        };
        return { success: true, data: emptyStats, message: 'No maintenance data found' };
      }
      
      throw handleApiError(error);
    }
  }

  async getUpcomingMaintenance(days: number = 30): Promise<ServiceResponse<PreventiveMaintenance[]>> {
    try {
      
      const response = await apiClient.get<PreventiveMaintenance[]>(
        `${this.baseUrl}/upcoming/`,
        { 
          params: { days },
          headers: this.getAuthHeaders()
        }
      );
      
      return { success: true, data: response.data, message: 'Upcoming maintenance fetched successfully' };
    } catch (error: any) {
      console.error('Service error fetching upcoming maintenance:', error);
      throw handleApiError(error);
    }
  }

  async getEnhancedStatistics(upcomingDays: number = 30): Promise<ServiceResponse<DashboardStats>> {
    try {
      
      const statsResponse = await this.getMaintenanceStatistics();
      if (!statsResponse.success || !statsResponse.data) {
        return statsResponse;
      }

      const upcomingResponse = await this.getUpcomingMaintenance(upcomingDays);
      
      if (upcomingResponse.success && upcomingResponse.data) {
        const enhancedStats: DashboardStats = {
          ...statsResponse.data,
          upcoming: upcomingResponse.data
        };
        return { success: true, data: enhancedStats, message: 'Enhanced statistics fetched successfully' };
      }
      
      return statsResponse;
    } catch (error: any) {
      console.error('Service error fetching enhanced statistics:', error);
      throw handleApiError(error);
    }
  }

  async debugMaintenanceData(): Promise<void> {
    try {
      
      const statsResponse = await apiClient.get<any>(`${this.baseUrl}/stats/`, {
        headers: this.getAuthHeaders()
      });
      
      const upcomingResponse = await apiClient.get<any>(`${this.baseUrl}/upcoming/?days=30`, {
        headers: this.getAuthHeaders()
      });
      
      const allResponse = await apiClient.get<any>(`${this.baseUrl}/`, {
        headers: this.getAuthHeaders()
      });
      
    } catch (error) {
      console.error('Debug error:', error);
    }
  }

  async deletePreventiveMaintenance(id: string): Promise<ServiceResponse<null>> {
    if (!id) {
      console.error('Cannot delete: PM ID is undefined or empty');
      return { success: false, message: 'PM ID is required for deletion' };
    }

    try {
      
      const response = await apiClient.delete(`${this.baseUrl}/${id}/`, {
        headers: this.getAuthHeaders()
      });
      return { success: true, data: null, message: 'Maintenance deleted successfully' };
    } catch (error: any) {
      console.error(`Service error deleting maintenance ${id}:`, error);
      
      if (error.status === 403) {
        return { 
          success: false, 
          message: error.details?.detail || 'You don\'t have permission to delete this maintenance record. Please contact an administrator.' 
        };
      }
      
      if (error.status === 401) {
        return { 
          success: false, 
          message: 'Your session has expired. Please log in again to continue.' 
        };
      }
      
      if (error.status === 404) {
        return { 
          success: false, 
          message: 'This maintenance record no longer exists or has already been deleted.' 
        };
      }
      
      throw handleApiError(error);
    }
  }
  async debugAPIEndpoint(machineId: string): Promise<void> {
    
    try {
      // Test different parameter formats
      const testParams = [
        { machine: machineId },
        { machine_id: machineId },
        { machines: machineId },
        { machine_ids: machineId },
      ];
  
      for (const params of testParams) {
        
        try {
          const response = await apiClient.get<any>(`${this.baseUrl}/`, { 
            params,
            headers: this.getAuthHeaders()
          });
          const { items } = this.extractItemsFromResponse(response.data);
          
          // Check first few items
          items.slice(0, 3).forEach((item, index) => {
          });
          
          // Check if target machine is in results
          const hasTargetMachine = items.some(item => 
            item.machines?.some(m => m.machine_id === machineId)
          );
          
          if (hasTargetMachine) {
          } else {
          }
        } catch (error) {
          console.error('Error in debugMachineFiltering:', error);
        }
      }
    } catch (error) {
      console.error('Debug error:', error);
    }
  }
}

// Export a function that creates a new service instance with the current access token
export const createPreventiveMaintenanceService = (accessToken?: string) => new PreventiveMaintenanceService(accessToken);

// Keep the old export for backward compatibility, but it won't have authentication
export const preventiveMaintenanceService = new PreventiveMaintenanceService();

// Add a method to set the access token on the singleton
export const setPreventiveMaintenanceServiceToken = (accessToken: string) => {
  preventiveMaintenanceService.setAccessToken(accessToken);
};
