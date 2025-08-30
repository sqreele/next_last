// ./app/lib/data.ts
"use client"; // Keep if needed, but data fetching logic often doesn't need it directly

import axios, { AxiosError } from 'axios';
// Assuming apiClient handles auth headers automatically
import apiClient, { fetchData, postData, updateData, deleteData, patchData } from '@/app/lib/api-client';
import {
  Job,
  JobStatus,
  Property,
  Topic,
  Room,
  FilterState,
  TabValue,
  SearchCriteria,
  SearchResponse,
  DRFErrorResponse
} from './types'; // Ensure types path is correct

// Interface for structured API errors
interface ApiError extends Error {
  status?: number;
  details?: Record<string, string | string[]>; // Matches handleApiError output
}

// --- Job Functions ---

export const fetchJobsForProperty = async (propertyId: string, token?: string): Promise<Job[]> => {
  try {
    if (!propertyId) throw new Error('Property ID is required');
    // Use Next.js API proxy for auth-injected request
    const res = await fetch(`/api/jobs/?property_id=${encodeURIComponent(propertyId)}`, { credentials: 'include' });
    if (!res.ok) return [];
    const response = (await res.json()) as any;
    // Support both paginated and array responses
    if (Array.isArray(response)) return response as Job[];
    if (response?.results) return response.results as Job[];
    return [];
  } catch (error) {
    // Log the error but return empty array for graceful handling in UI
    console.error(`Error fetching jobs for property ${propertyId}:`, error);
    // Or re-throw using handleApiError if you want the hook to catch it
    // throw handleApiError(error);
    return [];
  }
};

export const createJob = async (jobData: Partial<Job>, token?: string): Promise<Job> => {
  try {
    if (!jobData) throw new Error('Job data is required');
    // Pass data type and expected return type to postData
    return await postData<Job, Partial<Job>>('/api/jobs/', jobData);
  } catch (error) {
    throw handleApiError(error); // Propagate structured error
  }
};

export const updateJob = async (jobId: string, jobData: Partial<Job>, token?: string): Promise<Job> => {
  try {
    if (!jobId) throw new Error('Job ID is required');
    // Pass data type and expected return type to updateData
    return await updateData<Job, Partial<Job>>(`/api/v1/jobs/${jobId}/`, jobData, token ? {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    } : undefined);
  } catch (error) {
    throw handleApiError(error);
  }
};

export const deleteJob = async (jobId: string, token?: string): Promise<void> => {
  try {
    if (!jobId) throw new Error('Job ID is required');
    // Pass authentication token to deleteData
    await deleteData(`/api/v1/jobs/${jobId}/`, token ? {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    } : undefined);
  } catch (error) {
    throw handleApiError(error);
  }
};

export const updateJobStatus = async (jobId: string, status: JobStatus, token?: string): Promise<Job> => {
  try {
    if (!jobId) throw new Error('Job ID is required');
    // Pass data type and expected return type to patchData
    return await patchData<Job, { status: JobStatus }>(`/api/v1/jobs/${jobId}/`, { status }, token ? {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    } : undefined);
  } catch (error) {
    throw handleApiError(error);
  }
};

