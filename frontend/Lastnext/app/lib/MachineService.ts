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

type MachineApiPayload = Machine[] | {
  results?: Machine[];
  data?: Machine[];
  items?: Machine[];
  count?: number;
  total?: number;
  total_count?: number;
  [key: string]: any;
};

const normalizeMachineResponse = (payload: MachineApiPayload): Machine[] => {
  if (!payload) {
    return [];
  }

    if (Array.isArray(payload)) {
    return payload;
  }

    if (Array.isArray(payload.results)) {
    return payload.results;
  }

    if (Array.isArray(payload.data)) {
    return payload.data;
  }

    if (Array.isArray(payload.items)) {
    return payload.items;
  }

  return [];
};

export default class MachineService {
  private baseUrl: string = '/api/v1/machines';

  // Remove constructor and accessToken storage - use parameter-based approach

  async getMachines(propertyId?: string | undefined, accessToken?: string): Promise<ServiceResponse<Machine[]>> {
    try {
      const params = propertyId ? { property_id: propertyId } : {};
      console.log('Fetching machines with params:', params);
      
      if (accessToken) {
        // Use direct backend call with provided token
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
        };
        console.log('✅ Using access token for machines API request');
        
        const response = await apiClient.get<MachineApiPayload>(this.baseUrl, { 
          params,
          headers
        });
          const machines = normalizeMachineResponse(response.data);
        console.log('✅ Machines received via direct API:', {
          rawCount: Array.isArray(response.data) ? response.data.length : response.data?.count,
          normalizedCount: machines.length,
        });
        return { success: true, data: machines };
      } else {
        // Use Next.js API proxy to include auth automatically
        console.log('🔄 Using Next.js API proxy for machines request');
        
        const queryString = propertyId ? `?property_id=${propertyId}` : '';
        const url = `/api/machines/${queryString}`;
        
        console.log('🔍 Fetching from Next.js API:', url);
        const res = await fetch(url, { credentials: 'include' });
        
        if (!res.ok) {
          console.error('❌ Next.js API failed:', res.status, res.statusText);
          const errorText = await res.text();
          console.error('❌ Error details:', errorText);
          throw new Error(`Failed to fetch machines: ${res.status} - ${errorText}`);
        }
        
        const data: MachineApiPayload = await res.json();
        const machines = normalizeMachineResponse(data);
        console.log('✅ Machines received via proxy:', {
          rawCount: Array.isArray(data) ? data.length : data?.count,
          normalizedCount: machines.length,
        });
        return { success: true, data: machines };
      }
    } catch (error: any) {
        console.error('Service error fetching machines:', error);
        throw handleApiError(error);
    }
  }
}
