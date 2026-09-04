// src/services/TopicService.ts
import { handleApiError } from './api-client';
import type { ServiceResponse } from './types';

export interface Topic {
  id: number;
  title: string;
  description?: string;
}

export default class TopicService {
  async getTopics(propertyId?: string | null): Promise<ServiceResponse<Topic[]>> {
    try {
      const query = propertyId ? `?property=${encodeURIComponent(propertyId)}` : '';
      const res = await fetch(`/api/v1/topics/${query}`, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to fetch topics: ${res.status}`);
      }
      const data = await res.json();
      return { success: true, data };
    } catch (error: any) {
      console.error('Service error fetching topics:', error);
      throw handleApiError(error);
    }
  }
}
