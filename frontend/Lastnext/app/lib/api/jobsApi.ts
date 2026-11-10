import type { Job, Property } from '../types';
import { isRecord, type PaginatedResponse, type QueryParams } from './types';

export interface JobStats {
  total: number; pending: number; inProgress: number; completed: number;
  cancelled: number; defect: number; preventiveMaintenance: number; waitingSparepart: number;
}

export type JobUpdate =
  | { type: 'job_updated' | 'job_created'; job: Job }
  | { type: 'job_deleted'; jobId: number };

type JobInput = FormData | Partial<Job>;

// Custom error class for Jobs API
export class JobsApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status: number, code: string = 'UNKNOWN_ERROR', details?: unknown) {
    super(message);
    this.name = 'JobsApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Simple cache implementation
class JobsCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();
  private config = { ttl: 5 * 60 * 1000, maxSize: 100 }; // 5 minutes, 100 items

  set(key: string, data: T): void {
    // Clean up expired entries
    this.cleanup();
    
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if item is expired
    if (Date.now() - item.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  invalidate(pattern?: string): void {
    if (pattern) {
      // Invalidate keys matching pattern
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.config.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Main Jobs API service
export class JobsApiService {
  private pages = new JobsCache<PaginatedResponse<Job>>();
  private jobs = new JobsCache<Job>();
  private properties = new JobsCache<Property[]>();
  private listeners = new Set<(data: JobUpdate) => void>();

  // Enhanced fetch with timeout and retry logic
  private async fetchWithRetry<T>(
    url: string,
    options: RequestInit = {},
    retries: number = 3
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: options.body instanceof FormData ? options.headers : {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await this.parseErrorResponse(response);
        throw new JobsApiError(
          typeof errorData.message === 'string' ? errorData.message : `HTTP ${response.status}`,
          response.status,
          typeof errorData.code === 'string' ? errorData.code : 'HTTP_ERROR',
          errorData
        );
      }

      if (response.status === 204) return undefined as T;
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new JobsApiError('Request timeout', 408, 'TIMEOUT');
      }

      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.fetchWithRetry(url, options, retries - 1);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async parseErrorResponse(response: Response): Promise<Record<string, unknown>> {
    try {
      const data: unknown = await response.json();
      return isRecord(data) ? data : {};
    } catch {
      return { message: `HTTP ${response.status}`, code: 'HTTP_ERROR' };
    }
  }

  // Jobs CRUD operations with pagination support
  async getJobs(filters?: QueryParams, page: number = 1, pageSize: number = 24): Promise<PaginatedResponse<Job>> {
    const params = new URLSearchParams();
    
    // Add pagination params
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    
    // Add filters
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
          // Map legacy client key "property" to backend expected key "property_id"
          const mappedKey = key === 'property' ? 'property_id' : key;
          params.append(mappedKey, filters[key].toString());
        }
      });
    }
    
    const cacheKey = `jobs:${params.toString()}`;
    const cached = this.pages.get(cacheKey);
    if (cached) return cached;

    const url = `/api/v1/jobs/?${params.toString()}`;
    const response = await this.fetchWithRetry<PaginatedResponse<Job>>(url);
    
    this.pages.set(cacheKey, response);
    return response;
  }

  // Get job statistics without loading all jobs
  async getJobStats(filters?: QueryParams): Promise<JobStats> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
          params.append(key, filters[key].toString());
        }
      });
    }
    
    const url = `/api/v1/jobs/stats/?${params.toString()}`;
    const stats = await this.fetchWithRetry<JobStats>(url);
    return stats;
  }

  async getJob(jobId: string): Promise<Job> {
    const cacheKey = `job:${jobId}`;
    const cached = this.jobs.get(cacheKey);
    if (cached) return cached;

    const url = `/api/v1/jobs/${jobId}/`;
    const job = await this.fetchWithRetry<Job>(url);
    
    this.jobs.set(cacheKey, job);
    return job;
  }

  async createJob(jobData: JobInput): Promise<Job> {
    const url = `/api/v1/jobs/`;
    const job = await this.fetchWithRetry<Job>(url, {
      method: 'POST',
      body: jobData instanceof FormData ? jobData : JSON.stringify(jobData),
      headers: jobData instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    });
    
    this.invalidateCache('jobs');
    return job;
  }

  async updateJob(jobId: string, jobData: JobInput): Promise<Job> {
    const url = `/api/v1/jobs/${jobId}/`;
    const job = await this.fetchWithRetry<Job>(url, {
      method: 'PATCH',
      body: jobData instanceof FormData ? jobData : JSON.stringify(jobData),
      headers: jobData instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    });
    
    this.invalidateCache(`job:${jobId}`);
    this.invalidateCache('jobs');
    return job;
  }

  async deleteJob(jobId: string): Promise<void> {
    const url = `/api/v1/jobs/${jobId}/`;
    await this.fetchWithRetry<void>(url, { method: 'DELETE' });
    
    this.invalidateCache(`job:${jobId}`);
    this.invalidateCache('jobs');
  }

  // Properties
  async getProperties(..._legacyArguments: unknown[]): Promise<Property[]> {
    const cacheKey = 'properties';
    const cached = this.properties.get(cacheKey);
    if (cached) return cached;

    const url = `/api/v1/properties/`;
    const properties = await this.fetchWithRetry<Property[]>(url);
    
    this.properties.set(cacheKey, properties);
    return properties;
  }

  // Real-time updates
  enableRealTime(): void {
    // Streaming remains disabled; never obtain a browser bearer token for it.
    // The stream endpoint is not available yet. Keep the public API inert.
  }

  disableRealTime(): void {
    // No stream connection is opened while streaming is disabled.
  }

  subscribeToUpdates(listener: (data: JobUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // Cache management
  clearCache(): void {
    this.pages.clear();
    this.jobs.clear();
    this.properties.clear();
  }

  invalidateCache(pattern?: string): void {
    this.pages.invalidate(pattern);
    this.jobs.invalidate(pattern);
    this.properties.invalidate(pattern);
  }
}

// Export a singleton instance
export const jobsApi = new JobsApiService();
