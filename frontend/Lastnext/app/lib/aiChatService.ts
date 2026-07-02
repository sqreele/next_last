import apiClient, { handleApiError } from './api-client';
import { API_CONFIG } from './config';

export type AiChatResponse = {
  reply: string;
  tool_calls?: string[];
};

export async function sendAiChatMessage(message: string): Promise<AiChatResponse> {
  try {
    const response = await apiClient.post<AiChatResponse>(API_CONFIG.endpoints.aiChat, {
      message,
    });
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}
