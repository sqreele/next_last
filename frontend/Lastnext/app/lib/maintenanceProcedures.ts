import apiClient from './api-client';

export interface MaintenanceProcedureTemplate {
  id: number;
  name: string;
  group_id?: string | null;
  description?: string;
  category?: string | null;
  frequency?: string | null;
  difficulty_level?: string | null;
  responsible_department?: string | null;
  estimated_duration?: string | null;
  safety_notes?: string | null;
  required_tools?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface PaginatedMaintenanceProceduresResponse {
  results?: MaintenanceProcedureTemplate[];
  count?: number;
  next?: string | null;
  previous?: string | null;
  total_pages?: number;
  current_page?: number;
  page_size?: number;
}

type MaintenanceProceduresApiResponse =
  | MaintenanceProcedureTemplate[]
  | PaginatedMaintenanceProceduresResponse;

const MAX_PAGES_TO_FETCH = 50;

export async function fetchAllMaintenanceProcedures(options: {
  pageSize?: number;
} = {}): Promise<MaintenanceProcedureTemplate[]> {
  const pageSize = options.pageSize ?? 100;
  const aggregated: MaintenanceProcedureTemplate[] = [];
  let page = 1;
  let hasMore = true;
  let pagesFetched = 0;

  while (hasMore && pagesFetched < MAX_PAGES_TO_FETCH) {
    pagesFetched += 1;
    const response = await apiClient.get<MaintenanceProceduresApiResponse>(
      '/api/v1/maintenance-procedures/',
      {
        params: {
          page,
          page_size: pageSize,
        },
      }
    );

    const data = response.data;
    let pageResults: MaintenanceProcedureTemplate[] = [];
    let nextAvailable = false;

    if (Array.isArray(data)) {
      pageResults = data;
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.results)) {
        pageResults = data.results;
      }

      if (typeof data.next === 'string' && data.next.length > 0) {
        nextAvailable = true;
      } else if (
        typeof data.current_page === 'number' &&
        typeof data.total_pages === 'number'
      ) {
        nextAvailable = data.current_page < data.total_pages;
      } else if (typeof data.count === 'number') {
        nextAvailable = aggregated.length + pageResults.length < data.count;
      }
    }

    aggregated.push(...pageResults);

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

  const uniqueById = new Map<number, MaintenanceProcedureTemplate>();
  for (const task of aggregated) {
    if (!uniqueById.has(task.id)) {
      uniqueById.set(task.id, task);
    }
  }

  return Array.from(uniqueById.values());
}
