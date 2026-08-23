import type { Job, TabValue } from '@/app/lib/types';

export interface JobsDashboardStatusCounts {
  total: number;
  pending: number;
  in_progress: number;
  waiting_sparepart: number;
  completed: number;
  cancelled: number;
  defect: number;
  preventive_maintenance: number;
}

export interface JobsDashboardResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Job[];
  property_id: string;
  property_name: string;
  can_operate: boolean;
  can_assign: boolean;
  status_counts: JobsDashboardStatusCounts;
}

export interface JobsDashboardFilters {
  search?: string;
  status?: TabValue;
  priority?: string;
  date?: string;
  ordering?: string;
}

export function buildJobsDashboardUrl(options: {
  propertyId?: string | null;
  page?: number;
  pageSize?: number;
  filters?: JobsDashboardFilters;
}): string | null;
export function isJobsDashboardAbortError(error: unknown): boolean;
export function isCurrentJobsDashboardRequest(options: {
  requestId: number;
  currentRequestId: number;
  requestPropertyId?: string | null;
  currentPropertyId?: string | null;
}): boolean;
export function assertJobsDashboardPropertyBoundary(jobs: Job[], propertyId: string): Job[];
export function getJobsDashboardDetailHref(jobId: string, propertyId: string): string | null;
export function requestJobsDashboardPage(options: {
  propertyId?: string | null;
  page?: number;
  pageSize?: number;
  filters?: JobsDashboardFilters;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<JobsDashboardResponse | null>;
