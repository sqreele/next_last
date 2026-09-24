import type { Job, JobStatus } from '@/app/lib/types';

export function buildMyJobStatusUpdateUrl(
  jobId: string | number,
  propertyId: string,
): string | null;

export function requestMyJobStatusUpdate(options: {
  jobId: string | number;
  propertyId: string;
  status: JobStatus;
  afterImages?: File[];
  fetchImpl?: typeof fetch;
}): Promise<Job>;

export function applyMyJobStatusUpdate(jobs: Job[], updatedJob: Job): Job[];
