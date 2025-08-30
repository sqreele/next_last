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

  async getTopics(accessToken?: string): Promise<ServiceResponse<Topic[]>> {
    try {
      console.log('Fetching topics');
      
      if (accessToken) {
        // Use direct backend call with provided token
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
        };
        console.log('✅ Using access token for topics request');
        
        const response = await apiClient.get<Topic[]>(this.baseUrl, { headers });
        console.log('Topics received:', response.data);
        return { success: true, data: response.data };
      } else {
        // Use Next.js API proxy to include auth automatically
        console.log('🔄 Using Next.js API proxy for topics request');
        
        const res = await fetch('/api/topics/', { credentials: 'include' });
        if (!res.ok) {
          throw new Error(`Failed to fetch topics: ${res.status}`);
        }
        const data = await res.json();
        console.log('Topics received via proxy:', data);
        return { success: true, data };
      }
    } catch (error: any) {
      console.error('Service error fetching topics:', error);
      throw handleApiError(error);
    }
  }
}