export const uploadJobImage = async (jobId: string, imageFile: File, token?: string): Promise<{ image_url: string }> => {
  if (!jobId || !imageFile) throw new Error('Job ID and image file are required');

  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('job_id', jobId); // Does the backend need job_id in form data? Check API spec.

  try {
    // Assuming apiClient is an Axios instance configured for auth
    const response = await apiClient.post(`/api/v1/jobs/${jobId}/images/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        // Auth header should be added by apiClient interceptor
      }
    });
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

export const searchJobs = async (criteria: SearchCriteria, token?: string): Promise<SearchResponse> => {
  try {
    if (!criteria) throw new Error('Search criteria are required');
    
    const queryString = new URLSearchParams();
    if (criteria.query) queryString.append('search', criteria.query);
    if (criteria.status) queryString.append('status', criteria.status);
    if (criteria.category) queryString.append('category', criteria.category);
    if (criteria.dateRange?.start) queryString.append('date_from', criteria.dateRange.start);
    if (criteria.dateRange?.end) queryString.append('date_to', criteria.dateRange.end);
    if (criteria.page) queryString.append('page', criteria.page.toString());
    if (criteria.pageSize) queryString.append('page_size', criteria.pageSize.toString());
    
    const response = await fetchData<SearchResponse>(`/api/v1/jobs/?${queryString}`, token ? {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    } : undefined);
    return response;
  } catch (error) {
    throw handleApiError(error);
  }
};

export const fetchJobs = async (token?: string): Promise<Job[]> => {
  try {
    const response = await fetchData<Job[]>("/api/v1/jobs/", token ? {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    } : undefined);
    return response ?? [];
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return [];
  }
};

export const fetchJob = async (jobId: string, token?: string): Promise<Job | null> => {
  try {
    if (!jobId) throw new Error('Job ID is required');
    const response = await fetchData<Job>(`/api/v1/jobs/${jobId}/`, token ? {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    } : undefined);
    return response ?? null;
  } catch (error) {
    console.error(`Error fetching job ${jobId}:`, error);
    return null;
  }
};


// --- Property Functions ---

export const fetchProperties = async (): Promise<Property[]> => {
    try {
        // Use Next.js API proxy to include auth automatically
        const res = await fetch('/api/properties/', { credentials: 'include' });
        if (!res.ok) return [];
        const response = (await res.json()) as Property[];
        return response ?? [];
    } catch (error) {
        console.error('Error fetching properties:', error);
        return [];
    }
};

export const fetchProperty = async (propertyId: string, token?: string): Promise<Property | null> => {
    try {
        if (!propertyId) throw new Error('Property ID is required');
        return await fetchData<Property>(`/api/v1/properties/${propertyId}/`, token ? {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        } : undefined);
    } catch (error) {
        console.error(`Error fetching property ${propertyId}:`, error);
        return null;
    }
};


// --- Topic & Room Functions ---

export const fetchTopics = async (): Promise<Topic[]> => {
  try {
    // Use Next.js API proxy to include auth automatically
    const res = await fetch('/api/topics/', { credentials: 'include' });
    if (!res.ok) return [];
    const response = (await res.json()) as Topic[];
    return response ?? [];
  } catch (error) {
    console.error('Error fetching topics:', error);
    return [];
  }
};

export const fetchRooms = async (propertyId: string): Promise<Room[]> => {
  try {
    if (!propertyId) throw new Error('Property ID is required');
    // Use Next.js API proxy for auth-injected request
    const res = await fetch(`/api/rooms/?property=${encodeURIComponent(propertyId)}`, { credentials: 'include' });
    if (!res.ok) return [];
    const response = (await res.json()) as Room[];
    return response ?? [];
  } catch (error) {
    console.error(`Error fetching rooms for property ${propertyId}:`, error);
    return [];
  }
};

export const fetchRoom = async (roomId: string, token?: string): Promise<Room | null> => {
    try {
        if (!roomId) throw new Error('Room ID is required');
        return await fetchData<Room>(`/api/v1/rooms/${roomId}/`, token ? {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        } : undefined);
    } catch (error) {
        console.error(`Error fetching room ${roomId}:`, error);
        return null;
    }
};


// --- Search All Function ---

export const searchAll = async (criteria: SearchCriteria): Promise<SearchResponse> => {
  try {
    const params = new URLSearchParams();
    // Build query parameters safely
    if (criteria.query) params.append('q', criteria.query);
    if (criteria.category && criteria.category !== 'All') params.append('category', criteria.category);
    if (criteria.status) params.append('status', criteria.status);
    if (criteria.dateRange?.start) params.append('date_from', criteria.dateRange.start); // Assuming YYYY-MM-DD format
    if (criteria.dateRange?.end) params.append('date_to', criteria.dateRange.end);       // Assuming YYYY-MM-DD format
    if (criteria.page) params.append('page', String(criteria.page));
    if (criteria.pageSize) params.append('limit', String(criteria.pageSize));

    // Use Next.js API proxy which aggregates results and injects auth
    const res = await fetch(`/api/search/?${params.toString()}`, { credentials: 'include' });
    if (!res.ok) {
      return { jobs: [], properties: [], totalCount: 0 };
    }
    const response = (await res.json()) as SearchResponse;
    return response ?? { jobs: [], properties: [], totalCount: 0 };
  } catch (error) {
    console.error('Error performing search:', error);
    return {
      jobs: [],
      properties: [],
      totalCount: 0,
      error: error instanceof Error ? error.message : 'Search failed' // Include error message
    };
  }
};

// ... (imports อื่นๆ ข้างบน)

export const fetchPreventiveMaintenanceJobs = async (options?: {
  propertyId?: string;
  status?: JobStatus;
  limit?: number;
}, token?: string): Promise<Job[]> => {
  try {
    const params = new URLSearchParams();
    params.append('is_preventivemaintenance', 'true');
    if (options?.propertyId) params.append('property', options.propertyId);
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());

    const response = await fetchData<Job[]>(`/api/v1/jobs/?${params.toString()}`, token ? {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    } : undefined);
    return response ?? [];
  } catch (error) {
    throw handleApiError(error);
  }
};

// --- Error Handling ---
const handleApiError = (error: unknown): never => {
  // Check if it's an Axios error
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<DRFErrorResponse>; // Type assertion for DRF structure
    const apiError: ApiError = new Error('API request failed'); // Base error message
    apiError.status = axiosError.response?.status; // Get HTTP status

    const errorData = axiosError.response?.data; // Get response data (potentially DRF error details)

    if (errorData) {
        // Try to extract DRF's 'detail' message first
        if (typeof errorData.detail === 'string') {
            apiError.message = errorData.detail;
        } else {
             // If no 'detail', combine other field errors (common in validation errors)
             const fieldErrors = Object.entries(errorData)
                // Filter out non-string/non-array values just in case
                .filter(([key, value]) => typeof value === 'string' || Array.isArray(value))
                .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
                .join('; ');

            if (fieldErrors) {
                 apiError.message = `Validation Failed: ${fieldErrors}`;
            } else if (axiosError.message) {
                 // Fallback to Axios's own error message if no specific details found
                 apiError.message = axiosError.message;
            }
        }
        // Store the detailed error structure if needed for complex UI feedback
        // Clean the data structure slightly for easier use
         const cleanedDetails: Record<string, string | string[]> = {};
         Object.keys(errorData).forEach((key) => {
            const value = errorData[key];
            if (value !== undefined && value !== null) { // Check for null as well
                 cleanedDetails[key] = value;
            }
         });
        apiError.details = cleanedDetails;

    } else if (axiosError.request) {
         // The request was made but no response was received
         apiError.message = 'No response received from server. Check network connection or server status.';
    } else {
         // Something happened in setting up the request that triggered an Error
         apiError.message = axiosError.message || 'Error setting up API request.';
    }
    throw apiError; // Throw the structured ApiError
  }

  // If it's not an Axios error, re-throw it or wrap it
  if (error instanceof Error) {
    throw error; // Re-throw standard errors
  } else {
    throw new Error('An unknown error occurred'); // Wrap unknown errors
  }
};
