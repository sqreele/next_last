import type { JobPriority, JobStatus } from "./job-contracts";

export type GlobalSearchType = "job" | "property" | "room";

export interface SearchPropertyRef {
  id: number;
  property_id: string;
  name: string;
}

export interface JobSearchResult {
  type: "job";
  id: string;
  description: string;
  status: JobStatus;
  priority: JobPriority;
  created_at: string;
  url: string;
}

export interface PropertySearchResult {
  type: "property";
  id: string;
  name: string;
  description: string | null;
  url: string;
}

export interface RoomSearchResult {
  type: "room";
  id: number;
  name: string;
  room_type: string;
  is_active: boolean;
  created_at: string;
  property: SearchPropertyRef | null;
  url: string;
}

export type GlobalSearchResult = JobSearchResult | PropertySearchResult | RoomSearchResult;

export interface GlobalSearchResponse {
  results: GlobalSearchResult[];
  total: number;
}

export interface GlobalSearchQuery {
  q: string;
  property_id: string;
}

const JOB_STATUSES: readonly JobStatus[] = ["pending", "in_progress", "waiting_sparepart", "completed", "cancelled"];
const JOB_PRIORITIES: readonly JobPriority[] = ["low", "medium", "high"];

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && JOB_STATUSES.some((status) => status === value);
}

function isJobPriority(value: unknown): value is JobPriority {
  return typeof value === "string" && JOB_PRIORITIES.some((priority) => priority === value);
}

function isPropertyRef(value: unknown): value is SearchPropertyRef {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "number" &&
    "property_id" in value && typeof value.property_id === "string" &&
    "name" in value && typeof value.name === "string";
}

export function toJobSearchResult(value: unknown): JobSearchResult | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("job_id" in value && typeof value.job_id === "string" &&
    "description" in value && typeof value.description === "string" &&
    "status" in value && isJobStatus(value.status) &&
    "priority" in value && isJobPriority(value.priority) &&
    "created_at" in value && typeof value.created_at === "string")) return null;
  return {
    type: "job",
    id: value.job_id,
    description: value.description,
    status: value.status,
    priority: value.priority,
    created_at: value.created_at,
    url: `/dashboard/jobs/${encodeURIComponent(value.job_id)}`,
  };
}

export function toPropertySearchResult(value: unknown): PropertySearchResult | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("property_id" in value && typeof value.property_id === "string" &&
    "name" in value && typeof value.name === "string" &&
    "description" in value && (typeof value.description === "string" || value.description === null))) return null;
  return {
    type: "property",
    id: value.property_id,
    name: value.name,
    description: value.description,
    url: `/dashboard/properties?property_id=${encodeURIComponent(value.property_id)}`,
  };
}

export function toRoomSearchResult(
  value: unknown,
  properties: SearchPropertyRef[],
): RoomSearchResult | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("room_id" in value && typeof value.room_id === "number" &&
    "name" in value && typeof value.name === "string" &&
    "room_type" in value && typeof value.room_type === "string" &&
    "is_active" in value && typeof value.is_active === "boolean" &&
    "created_at" in value && typeof value.created_at === "string" &&
    "properties" in value && Array.isArray(value.properties) && value.properties.every((id) => typeof id === "number"))) return null;
  const propertyIds = value.properties;
  const property = properties.find((candidate) => propertyIds.includes(candidate.id)) ?? null;
  return {
    type: "room",
    id: value.room_id,
    name: value.name,
    room_type: value.room_type,
    is_active: value.is_active,
    created_at: value.created_at,
    property,
    url: `/dashboard/rooms/${value.room_id}`,
  };
}

function isGlobalSearchResult(value: unknown): value is GlobalSearchResult {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  if (value.type === "job") {
    return "id" in value && typeof value.id === "string" && "description" in value && typeof value.description === "string" &&
      "status" in value && isJobStatus(value.status) && "priority" in value && isJobPriority(value.priority) &&
      "created_at" in value && typeof value.created_at === "string" && "url" in value && typeof value.url === "string";
  }
  if (value.type === "property") {
    return "id" in value && typeof value.id === "string" && "name" in value && typeof value.name === "string" &&
      "description" in value && (typeof value.description === "string" || value.description === null) &&
      "url" in value && typeof value.url === "string";
  }
  if (value.type === "room") {
    return "id" in value && typeof value.id === "number" && "name" in value && typeof value.name === "string" &&
      "room_type" in value && typeof value.room_type === "string" && "is_active" in value && typeof value.is_active === "boolean" &&
      "created_at" in value && typeof value.created_at === "string" && "property" in value && (value.property === null || isPropertyRef(value.property)) &&
      "url" in value && typeof value.url === "string";
  }
  return false;
}

export function isGlobalSearchResponse(value: unknown): value is GlobalSearchResponse {
  return typeof value === "object" && value !== null &&
    "results" in value && Array.isArray(value.results) && value.results.every(isGlobalSearchResult) &&
    "total" in value && typeof value.total === "number" && Number.isInteger(value.total) && value.total === value.results.length;
}

export function globalSearchQueryString(query: GlobalSearchQuery): string {
  const params = new URLSearchParams();
  params.set("q", query.q.trim());
  params.set("property_id", query.property_id);
  return params.toString();
}

export function groupSearchResults(results: GlobalSearchResult[]) {
  return {
    jobs: results.filter((result): result is JobSearchResult => result.type === "job"),
    properties: results.filter((result): result is PropertySearchResult => result.type === "property"),
    rooms: results.filter((result): result is RoomSearchResult => result.type === "room"),
  };
}
