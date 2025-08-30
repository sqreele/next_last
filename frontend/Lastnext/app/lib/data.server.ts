import { Job, Property, JobStatus, Room } from "./types";
import { API_CONFIG } from "./config";
import { fixJobsImageUrls, fixJobImageUrls, sanitizeJobsData, sanitizeJobData } from "./utils/image-utils";

// Server-side compatible error class
export class ServerApiError extends Error {
  status: number;
  errorData: any;

  constructor(message: string, status: number, errorData?: any) {
    super(message);
    this.name = 'ServerApiError';
    this.status = status;
    this.errorData = errorData;
  }
}

export async function fetchWithToken<T>(
  url: string,
  token?: string,
  method: string = "GET",
  body?: any
): Promise<T> {
  // Production mode: Always make real API calls

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    console.warn('⚠️ No access token provided for request:', url);
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (method !== "GET" && body) {
    options.body = JSON.stringify(body);
  }

  // Handle relative URLs by making them absolute for server-side requests
  let absoluteUrl = url;
  if (url.startsWith('/')) {
    // For server-side requests, we need to use the Django backend directly
    absoluteUrl = `${API_CONFIG.baseUrl}${url}`;
  }

  console.log(`${method} ${absoluteUrl}`, options);

  try {
    const response = await fetch(absoluteUrl, options);
    const responseText = await response.text();

    console.log(
      "Response Status:",
      response.status,
      "Preview:",
      responseText.length > 200 ? responseText.substring(0, 200) + "..." : responseText
    );

    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      let errorMessage = `Request failed with status ${response.status}`;
      let errorData = null;
      
      if (contentType?.includes("application/json") && responseText) {
        try {
          errorData = JSON.parse(responseText);
          errorMessage = errorData.detail || errorMessage;
        } catch (parseError) {
          console.error("Failed to parse error JSON:", parseError);
        }
      }
      
      // Handle authentication errors specifically
      if (response.status === 401) {
        if (!token) {
          errorMessage = "Authentication required - no access token provided";
        } else {
          errorMessage = "Authentication failed - invalid or expired token";
        }
      }
      
      throw new ServerApiError(errorMessage, response.status, errorData);
    }

    if (!responseText.trim()) {
      if (method === "GET" && absoluteUrl.includes("/api/jobs") && !absoluteUrl.includes("/my-jobs/")) {
        return [] as unknown as T;
      }
      throw new ServerApiError("Received empty response from server", 204);
    }

    try {
      return JSON.parse(responseText) as T;
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      throw new ServerApiError(
        `Failed to parse response as JSON: ${responseText.substring(0, 200)}...`,
        500
      );
    }
  } catch (error) {
    console.error(`Error during ${method} request to ${absoluteUrl}:`, error);
    if (error instanceof ServerApiError) {
      throw error;
    }
    throw new ServerApiError((error as Error).message || "Network error", 0);
  }
}

export async function fetchProperties(accessToken?: string): Promise<Property[]> {
  return fetchWithToken<Property[]>('/api/v1/properties/', accessToken);
}

export async function fetchJobsForProperty(
  propertyId: string,
  accessToken?: string
): Promise<Job[]> {
  try {
    const jobs = await fetchWithToken<Job[]>(`/api/v1/jobs/?property=${propertyId}`, accessToken);
    console.log(`📋 Jobs fetched: { count: ${jobs.length} }`);
    const sanitizedJobs = sanitizeJobsData(jobs);
    return fixJobsImageUrls(sanitizedJobs);
  } catch (error) {
    console.error('Error in fetchJobsForProperty:', error);
    throw error;
  }
}

export async function fetchJobs(accessToken?: string): Promise<Job[]> {
  try {
    const jobs = await fetchWithToken<Job[]>('/api/v1/jobs/', accessToken);
    const sanitizedJobs = sanitizeJobsData(jobs);
    return fixJobsImageUrls(sanitizedJobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    
    // During build time or when backend is unavailable, return empty array
    if (process.env.NODE_ENV === 'production' || error instanceof ServerApiError) {
      console.warn('Returning empty jobs array due to fetch error');
      return [];
    }
    
    // Re-throw the error for development to help with debugging
    throw error;
  }
}

export async function fetchJob(jobId: string, accessToken?: string): Promise<Job | null> {
  try {
    const job = await fetchWithToken<Job>(`/api/v1/jobs/${jobId}/`, accessToken);
    const sanitizedJob = sanitizeJobData(job);
    return fixJobImageUrls(sanitizedJob);
  } catch (error) {
    console.error(`Error fetching job ${jobId}:`, error);
    return null;
  }
}

export async function updateJob(
  jobId: string,
  jobData: Partial<Job>,
  accessToken?: string
): Promise<Job> {
  return fetchWithToken<Job>(`/api/v1/jobs/${jobId}/`, accessToken, "PATCH", jobData);
}

export async function deleteJob(jobId: string, accessToken?: string): Promise<void> {
  await fetchWithToken<void>(`/api/v1/jobs/${jobId}/`, accessToken, "DELETE");
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  accessToken?: string
): Promise<Job> {
  return fetchWithToken<Job>(`/api/v1/jobs/${jobId}/`, accessToken, "PATCH", { status });
}

export async function fetchMyJobs(accessToken?: string): Promise<Job[]> {
  const jobs = await fetchWithToken<Job[]>(`/api/v1/jobs/my-jobs/`, accessToken);
  const sanitizedJobs = sanitizeJobsData(jobs);
  return fixJobsImageUrls(sanitizedJobs);
}

export async function fetchRoom(roomId: string, accessToken?: string): Promise<Room | null> {
  try {
    return await fetchWithToken<Room>(`/api/v1/rooms/${roomId}/`, accessToken);
  } catch (error) {
    console.error(`Error fetching room ${roomId}:`, error);
    return null;
    }
}

export async function fetchJobsForRoom(roomId: string, accessToken?: string): Promise<Job[]> {
  const jobs = await fetchWithToken<Job[]>(`/api/v1/jobs/?room=${roomId}`, accessToken);
  const sanitizedJobs = sanitizeJobsData(jobs);
  return fixJobsImageUrls(sanitizedJobs);
}

export async function updateUserProfile(auth0Profile: any, accessToken?: string): Promise<boolean> {
  try {
    let token = accessToken;
    
    // If no token provided, try to get it from the session
    if (!token) {
      try {
        // For server-side calls, we need to use the full URL
        const baseUrl = process.env.AUTH0_BASE_URL || 'http://localhost:3000';
        const sessionResponse = await fetch(`${baseUrl}/api/auth/session-compat`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (!sessionResponse.ok) {
          console.error('❌ Failed to get session for profile update');
          return false;
        }
        
        const session = await sessionResponse.json();
        token = session?.user?.accessToken;
      } catch (sessionError) {
        console.error('❌ Error getting session for profile update:', sessionError);
        return false;
      }
    }
    
    if (!token) {
      console.error('❌ No access token available for profile update');
      return false;
    }
    
    console.log('🔍 Updating user profile with token:', token.substring(0, 20) + '...');
    
    const response = await fetchWithToken<{message: string, updated_fields: string[], user: any}>(
      '/api/v1/auth/profile/update/',
      token,
      'POST',
      {
        auth0_profile: auth0Profile
      }
    );

    console.log('✅ User profile updated successfully:', response);
    return true;
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    return false;
  }
}