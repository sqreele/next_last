import type { PaginatedResponse } from "../api-contracts";

export type JobStatus =
  | "pending"
  | "in_progress"
  | "waiting_sparepart"
  | "completed"
  | "cancelled";

export type JobPriority = "low" | "medium" | "high";

export interface JobUserSummary {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  full_name: string;
  display_name: string;
}

export interface JobRoomSummary {
  room_id: number;
  name: string;
  room_type: string;
  properties: string[];
}

export interface JobTopic {
  id: number;
  title: string;
  description: string;
  is_visible_in_create_job: boolean;
}

export interface JobAreaSummary {
  id: number;
  name: string;
  is_active: boolean;
  property_id: string;
  property_name: string;
}

export interface JobProfileImage {
  profile_image: string | null;
  properties: Array<{ property_id: string; name: string }>;
}

export interface JobImage {
  id: number;
  image_url: string | null;
  jpeg_url: string | null;
  uploaded_by: number | null;
  uploaded_at: string;
}

/** Exact read representation emitted by the current JobSerializer. */
export interface JobApiResponse {
  id: number;
  job_id: string;
  user: JobUserSummary | null;
  user_username: string;
  user_first_name: string;
  user_last_name: string;
  user_email: string;
  user_name: string;
  technician_name: string;
  created_by_name: string;
  updated_by_name: string;
  updated_by: string | null;
  description: string;
  status: JobStatus;
  priority: JobPriority;
  remarks: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  is_defective: boolean;
  rooms: JobRoomSummary[];
  topics: JobTopic[];
  images: JobImage[];
  profile_image: JobProfileImage | null;
  image_urls: string[];
  is_preventivemaintenance: boolean;
  area: JobAreaSummary | null;
  area_name?: string;
  room_type?: string;
  name?: string;
  comments_count: number;
}

export interface JobTopicInput {
  title: string;
  description?: string;
}

interface JobWritableFields {
  description: string;
  topic_data: JobTopicInput;
  status?: JobStatus;
  priority?: JobPriority;
  remarks?: string;
  property_id?: string;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  is_defective?: boolean;
  is_preventivemaintenance?: boolean;
}

type JobLocationInput =
  | { room_id: number; area_id?: number | null }
  | { room_id?: number | null; area_id: number };

export type JobCreatePayload = JobWritableFields & JobLocationInput;
export type JobPutPayload = JobCreatePayload;

/** PATCH fields accepted by JobSerializer; read-only fields are excluded. */
export interface JobPatchPayload {
  description?: string;
  topic_data?: JobTopicInput;
  room_id?: number | null;
  property_id?: string;
  area_id?: number | null;
  status?: JobStatus;
  priority?: JobPriority;
  remarks?: string;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  is_defective?: boolean;
  is_preventivemaintenance?: boolean;
}

export interface JobsApiFilters {
  property?: string;
  property_id?: string | null;
  topic?: number | "all";
  topic_id?: number | "all";
  status?: JobStatus;
  room?: number | string;
  room_id?: number | string;
  room_name?: string;
  room_number?: string;
  area?: number | string | "all";
  area_id?: number | string | "all";
  user_id?: number | string | "all";
  search?: string;
  is_preventivemaintenance?: boolean;
  ordering?: "created_at" | "-created_at" | "updated_at" | "-updated_at" | "status" | "-status" | "priority" | "-priority";
  /** Legacy passthrough keys currently emitted by the dashboard; Django ignores them. */
  user?: string;
  dateFrom?: string;
  dateTo?: string;
}

export type JobListResponse = PaginatedResponse<JobApiResponse> & {
  page_size: number;
  current_page: number;
  total_pages: number;
};

export interface JobAllResponse {
  count: number;
  results: JobApiResponse[];
}
