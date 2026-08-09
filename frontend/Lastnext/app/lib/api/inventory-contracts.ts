import type { PaginatedResponse } from "../api-contracts";
import type { JobStatus } from "./job-contracts";
import type { PMStatus } from "./pm-contracts";

export type InventoryStatus =
  | "available"
  | "low_stock"
  | "out_of_stock"
  | "reserved"
  | "maintenance";

export type InventoryCategory =
  | "tools"
  | "parts"
  | "supplies"
  | "equipment"
  | "consumables"
  | "safety"
  | "other";

export type InventoryUsageSource = "job" | "preventive_maintenance" | "manual";

export function isInventoryCategory(value: string): value is InventoryCategory {
  return ["tools", "parts", "supplies", "equipment", "consumables", "safety", "other"].includes(value);
}

export function isInventoryStatus(value: string): value is InventoryStatus {
  return ["available", "low_stock", "out_of_stock", "reserved", "maintenance"].includes(value);
}

export interface InventoryJobSummary {
  job_id: string;
  description: string;
  status: JobStatus;
}

export interface InventoryPMSummary {
  pm_id: string;
  title: string;
  status: PMStatus;
}

export interface InventoryLastJob {
  job_id: string;
  description: string;
  full_description: string;
}

export interface InventoryLastPM {
  pm_id: string;
  title: string;
  full_title: string;
}

export interface InventoryListItem {
  id: number;
  item_id: string;
  name: string;
  category: InventoryCategory;
  category_display: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  status: InventoryStatus;
  status_display: string;
  property_id: string | null;
  property_name: string | null;
  room_name: string | null;
  location: string | null;
  job_id: string | null;
  job_description: string | null;
  pm_id: string | null;
  pm_title: string | null;
  job_ids: string[];
  pm_ids: string[];
  jobs_detail: InventoryJobSummary[];
  preventive_maintenances_detail: InventoryPMSummary[];
  image_url: string | null;
  last_job_by_user: InventoryLastJob | null;
  last_pm_by_user: InventoryLastPM | null;
  created_at: string;
  updated_at: string;
}

export type InventoryListResponse = PaginatedResponse<InventoryListItem> & {
  total_pages: number;
  current_page: number;
  page_size: number;
};

export interface InventoryUsage {
  id: number;
  inventory: number;
  inventory_item_id: string;
  inventory_name: string;
  job: number | null;
  job_id: string | null;
  preventive_maintenance: number | null;
  pm_id: string | null;
  property: number;
  property_id: string;
  property_name: string;
  quantity: number;
  unit_cost: string | null;
  total_cost: string | null;
  source: InventoryUsageSource;
  notes: string | null;
  consumed_by: number | null;
  consumed_by_name: string;
  consumed_at: string;
  created_at: string;
}

export interface InventoryJobDetail extends InventoryJobSummary {
  id: number;
  user_id: number | null;
  technician_name: string;
  updated_at: string;
}

export interface InventoryPMDetail extends InventoryPMSummary {
  id: number;
  assigned_to_id: number | null;
  assigned_to_name: string;
  created_by_id: number | null;
  created_by_name: string;
  updated_at: string;
}

export interface InventoryDetail {
  id: number;
  item_id: string;
  name: string;
  description: string | null;
  category: InventoryCategory;
  category_display: string;
  quantity: number;
  min_quantity: number;
  max_quantity: number | null;
  unit: string;
  unit_price: string | null;
  location: string | null;
  supplier: string | null;
  supplier_contact: string | null;
  status: InventoryStatus;
  status_display: string;
  property: number | null;
  property_id: string | null;
  property_name: string | null;
  room: number | null;
  room_id: string | null;
  room_name: string | null;
  image: string | null;
  image_url: string | null;
  job_ids: string[];
  pm_ids: string[];
  jobs_detail: InventoryJobDetail[];
  preventive_maintenances_detail: InventoryPMDetail[];
  usage_records: InventoryUsage[];
  last_restocked: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  created_by_username: string;
  created_by_name: string;
}

export interface InventoryWritableFields {
  name: string;
  description?: string | null;
  category?: InventoryCategory;
  quantity?: number;
  min_quantity?: number;
  max_quantity?: number | null;
  unit?: string;
  unit_price?: string | null;
  location?: string | null;
  supplier?: string | null;
  supplier_contact?: string | null;
  status?: InventoryStatus;
  property?: number | null;
  room?: number | null;
  image?: File | null;
  last_restocked?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
}

export type InventoryCreatePayload = InventoryWritableFields;
export type InventoryPutPayload = InventoryWritableFields;

export interface InventoryPatchPayload {
  name?: string;
  description?: string | null;
  category?: InventoryCategory;
  quantity?: number;
  min_quantity?: number;
  max_quantity?: number | null;
  unit?: string;
  unit_price?: string | null;
  location?: string | null;
  supplier?: string | null;
  supplier_contact?: string | null;
  status?: InventoryStatus;
  property?: number | null;
  room?: number | null;
  image?: File | null;
  last_restocked?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
}

export interface InventoryQuery {
  property?: number;
  property_id?: string;
  room?: number;
  room_id?: string;
  category?: InventoryCategory;
  status?: InventoryStatus;
  jobs?: number;
  job_id?: string;
  preventive_maintenances?: number;
  pm_id?: string;
  low_stock?: true;
  search?: string;
  ordering?: "name" | "-name" | "quantity" | "-quantity" | "created_at" | "-created_at" | "updated_at" | "-updated_at" | "category" | "-category" | "status" | "-status";
  page?: number;
  page_size?: number;
}

export interface InventoryRestockPayload { quantity: number; }

type InventoryUsageRelation =
  | { job_id: string; pm_id?: never }
  | { pm_id: string; job_id?: never }
  | { job_id?: never; pm_id?: never };

export type InventoryUsePayload = { quantity: number } & InventoryUsageRelation;

export type InventoryConsumePayload = InventoryUsePayload & {
  unit_cost?: string | null;
  notes?: string | null;
  source?: InventoryUsageSource;
};

export interface InventoryConsumeResponse {
  inventory: InventoryDetail;
  usage: InventoryUsage[];
}

export type InventoryUsageResponse = PaginatedResponse<InventoryUsage> & {
  total_pages: number;
  current_page: number;
  page_size: number;
};

export interface InventoryChoice<TValue extends string> {
  value: TValue;
  label: string;
}

export interface InventoryFilterOptions {
  categories: InventoryChoice<InventoryCategory>[];
  statuses: InventoryChoice<InventoryStatus>[];
}

export interface InventoryBulkImportResult {
  created_count: number;
  error_count: number;
  created: Array<{ row: number; item_id: string; name: string }>;
  errors: Array<{ row: number; error: string }>;
}

export interface InventoryBulkImportError { error: string; }

export function isInventoryBulkImportError(value: unknown): value is InventoryBulkImportError {
  return typeof value === "object" && value !== null
    && "error" in value && typeof value.error === "string";
}

export function isInventoryBulkImportResult(value: unknown): value is InventoryBulkImportResult {
  return typeof value === "object" && value !== null
    && "created_count" in value && typeof value.created_count === "number"
    && "error_count" in value && typeof value.error_count === "number"
    && "created" in value && Array.isArray(value.created)
    && "errors" in value && Array.isArray(value.errors);
}
