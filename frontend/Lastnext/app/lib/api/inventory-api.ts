import apiClient from "../api-client";
import type { AxiosRequestConfig } from "axios";
import type {
  InventoryConsumePayload,
  InventoryConsumeResponse,
  InventoryCreatePayload,
  InventoryDetail,
  InventoryFilterOptions,
  InventoryListResponse,
  InventoryPatchPayload,
  InventoryPutPayload,
  InventoryQuery,
  InventoryRestockPayload,
  InventoryUsageResponse,
  InventoryUsePayload,
} from "./inventory-contracts";

const baseUrl = "/api/v1/inventory";

function isInventoryListResponse(value: unknown): value is InventoryListResponse {
  return typeof value === "object" && value !== null
    && "results" in value && Array.isArray(value.results)
    && "count" in value && typeof value.count === "number"
    && "total_pages" in value && typeof value.total_pages === "number"
    && "current_page" in value && typeof value.current_page === "number"
    && "page_size" in value && typeof value.page_size === "number";
}

export const inventoryApi = {
  async list(query: InventoryQuery): Promise<InventoryListResponse> {
    const response = await apiClient.get<InventoryListResponse>(`${baseUrl}/`, { params: query });
    if (!isInventoryListResponse(response.data)) {
      throw new Error("Invalid inventory paginated response");
    }
    return response.data;
  },

  async detail(itemId: string): Promise<InventoryDetail> {
    const response = await apiClient.get<InventoryDetail>(`${baseUrl}/${itemId}/`);
    return response.data;
  },

  async create(payload: InventoryCreatePayload): Promise<InventoryDetail> {
    const config: AxiosRequestConfig & { skipAutomaticRetry: boolean } = {
      skipAutomaticRetry: true,
    };
    const response = await apiClient.post<InventoryDetail>(`${baseUrl}/`, payload, config);
    return response.data;
  },

  async put(itemId: string, payload: InventoryPutPayload): Promise<InventoryDetail> {
    const response = await apiClient.put<InventoryDetail>(`${baseUrl}/${itemId}/`, payload);
    return response.data;
  },

  async patch(itemId: string, payload: InventoryPatchPayload): Promise<InventoryDetail> {
    const response = await apiClient.patch<InventoryDetail>(`${baseUrl}/${itemId}/`, payload);
    return response.data;
  },

  async remove(itemId: string): Promise<void> {
    await apiClient.delete(`${baseUrl}/${itemId}/`);
  },

  async restock(itemId: string, payload: InventoryRestockPayload): Promise<InventoryDetail> {
    const response = await apiClient.post<InventoryDetail>(`${baseUrl}/${itemId}/restock/`, payload);
    return response.data;
  },

  async use(itemId: string, payload: InventoryUsePayload): Promise<InventoryDetail> {
    const response = await apiClient.post<InventoryDetail>(`${baseUrl}/${itemId}/use/`, payload);
    return response.data;
  },

  async consume(itemId: string, payload: InventoryConsumePayload): Promise<InventoryConsumeResponse> {
    const response = await apiClient.post<InventoryConsumeResponse>(`${baseUrl}/${itemId}/consume/`, payload);
    return response.data;
  },

  async usage(itemId: string, query: Pick<InventoryQuery, "page" | "page_size"> = {}): Promise<InventoryUsageResponse> {
    const response = await apiClient.get<InventoryUsageResponse>(`${baseUrl}/${itemId}/usage/`, { params: query });
    return response.data;
  },

  async filterOptions(): Promise<InventoryFilterOptions> {
    const response = await apiClient.get<InventoryFilterOptions>(`${baseUrl}/filter_options/`);
    return response.data;
  },
};
