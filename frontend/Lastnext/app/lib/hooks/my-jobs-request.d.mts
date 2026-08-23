import type { Job } from "@/app/lib/types";

export interface MyJobsFilters {
  search?: string;
  status?: string;
  priority?: string;
  date?: string;
  room_name?: string;
}

export interface MyJobsStatusCounts {
  total: number;
  pending: number;
  in_progress: number;
  waiting_sparepart: number;
  completed: number;
  cancelled: number;
}

export interface MyJobsPageResponse {
  count: number;
  next: string | null;
  previous: string | null;
  page_size: number;
  current_page: number;
  total_pages: number;
  results: Job[];
  property_id: string;
  can_operate: boolean;
  status_counts: MyJobsStatusCounts;
}

export interface MyJobsRequestOptions {
  propertyId?: string | null;
  page?: number;
  pageSize?: number;
  filters?: MyJobsFilters;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export function buildMyJobsUrl(options: MyJobsRequestOptions): string | null;
export function isMyJobsAbortError(error: unknown): boolean;
export function isCurrentMyJobsRequest(options: {
  requestId: number;
  currentRequestId: number;
  requestPropertyId: string;
  currentPropertyId: string | null;
}): boolean;
export function assertMyJobsPropertyBoundary(
  jobs: Job[],
  propertyId: string,
): Job[];
export function canMutateMyJob(
  job: Job,
  propertyId?: string | null,
): boolean;
export function getMyJobDetailHref(
  jobId?: string | null,
  propertyId?: string | null,
): string | null;
export function requestMyJobsPage(
  options: MyJobsRequestOptions,
): Promise<MyJobsPageResponse | null>;
