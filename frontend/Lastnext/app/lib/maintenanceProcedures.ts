import apiClient from './api-client';
import type {
  MaintenanceProcedureDetail,
  MaintenanceProcedureListItem,
  MaintenanceProcedureListQuery,
  MaintenanceProcedureListResponse,
} from './api/maintenance-procedure-contracts';

export type { MaintenanceProcedureListItem as MaintenanceProcedureTemplate } from './api/maintenance-procedure-contracts';

const MAX_PAGES_TO_FETCH = 50;

export async function fetchAllMaintenanceProcedures(options: {
  pageSize?: number;
  propertyId?: string;
  signal?: AbortSignal;
} = {}): Promise<MaintenanceProcedureListItem[]> {
  const pageSize = options.pageSize ?? 100;
  const aggregated: MaintenanceProcedureListItem[] = [];
  let page = 1;
  let hasMore = true;
  let pagesFetched = 0;

  while (hasMore && pagesFetched < MAX_PAGES_TO_FETCH) {
    pagesFetched += 1;
    const config: {
      params: MaintenanceProcedureListQuery;
      signal?: AbortSignal;
    } = {
      params: {
        page,
        page_size: pageSize,
        ...(options.propertyId ? { property_id: options.propertyId } : {}),
      },
    };
    if (options.signal) config.signal = options.signal;
    const response = await apiClient.get<MaintenanceProcedureListResponse>(
      '/api/v1/maintenance-procedures/',
      config,
    );

    const data = response.data;
    if (!data || !Array.isArray(data.results)) {
      throw new Error('Invalid maintenance procedure paginated response');
    }

    const pageResults = data.results;
    aggregated.push(...pageResults);
    const nextAvailable = data.current_page < data.total_pages;

    if (!nextAvailable || pageResults.length === 0) {
      hasMore = false;
    } else {
      page += 1;
    }
  }

  if (pagesFetched === MAX_PAGES_TO_FETCH) {
    console.warn(
      `[fetchAllMaintenanceProcedures] Reached page fetch limit (${MAX_PAGES_TO_FETCH}). Some procedures may be omitted.`
    );
  }

  const uniqueById = new Map<number, MaintenanceProcedureListItem>();
  for (const task of aggregated) {
    if (!uniqueById.has(task.id)) {
      uniqueById.set(task.id, task);
    }
  }

  return Array.from(uniqueById.values());
}

export async function fetchMaintenanceProcedures(
  query: MaintenanceProcedureListQuery = {},
): Promise<MaintenanceProcedureListResponse> {
  const response = await apiClient.get<MaintenanceProcedureListResponse>(
    '/api/v1/maintenance-procedures/',
    { params: query },
  );
  if (!response.data || !Array.isArray(response.data.results)) {
    throw new Error('Invalid maintenance procedure paginated response');
  }
  return response.data;
}

export async function fetchMaintenanceProcedure(
  id: number | string,
): Promise<MaintenanceProcedureDetail> {
  const response = await apiClient.get<MaintenanceProcedureDetail>(
    `/api/v1/maintenance-procedures/${id}/`,
  );
  return response.data;
}
