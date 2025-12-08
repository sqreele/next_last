// ./app/lib/api-client.ts - Improved version
"use client";
declare const process: any;

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { useSession } from "@/app/lib/session.client";
import { appSignOut } from "@/app/lib/logout";
import { jwtDecode } from "jwt-decode";
import { useState,useCallback} from 'react'
import { getCsrfHeaders } from './csrf';

// Define token structure
interface JwtToken {
  exp?: number;
  user_id?: string;
  [key: string]: any;
}

// Define error interfaces for DRF style errors
export interface ApiErrorDetails {
  detail?: string; // General error message
  [key: string]: any; // Field-specific errors (e.g., "email": ["Enter a valid email."])
}

// Custom Error class
export class ApiError extends Error {
  status?: number;
  details?: ApiErrorDetails;

  constructor(message: string, status?: number, details?: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    // Maintain prototype chain
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// Create API client instance with increased timeout and debugging
const apiClient: AxiosInstance = axios.create({
  baseURL: (() => {
    // Use Django backend directly
    if (typeof window === 'undefined') {
      // Server-side: use internal docker networking
      return process.env.NEXT_PRIVATE_API_URL || "http://backend:8000";
    }
    // Client-side: use public URL
    return process.env.NEXT_PUBLIC_API_URL || 
      (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "https://pcms.live");
  })(),
  timeout: 30000, // Increased to 30 seconds
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  }
});

// Enable request debugging in development
if (process.env.NODE_ENV === 'development') {
  apiClient.interceptors.request.use((request: any) => {
    console.log('[API Request]', request.method?.toUpperCase(), request.url);
    return request;
  });
  
  // Remove duplicate response interceptor - the main one is below
}

// --- Retry Configuration ---
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second between retries

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Token Refresh Logic ---
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
const pendingRequests: Array<(token: string | null) => void> = [];

// Function to process queued requests after token refresh attempt
const processPendingRequests = (token: string | null): void => {
  console.log(`[Auth] Processing ${pendingRequests.length} pending requests with ${token ? 'new token' : 'no token'}`);
  pendingRequests.forEach(callback => callback(token));
  pendingRequests.length = 0; // Clear the queue
};

// Function to attempt token refresh
async function refreshToken(refreshTokenValue: string): Promise<string | null> {
  try {
    console.log("[Auth] Attempting to refresh access token...");
    // Use standard fetch or a separate axios instance to avoid interceptor loops
    const djangoBaseURL = process.env.NEXT_PUBLIC_API_URL ||
      (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "https://pcms.live");
    const response = await fetch(`${djangoBaseURL}/api/v1/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshTokenValue }),
    });

    if (!response.ok) {
       // If refresh fails (e.g., 401 Unauthorized), log out user
       if (response.status === 401) {
            console.error("[Auth] Refresh token failed or expired. Logging out.");
            await appSignOut({ redirect: false });
       }
       throw new ApiError(`Token refresh failed with status: ${response.status}`, response.status);
    }

    const refreshedTokens = await response.json();
    if (!refreshedTokens.access) {
      throw new Error('Refresh response did not contain access token');
    }

    console.log("[Auth] Token refreshed successfully.");
    return refreshedTokens.access; // Return only the new access token
  } catch (error) {
    console.error('[Auth] Error during token refresh:', error);
    return null; // Indicate refresh failure
  }
}

// --- Axios Interceptors ---

// Request Interceptor: Add token, handle expiry before sending
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Skip interceptor logic for token refresh endpoint itself
    if (config.url?.includes('/api/v1/token/refresh/') || config.url?.includes('/api/token/refresh/')) {
        console.log("[RequestInterceptor] Skipping token logic for refresh request.");
        return config;
    }

    // CRITICAL: Check if this is a FormData request
    const isFormData = config.data instanceof FormData;
    
    // If FormData, remove Content-Type header to let browser set it with boundary
    if (isFormData) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
      console.log("[RequestInterceptor] FormData detected - removed Content-Type header to let browser set boundary");
    }

    // For Auth0, we need to get the current access token from the session
    // and add it to the request headers
    try {
      // Get the current session data
      const sessionResponse = await fetch('/api/auth/session-compat', { 
        credentials: 'include',
        cache: 'no-store'
      });
      
      if (sessionResponse.ok) {
        const sessionData: any = await sessionResponse.json();
        
        if (sessionData?.user?.accessToken) {
          // Add the access token to the request headers
          config.headers.Authorization = `Bearer ${sessionData.user.accessToken}`;
          console.log("[RequestInterceptor] Added access token to request headers");
        } else {
          console.warn("[RequestInterceptor] No access token found in session");
        }
      } else {
        console.warn("[RequestInterceptor] Failed to get session data");
      }
    } catch (error) {
      console.warn("[RequestInterceptor] Error getting session data:", error);
    }
    
    // Add CSRF token for non-GET/HEAD/OPTIONS requests (but not for FormData)
    if (!isFormData && config.method && typeof config.method === 'string' && !['GET', 'HEAD', 'OPTIONS'].includes(config.method.toUpperCase())) {
      try {
        const csrfHeaders = await getCsrfHeaders();
        Object.assign(config.headers, csrfHeaders);
      } catch (csrfError) {
        console.warn("[RequestInterceptor] Failed to add CSRF headers:", csrfError);
      }
    }
    
    return config;
  },
  (error: any) => {
      console.error("[RequestInterceptor] Request setup error:", error);
      return Promise.reject(error);
  }
);

// Response Interceptor: Handle specific errors like 401 for retries
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
      return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: number };
    
    // Initialize retry counter if not present
    if (originalRequest._retry === undefined) {
      originalRequest._retry = 0;
    }
    
    // Check for timeout errors specifically
    if (error.code === 'ECONNABORTED' && originalRequest._retry < MAX_RETRIES) {
      console.log(`[ResponseInterceptor] Request timeout, attempt ${originalRequest._retry + 1}/${MAX_RETRIES}.`);
      originalRequest._retry++;
      
      // Add an increasing delay between retries
      await delay(RETRY_DELAY * originalRequest._retry);
      return apiClient(originalRequest);
    }
    
    // Check if it's a 401 error - for Auth0, this usually means the token is expired or invalid
    if (error.response?.status === 401 && originalRequest._retry < MAX_RETRIES) {
      console.log(`[ResponseInterceptor] Received 401, attempt ${originalRequest._retry + 1}/${MAX_RETRIES}.`);
      originalRequest._retry++;

      // For Auth0, we don't handle token refresh manually
      // Instead, redirect to login to get a fresh token
      if (originalRequest._retry >= MAX_RETRIES) {
          console.error("[ResponseInterceptor] 401 received multiple times. Redirecting to login.");
          // Use Auth0 logout to clear session and redirect to login
          window.location.href = '/auth/logout?returnTo=' + encodeURIComponent(window.location.pathname);
          return Promise.reject(new ApiError("Authentication required. Please log in again.", 401));
      }

      // For now, just reject the request - Auth0 will handle the redirect
      return Promise.reject(new ApiError("Authentication failed. Please log in again.", 401));
    }
    
    // Network errors - retry with backoff for non-401 responses
    if (error.response && [502, 503, 504].includes(error.response.status) && originalRequest._retry < MAX_RETRIES) {
      console.log(`[ResponseInterceptor] Network error ${error.response.status}, attempt ${originalRequest._retry + 1}/${MAX_RETRIES}.`);
      originalRequest._retry++;
      
      // Add an increasing delay between retries
      await delay(RETRY_DELAY * originalRequest._retry);
      return apiClient(originalRequest);
    }

    // For all other errors, normalize and reject
    console.error("[ResponseInterceptor] Unhandled error or retry failed:", error);
    return Promise.reject(handleApiError(error));
  }
);

/**
 * Handles API errors by normalizing them into a consistent ApiError format
 */
export const handleApiError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorDetails>;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data;
    let message = axiosError.message;
    let details: ApiErrorDetails | undefined = undefined;

    // Handle timeout errors specifically
    if (axiosError.code === 'ECONNABORTED') {
      message = 'Request timed out. The server took too long to respond.';
      return new ApiError(message, 408); // Using 408 Request Timeout
    }

    if (errorData) {
        if (typeof errorData === 'object' && errorData !== null) {
            if (typeof errorData.detail === 'string') {
                message = errorData.detail;
            }
            details = { ...errorData };
            
            // Create a summary message from field errors if no detail message
            const fieldErrors = Object.entries(details || {})
                .filter(([key]) => key !== 'detail')
                .map(([field, errors]) => {
                    const errorString = Array.isArray(errors) ? errors.join(', ') : String(errors);
                    return `${field}: ${errorString}`;
                })
                .join('; ');

            if (fieldErrors && message === axiosError.message) {
                message = `Validation Failed: ${fieldErrors}`;
            }
        } else if (typeof errorData === 'string') {
           message = errorData;
        }
    }

    console.error(`[handleApiError] Axios Error: Status=${status}, Message=${message}`, "Details:", details, "Original Error:", error);
    return new ApiError(message, status, details);

  } else if (error instanceof ApiError) {
     return error;
  } else if (error instanceof Error) {
     console.error(`[handleApiError] Generic Error: Message=${error.message}`, error);
     return new ApiError(error.message);
  } else {
     console.error('[handleApiError] Unknown error type:', error);
     return new ApiError('An unknown error occurred');
  }
};

/**
 * Generic fetch function using apiClient with retry logic
 */
export async function fetchData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  try {
    // Check if we're in development mode and if this is a mock token request
    // Production mode: Always make real API calls
    
    // Production mode: Make real API call
    const response = await apiClient.get<T>(url, config);
    console.log(`[fetchData] Response for ${url}: Status=${response.status}`);
    return response.data;
  } catch (error) {
    console.error(`[fetchData] Error caught for ${url}. Propagating processed error.`);
    throw handleApiError(error);
  }
}

/**
 * Generic POST function
 */
export async function postData<T, U>(url: string, data: U, config?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await apiClient.post<T>(url, data, config);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Generic PUT function
 */
export async function updateData<T, U>(url: string, data: U, config?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await apiClient.put<T>(url, data, config);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Generic PATCH function
 */
export async function patchData<T, U>(url: string, data: U, config?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await apiClient.patch<T>(url, data, config);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Generic DELETE function
 */
export async function deleteData(url: string, config?: AxiosRequestConfig): Promise<void> {
  try {
    await apiClient.delete(url, config);
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Upload file using multipart/form-data
 */
export async function uploadFile<T>(url: string, formData: FormData): Promise<T> {
  try {
    const response = await apiClient.post<T>(url, formData);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}
// Add this to your api-client.ts file

/**
 * Helper function to upload multipart form data with automatic auth handling
 * This function ensures proper content-type handling for file uploads
 */
export async function uploadMultipartData<T>(
  url: string, 
  formData: FormData, 
  options?: {
    onUploadProgress?: (progressEvent: any) => void;
    signal?: AbortSignal;
  }
): Promise<AxiosResponse<T>> {
  try {
    // Don't set Content-Type header manually - Axios will set it automatically with boundary
    const config: AxiosRequestConfig = {
      headers: {
        // Let the browser set the Content-Type with boundary for multipart/form-data
        // Don't set 'Content-Type': 'multipart/form-data' manually
      },
      onUploadProgress: options?.onUploadProgress,
      signal: options?.signal,
    };

    // Log debug info in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[uploadMultipartData] Uploading to:', url);
      console.log('[uploadMultipartData] FormData keys:', Array.from(formData.keys()));
    }

    const response = await apiClient.post<T>(url, formData, config);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[uploadMultipartData] Upload successful:', response.status);
    }
    
    return response;
  } catch (error) {
    console.error('[uploadMultipartData] Upload failed:', error);
    throw handleApiError(error);
  }
}

// Example usage in your form:
/*
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  try {
    const formData = new FormData();
    // Add your form fields...
    
    const response = await uploadMultipartData('/api/preventive-maintenance/', formData, {
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        console.log(`Upload Progress: ${percentCompleted}%`);
      }
    });
    
    // Handle success
  } catch (error) {
    // Handle error
  }
};
*/

// Alternative: Create a custom hook for form submission with upload progress
export function useFormSubmit<T>() {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  
  const submitForm = useCallback(async (
    url: string,
    data: FormData | object,
    isMultipart: boolean = false,
    method: 'POST' | 'PATCH' = 'POST'
  ): Promise<T | null> => {
    try {
      setIsSubmitting(true);
      setError(null);
      setUploadProgress(0);
      
      let response: AxiosResponse<T>;
      
      if (isMultipart && data instanceof FormData) {
        response = await uploadMultipartData<T>(url, data, {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        });
      } else {
        // Regular JSON submission
        if (method === 'PATCH') {
          response = await apiClient.patch<T>(url, data);
        } else {
          response = await apiClient.post<T>(url, data);
        }
      }
      
      return response.data;
    } catch (err) {
      const processedError = handleApiError(err);
      setError(processedError.message);
      return null;
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  }, []);
  
  return {
    submitForm,
    isSubmitting,
    uploadProgress,
    error,
    clearError: () => setError(null)
  };
}

// Utility function to create a FormData from an object
export function createFormData(data: Record<string, any>): FormData {
  const formData = new FormData();
  
  Object.entries(data).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    
    if (Array.isArray(value)) {
      // Handle arrays (like topic_ids)
      value.forEach(item => {
        formData.append(key, String(item));
      });
    } else if (value instanceof File) {
      // Handle file uploads
      formData.append(key, value);
    } else if (typeof value === 'object') {
      // Convert objects to JSON string
      formData.append(key, JSON.stringify(value));
    } else {
      // Handle primitive values
      formData.append(key, String(value));
    }
  });
  
  return formData;
}

// Example usage in PreventiveMaintenanceForm:
/*
const { submitForm, isSubmitting, uploadProgress, error, clearError } = useFormSubmit<PreventiveMaintenance>();

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!validateForm()) return;
  clearError();
  
  const submitData = {
    scheduled_date: formState.scheduled_date,
    frequency: formState.frequency,
    custom_days: formState.custom_days,
    notes: formState.notes,
    pmtitle: formState.pmtitle,
    topic_ids: formState.selected_topics,
    before_image: formState.before_image_file,
    after_image: formState.after_image_file,
  };
  
  const url = pmId 
    ? `/api/preventive-maintenance/${pmId}/`
    : '/api/preventive-maintenance/';
  
  const result = await submitForm(
    url,
    createFormData(submitData),
    true, // isMultipart
    pmId ? 'PATCH' : 'POST'
  );
  
  if (result) {
    onSuccessAction(result);
    if (!pmId) resetForm();
  }
};
*/

export default apiClient;
