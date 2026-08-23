import apiClient, { handleApiError } from './api-client';
import { API_CONFIG } from './config';
import axios from 'axios';

export type AiChatResponse = {
  reply: string;
  tool_calls?: string[];
};

export type AiChatContext = {
  property_name?: string;
};

export function isAiChatRequestCanceled(error: unknown): boolean {
  return axios.isCancel(error);
}

export async function sendAiChatMessage(
  message: string,
  context: AiChatContext = {},
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  try {
    const response = await apiClient.post<AiChatResponse>(API_CONFIG.endpoints.aiChat, {
      message,
      ...context,
    }, { signal });
    return response.data;
  } catch (error) {
    if (axios.isCancel(error)) {
      throw error;
    }
    throw handleApiError(error);
  }
}
