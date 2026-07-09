// src/services/TopicService.ts
import apiClient from './api-client';
import { handleApiError } from './api-client';
import type { ServiceResponse } from './types';

export interface Topic {
  id: number;
  title: string;
  description?: string;
}

export default class TopicService {
  private baseUrl: string = '/api/v1/topics/';

  async getTopics(accessToken?: string, propertyId?: string | null): Promise<ServiceResponse<Topic[]>> {
    try {
      const params = propertyId ? { property: propertyId } : undefined;
      
      if (accessToken) {
        // Use direct backend call with provided token
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
        };
        
        const response = await apiClient.get<Topic[]>(this.baseUrl, { headers, params });
        return { success: true, data: response.data };
      } else {
        // Use Next.js API proxy to include auth automatically
        
        const query = propertyId ? `?property=${encodeURIComponent(propertyId)}` : '';
        const res = await fetch(`/api/topics/${query}`, { credentials: 'include' });
        if (!res.ok) {
          throw new Error(`Failed to fetch topics: ${res.status}`);
        }
        const data = await res.json();
        return { success: true, data };
      }
    } catch (error: any) {
      console.error('Service error fetching topics:', error);
      throw handleApiError(error);
    }
  }
}
