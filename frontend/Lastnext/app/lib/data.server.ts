import { Job, Property, JobStatus, Room, User, Topic } from "./types";
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

  console.log(`${method} ${absoluteUrl}`, {
    hasAuth: !!headers["Authorization"],
    method
  });

  try {
    const response = await fetch(absoluteUrl, options);
    const responseText = await response.text();

    console.log(
      "Response Status:",
      response.status,
      "Content-Length:",
      responseText.length,
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
  accessToken?: string,
  additionalParams?: string
): Promise<Job[]> {
  try {
    // Backend expects property_id
    const baseUrl = `/api/v1/jobs/?property_id=${propertyId}`;
    const url = additionalParams ? `${baseUrl}&${additionalParams}` : baseUrl;
    const jobs = await fetchWithToken<Job[]>(url, accessToken);
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
    console.log('fetchJobs: Starting to fetch all jobs...');
    console.log('fetchJobs: Access token available:', !!accessToken);
    
    const response = await fetchWithToken<any>('/api/v1/jobs/', accessToken);
    console.log('fetchJobs: Raw response type:', typeof response);
    console.log('fetchJobs: Response structure:', response ? Object.keys(response) : 'null');
    
    // Handle paginated response format
    let jobs: Job[] = [];
    if (response && typeof response === 'object') {
      if (Array.isArray(response)) {
        // Direct array response
        jobs = response;
        console.log(`fetchJobs: Direct array response - ${jobs.length} jobs`);
      } else if (response.results && Array.isArray(response.results)) {
        // Paginated response with results field
        jobs = response.results;
        console.log(`fetchJobs: Paginated response - ${jobs.length} jobs from results field`);
        if (response.count !== undefined) {
          console.log(`fetchJobs: Total count from pagination: ${response.count}`);
        }
      } else {
        console.error('fetchJobs: Unexpected response format:', response);
        return [];
      }
    } else {
      console.error('fetchJobs: Invalid response:', response);
      return [];
    }
    
    const sanitizedJobs = sanitizeJobsData(jobs);
    console.log(`fetchJobs: After sanitization - ${sanitizedJobs.length} jobs`);
    
    const fixedJobs = fixJobsImageUrls(sanitizedJobs);
    console.log(`fetchJobs: After image URL fixing - ${fixedJobs.length} jobs`);
    
    return fixedJobs;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    
    // Log more details about the error
    if (error instanceof ServerApiError) {
      console.error('ServerApiError details:', {
        status: error.status,
        message: error.message,
        errorData: error.errorData
      });
    }
    
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

export async function fetchMyJobs(accessToken?: string, queryParams?: string): Promise<Job[]> {
  console.log("fetchMyJobs: Starting to fetch my jobs...");
  try {
    const url = queryParams ? `/api/v1/jobs/my_jobs/?${queryParams}` : `/api/v1/jobs/my_jobs/`;
    const response = await fetchWithToken<any>(url, accessToken);
    console.log(`fetchMyJobs: Raw API response:`, response);
    console.log(`fetchMyJobs: Response type:`, typeof response);
    
    // The backend returns a structured response with 'results' field containing the jobs
    let jobs: Job[] = [];
    if (response && typeof response === 'object') {
      if (Array.isArray(response)) {
        // Direct array response (fallback)
        jobs = response;
      } else if (response.results && Array.isArray(response.results)) {
        // Structured response with results field
        jobs = response.results;
        console.log(`fetchMyJobs: Extracted ${jobs.length} jobs from results field`);
      } else {
        console.error('fetchMyJobs: Unexpected response format:', response);
        return [];
      }
    }
    
    console.log(`fetchMyJobs: Successfully extracted ${jobs.length} jobs from API`);
    
    if (!jobs || !Array.isArray(jobs)) {
      console.error('fetchMyJobs: No valid jobs array found:', jobs);
      return [];
    }
    
    const sanitizedJobs = sanitizeJobsData(jobs);
    console.log(`fetchMyJobs: After sanitization:`, sanitizedJobs);
    
    const fixedJobs = fixJobsImageUrls(sanitizedJobs);
    console.log(`fetchMyJobs: After image URL fixing:`, fixedJobs);
    console.log(`fetchMyJobs: Returning ${fixedJobs.length} processed jobs`);
    return fixedJobs;
  } catch (error) {
    console.error('fetchMyJobs: Error fetching my jobs:', error);
    throw error;
  }
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
        const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
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

export async function fetchUsers(accessToken?: string): Promise<User[]> {
  console.log("fetchUsers: Starting to fetch users...");
  try {
    const response = await fetchWithToken<any>(`/api/v1/users/`, accessToken);
    console.log(`fetchUsers: Raw API response:`, response);
    
    // The backend returns a structured response with 'results' field containing the users
    let users: User[] = [];
    if (response && typeof response === 'object') {
      if (Array.isArray(response)) {
        // Direct array response (fallback)
        users = response;
      } else if (response.results && Array.isArray(response.results)) {
        // Structured response with results field
        users = response.results;
        console.log(`fetchUsers: Extracted ${users.length} users from results field`);
      } else {
        console.error('fetchUsers: Unexpected response format:', response);
        return [];
      }
    } else {
      console.error('fetchUsers: Invalid response type:', typeof response);
      return [];
    }

    console.log(`fetchUsers: Successfully fetched ${users.length} users`);
    return users;
  } catch (error) {
    console.error('fetchUsers: Error fetching users:', error);
    throw new ServerApiError('Failed to fetch users', 500, error);
  }
}

export async function fetchUsersByProperty(propertyId: string, accessToken?: string): Promise<User[]> {
  console.log(`fetchUsersByProperty: Starting to fetch users for property ${propertyId}...`);
  try {
    // Use the user-profiles endpoint which includes property information
    const response = await fetchWithToken<any>(`/api/v1/user-profiles/`, accessToken);
    console.log(`fetchUsersByProperty: Raw API response:`, response);
    
    // The backend returns a structured response with 'results' field containing the user profiles
    let userProfiles: any[] = [];
    if (response && typeof response === 'object') {
      if (Array.isArray(response)) {
        // Direct array response (fallback)
        userProfiles = response;
      } else if (response.results && Array.isArray(response.results)) {
        // Structured response with results field
        userProfiles = response.results;
        console.log(`fetchUsersByProperty: Extracted ${userProfiles.length} user profiles from results field`);
      } else {
        console.error('fetchUsersByProperty: Unexpected response format:', response);
        return [];
      }
    } else {
      console.error('fetchUsersByProperty: Invalid response type:', typeof response);
      return [];
    }

    // Filter users by property
    const usersWithProperty = userProfiles.filter(profile => {
      if (!profile.properties || !Array.isArray(profile.properties)) {
        return false;
      }
      return profile.properties.some((prop: any) => 
        prop.property_id === propertyId || prop.id === propertyId
      );
    });

    // Transform to User format
    const users: User[] = usersWithProperty.map(profile => ({
      id: profile.id,
      username: profile.username,
      email: profile.email,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      positions: profile.positions || '',
      profile_image: profile.profile_image,
      properties: profile.properties || [],
      accessToken: '', // Not needed for this context
      refreshToken: '', // Not needed for this context
      created_at: profile.created_at
    }));

    console.log(`fetchUsersByProperty: Successfully fetched ${users.length} users for property ${propertyId}`);
    return users;
  } catch (error) {
    console.error('fetchUsersByProperty: Error fetching users by property:', error);
    throw new ServerApiError('Failed to fetch users by property', 500, error);
  }
}

export async function fetchTopics(accessToken?: string): Promise<Topic[]> {
  console.log("fetchTopics: Starting to fetch topics...");
  try {
    const response = await fetchWithToken<any>(`/api/v1/topics/`, accessToken);
    console.log(`fetchTopics: Raw API response:`, response);
    
    // The backend returns a structured response with 'results' field containing the topics
    let topics: Topic[] = [];
    if (response && typeof response === 'object') {
      if (Array.isArray(response)) {
        // Direct array response (fallback)
        topics = response;
      } else if (response.results && Array.isArray(response.results)) {
        // Structured response with results field
        topics = response.results;
        console.log(`fetchTopics: Extracted ${topics.length} topics from results field`);
      } else {
        console.error('fetchTopics: Unexpected response format:', response);
        return [];
      }
    } else {
      console.error('fetchTopics: Invalid response type:', typeof response);
      return [];
    }

    console.log(`fetchTopics: Successfully fetched ${topics.length} topics`);
    return topics;
  } catch (error) {
    console.error('fetchTopics: Error fetching topics:', error);
    throw new ServerApiError('Failed to fetch topics', 500, error);
  }
}

export async function fetchRooms(accessToken?: string): Promise<Room[]> {
  console.log("fetchRooms: Starting to fetch rooms...");
  try {
    const response = await fetchWithToken<any>(`/api/v1/rooms/`, accessToken);
    console.log(`fetchRooms: Raw API response:`, response);
    
    // The backend returns a structured response with 'results' field containing the rooms
    let rooms: Room[] = [];
    if (response && typeof response === 'object') {
      if (Array.isArray(response)) {
        // Direct array response (fallback)
        rooms = response;
      } else if (response.results && Array.isArray(response.results)) {
        // Structured response with results field
        rooms = response.results;
        console.log(`fetchRooms: Extracted ${rooms.length} rooms from results field`);
      } else {
        console.error('fetchRooms: Unexpected response format:', response);
        return [];
      }
    } else {
      console.error('fetchRooms: Invalid response type:', typeof response);
      return [];
    }

    console.log(`fetchRooms: Successfully fetched ${rooms.length} rooms`);
    return rooms;
  } catch (error) {
    console.error('fetchRooms: Error fetching rooms:', error);
    throw new ServerApiError('Failed to fetch rooms', 500, error);
  }
}