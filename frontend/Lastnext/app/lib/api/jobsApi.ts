import { API_CONFIG } from '../config';
import type { Job, JobStatus, PaginatedResponse, Property } from '../types';

export interface JobsApiFilters {
  property?: string;
  property_id?: string | null;
  status?: JobStatus;
  room?: string;
  user?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  is_preventivemaintenance?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

export interface JobStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  defect: number;
  preventiveMaintenance: number;
  waitingSparepart: number;
}

type JobMutationData = Record<string, unknown>;

interface JobsApiErrorPayload {
  message?: string;
  code?: string;
  [key: string]: unknown;
}

type JobRealtimeEvent =
  | { type: 'job_updated'; job: Job }
  | { type: 'job_created'; job: Job }
  | { type: 'job_deleted'; jobId: number };

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
class JobsCache {
  private cache = new Map<string, { data: unknown; timestamp: number }>();
  private config = { ttl: 5 * 60 * 1000, maxSize: 100 }; // 5 minutes, 100 items

  set<T>(key: string, data: T): void {
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

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if item is expired
    if (Date.now() - item.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
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

// Real-time updates using EventSource (temporarily disabled)
class JobsRealTimeUpdates {
  private eventSource: EventSource | null = null;
  private listeners: Set<(data: JobRealtimeEvent) => void> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(token: string): void {
    if (this.eventSource) {
      this.disconnect();
    }

    try {
      // Check if API_CONFIG.baseUrl is available
      if (!API_CONFIG.baseUrl) {
        console.warn('⚠️ API_CONFIG.baseUrl not available, disabling real-time updates');
        return;
      }

      const url = `${API_CONFIG.baseUrl}/api/v1/jobs/stream/?token=${token}`;
      
      // For now, disable real-time updates if the endpoint doesn't exist
      // You can enable this later when you implement the stream endpoint
      return;
      
      // Uncomment this when you implement the stream endpoint:
      // this.eventSource = new EventSource(url);
      
      // this.eventSource.onmessage = (event) => {
      //   try {
      //     const data = JSON.parse(event.data);
      //     this.notifyListeners(data);
      //   } catch (error) {
      //     console.error('Error parsing real-time update:', error);
      //   }
      // };

      // this.eventSource.onerror = (error) => {
      //   console.error('Real-time connection error:', error);
      //   this.handleReconnect(token);
      // };

      // this.eventSource.onopen = () => {
      //   this.reconnectAttempts = 0;
      // };
    } catch (error) {
      console.error('Failed to establish real-time connection:', error);
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  subscribe(listener: (data: JobRealtimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(data: JobRealtimeEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error('Error in real-time listener:', error);
      }
    });
  }

  private handleReconnect(token: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect(token);
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }
}

// Main Jobs API service
export class JobsApiService {
  private cache: JobsCache;
  private realTimeUpdates: JobsRealTimeUpdates;
  private abortController: AbortController | null = null;

  constructor() {
    this.cache = new JobsCache();
    this.realTimeUpdates = new JobsRealTimeUpdates();
  }

  // Enhanced fetch with timeout and retry logic
  private async fetchWithRetry<T>(
    url: string,
    token: string,
    options: RequestInit = {},
    retries: number = 3
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await this.parseErrorResponse(response);
        throw new JobsApiError(
          errorData.message || `HTTP ${response.status}`,
          response.status,
          errorData.code || 'HTTP_ERROR',
          errorData
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new JobsApiError('Request timeout', 408, 'TIMEOUT');
      }

      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.fetchWithRetry(url, token, options, retries - 1);
      }

      throw error;
    }
  }

  private async parseErrorResponse(response: Response): Promise<JobsApiErrorPayload> {
    try {
      const payload: unknown = await response.json();
      if (typeof payload === 'object' && payload !== null) {
        return payload as JobsApiErrorPayload;
      }
      return { message: `HTTP ${response.status}`, code: 'HTTP_ERROR' };
    } catch {
      return { message: `HTTP ${response.status}`, code: 'HTTP_ERROR' };
    }
  }

  // Jobs CRUD operations with pagination support
  async getJobs(token: string, filters?: JobsApiFilters, page: number = 1, pageSize: number = 24): Promise<PaginatedResponse<Job>> {
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
    const cached = this.cache.get<PaginatedResponse<Job>>(cacheKey);
    if (cached) return cached;

    const url = `${API_CONFIG.baseUrl}/api/v1/jobs/?${params.toString()}`;
    const response = await this.fetchWithRetry<PaginatedResponse<Job>>(url, token);
    
    this.cache.set(cacheKey, response);
    return response;
  }

  // Get job statistics without loading all jobs
  async getJobStats(token: string, filters?: JobsApiFilters): Promise<JobStats> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
          params.append(key, filters[key].toString());
        }
      });
    }
    
    const url = `${API_CONFIG.baseUrl}/api/v1/jobs/stats/?${params.toString()}`;
    const stats = await this.fetchWithRetry<JobStats>(url, token);
    return stats;
  }

  async getJob(token: string, jobId: string): Promise<Job> {
    const cacheKey = `job:${jobId}`;
    const cached = this.cache.get<Job>(cacheKey);
    if (cached) return cached;

    const url = `${API_CONFIG.baseUrl}/api/v1/jobs/${jobId}/`;
    const job = await this.fetchWithRetry<Job>(url, token);
    
    this.cache.set(cacheKey, job);
    return job;
  }

  async createJob(token: string, jobData: JobMutationData): Promise<Job> {
    const url = `${API_CONFIG.baseUrl}/api/v1/jobs/`;
    const job = await this.fetchWithRetry<Job>(url, token, {
      method: 'POST',
      body: JSON.stringify(jobData),
    });
    
    this.cache.invalidate('jobs');
    return job;
  }

  async updateJob(token: string, jobId: string, jobData: JobMutationData): Promise<Job> {
    const url = `${API_CONFIG.baseUrl}/api/v1/jobs/${jobId}/`;
    const job = await this.fetchWithRetry<Job>(url, token, {
      method: 'PATCH',
      body: JSON.stringify(jobData),
    });
    
    this.cache.invalidate(`job:${jobId}`);
    this.cache.invalidate('jobs');
    return job;
  }

  async deleteJob(token: string, jobId: string): Promise<void> {
    const url = `${API_CONFIG.baseUrl}/api/v1/jobs/${jobId}/`;
    await this.fetchWithRetry<void>(url, token, { method: 'DELETE' });
    
    this.cache.invalidate(`job:${jobId}`);
    this.cache.invalidate('jobs');
  }

  // Properties
  async getProperties(token: string): Promise<Property[]> {
    const cacheKey = 'properties';
    const cached = this.cache.get<Property[]>(cacheKey);
    if (cached) return cached;

    const url = `${API_CONFIG.baseUrl}/api/v1/properties/`;
    const properties = await this.fetchWithRetry<Property[]>(url, token);
    
    this.cache.set(cacheKey, properties);
    return properties;
  }

  // Real-time updates
  enableRealTime(token: string): void {
    this.realTimeUpdates.connect(token);
  }

  disableRealTime(): void {
    this.realTimeUpdates.disconnect();
  }

  subscribeToUpdates(listener: (data: JobRealtimeEvent) => void): () => void {
    return this.realTimeUpdates.subscribe(listener);
  }

  // Cache management
  clearCache(): void {
    this.cache.clear();
  }

  invalidateCache(pattern?: string): void {
    this.cache.invalidate(pattern);
  }
}

// Export a singleton instance
export const jobsApi = new JobsApiService();
