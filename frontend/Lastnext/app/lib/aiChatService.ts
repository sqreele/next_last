import apiClient, { handleApiError } from './api-client';
import { API_CONFIG } from './config';

export type AiChatResponse = {
  reply: string;
  tool_calls?: string[];
};

export type AiChatContext = {
  property_name?: string;
};

export async function sendAiChatMessage(message: string, context: AiChatContext = {}): Promise<AiChatResponse> {
  try {
    const response = await apiClient.post<AiChatResponse>(API_CONFIG.endpoints.aiChat, {
      message,
      ...context,
    });
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}
