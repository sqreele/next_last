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
      
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
        console.log('✅ Using access token for topics request');
      } else {
        console.warn('⚠️ No access token provided for topics request');
      }
      
      const response = await apiClient.get<Topic[]>(this.baseUrl, { headers });
      console.log('Topics received:', response.data);
      return { success: true, data: response.data };
    } catch (error: any) {
      console.error('Service error fetching topics:', error);
      throw handleApiError(error);
    }
  }
}