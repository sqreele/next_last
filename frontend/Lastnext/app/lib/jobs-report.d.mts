import type { Job } from "@/app/lib/types";

export interface JobsReportFilters {
  status?: string;
  priority?: string;
  pm?: string;
  topic?: string;
  user?: string;
  month?: string;
  year?: string;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
}

export function buildJobsReportParams(options: {
  propertyId?: string | null;
  filters?: JobsReportFilters;
}): URLSearchParams | null;

export function buildJobsReportCsvUrl(options: {
  propertyId?: string | null;
  filters?: JobsReportFilters;
}): string | null;

export function assertJobsReportPropertyBoundary(
  jobs: Job[],
  propertyId: string,
): Job[];

export function isCurrentJobsReportRequest(options: {
  requestId: number;
  currentRequestId: number;
  requestPropertyId: string;
  currentPropertyId: string | null;
}): boolean;

export function getJobsReportDetailHref(
  jobId?: string | null,
  propertyId?: string | null,
): string | null;

export function canExportJobsReport(options: {
  propertyId?: string | null;
  rowCount: number;
  exporting: boolean;
}): boolean;

export function getCsvFilename(
  contentDisposition: string | null,
  fallback: string,
): string;
