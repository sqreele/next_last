// app/lib/MachineService.ts

import apiClient from './api-client';
import { handleApiError } from './api-client';
import type { ServiceResponse } from './preventiveMaintenanceModels';

export interface Machine {
  machine_id: string;
  name: string;
  status: string;
  property_name?: string;
  maintenance_count?: number;
  next_maintenance_date?: string | null;
  last_maintenance_date?: string | null;
  description?: string;
  property_id?: string;
  is_active?: boolean;
  procedure?: string;
}

export default class MachineService {
  private baseUrl: string = '/api/v1/machines';
  private accessToken?: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
  }

  // Helper method to get authorization headers
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
      console.log('✅ Using access token for machines API request');
    } else {
      console.warn('⚠️ No access token provided for machines API request');
    }
    return headers;
  }

  async getMachines(propertyId?: string): Promise<ServiceResponse<Machine[]>> {
    try {
      const params = propertyId ? { property_id: propertyId } : {};
      console.log('Fetching machines with params:', params);
      
      if (this.accessToken) {
        // Use direct backend call with stored token
        const response = await apiClient.get<Machine[]>(this.baseUrl, { 
          params,
          headers: this.getAuthHeaders()
        });
        console.log('✅ Machines received via direct API:', response.data);
        return { success: true, data: response.data };
      } else {
        // Use Next.js API proxy to include auth automatically
        console.log('🔄 Using Next.js API proxy for machines request');
        
        const queryString = propertyId ? `?property_id=${propertyId}` : '';
        const url = `/api/machines/${queryString}`;
        
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
          throw new Error(`Failed to fetch machines: ${res.status}`);
        }
        const data = await res.json();
        console.log('✅ Machines received via proxy:', data);
        return { success: true, data };
      }
    } catch (error: any) {
      console.error('Service error fetching machines:', error);
      throw handleApiError(error);
    }
  }
}
