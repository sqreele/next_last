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
  image?: string | null;
  image_url?: string | null;
}

type MachineApiPayload = Machine[] | {
  results?: Machine[];
  data?: Machine[];
  items?: Machine[];
  count?: number;
  total?: number;
  total_count?: number;
  next?: string | null;
  previous?: string | null;
  links?: {
    next?: string | null;
  };
  [key: string]: any;
};

const DEFAULT_MACHINE_PAGE_SIZE = 200;

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

const extractNextLink = (payload: MachineApiPayload): string | null => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (typeof payload.next === 'string') {
      return payload.next;
    }
    if (payload.next === null) {
      return null;
    }
    if (payload.links?.next) {
      return payload.links.next;
    }
  }
  return null;
};

const parseNextParams = (nextUrl: string): Record<string, string> => {
  try {
    const safeBase = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const parsedUrl = new URL(nextUrl, safeBase);
    const entries: Record<string, string> = {};
    parsedUrl.searchParams.forEach((value, key) => {
      entries[key] = value;
    });
    return entries;
  } catch (error) {
    console.warn('Failed to parse next pagination url for machines:', nextUrl, error);
    return {};
  }
};

const buildQueryString = (params?: Record<string, string>): string => {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, value);
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
};

export default class MachineService {
  private baseUrl: string = '/api/v1/machines';

  // Remove constructor and accessToken storage - use parameter-based approach

  async getMachines(propertyId?: string | undefined, accessToken?: string): Promise<ServiceResponse<Machine[]>> {
    try {
      const initialParams: Record<string, string> = {
        ...(propertyId ? { property_id: propertyId } : {}),
        page_size: String(DEFAULT_MACHINE_PAGE_SIZE),
      };
      console.log('Fetching machines with params:', initialParams);

      const useProxy = !accessToken;
      if (!useProxy && !accessToken) {
        throw new Error('Access token required for direct machine request is missing.');
      }
      const accumulatedMachines: Machine[] = [];

      const fetchPage = async (
        params?: Record<string, string>,
        urlOverride?: string
      ): Promise<MachineApiPayload> => {
        if (!useProxy) {
          const authToken = accessToken as string;
          const headers: Record<string, string> = {
            Authorization: `Bearer ${authToken}`,
          };
          const response = await apiClient.get<MachineApiPayload>(urlOverride || this.baseUrl, { 
            params,
            headers
          });
          return response.data;
        }

        const queryString = buildQueryString(params);
        const targetUrl = `${urlOverride || '/api/machines/'}${queryString}`;

        console.log('🔍 Fetching from Next.js API:', targetUrl);
        const res = await fetch(targetUrl, { credentials: 'include' });
        
        if (!res.ok) {
          console.error('❌ Next.js API failed:', res.status, res.statusText);
          const errorText = await res.text();
          console.error('❌ Error details:', errorText);
          throw new Error(`Failed to fetch machines: ${res.status} - ${errorText}`);
        }
        
        return res.json();
      };

      let nextUrl: string | undefined;
      let params: Record<string, string> | undefined = initialParams;
      let pageCounter = 0;

      while (true) {
        pageCounter += 1;
        if (pageCounter > 50) {
          console.warn('⚠️ MachineService pagination limit reached. Stopping to prevent infinite loop.');
          break;
        }

        const payload = await fetchPage(params, nextUrl);
        const machines = normalizeMachineResponse(payload);
        accumulatedMachines.push(...machines);

        const next = extractNextLink(payload);
        if (!next) {
          break;
        }

        if (useProxy) {
          params = parseNextParams(next);
          if (!params.page_size) {
            params.page_size = String(DEFAULT_MACHINE_PAGE_SIZE);
          }
          nextUrl = undefined;
        } else {
          params = undefined;
          nextUrl = next;
        }
      }

      console.log('✅ Machines retrieved (combined pages):', {
        total: accumulatedMachines.length,
        pagesFetched: pageCounter,
      });

      return { success: true, data: accumulatedMachines };
    } catch (error: any) {
        console.error('Service error fetching machines:', error);
        throw handleApiError(error);
    }
  }
}
