import type { PaginatedResponse } from "../api-contracts";
import type { MachineEmbedded } from "./machine-contracts";

export type PMFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "annual" | "custom";
export type PMStatus = "pending" | "overdue" | "completed";
export type PMScheduleFilterStatus = "open" | "completed" | "all";
export type PMCalendarStatus = "open" | "completed" | "projected" | "generated";
export type PMOccurrenceType = "scheduled" | "next_due" | "projected" | "generated";

export interface PMTopic {
  id: number;
  title: string;
  description: string | null;
}

export interface PMUserSummary {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  display_name: string;
  is_staff: boolean;
}

export interface PMCreatedBy {
  username: string;
  email: string;
  display_name: string;
}

export interface PMListItem {
  pm_id: string;
  pmtitle: string;
  job_id: string | null;
  job_description: string | null;
  scheduled_date: string;
  completed_date: string | null;
  frequency: PMFrequency;
  next_due_date: string | null;
  status: PMStatus;
  topics: PMTopic[];
  machines: MachineEmbedded[];
  property_id: string[];
  procedure: string | null;
  notes: string | null;
  before_image_url: string | null;
  after_image_url: string | null;
  procedure_template: number | null;
  procedure_template_id: number | null;
  procedure_template_name: string | null;
  master_plan: number | null;
  occurrence_due_date: string | null;
  generated_at: string | null;
  assigned_to_details: PMUserSummary | null;
  created_by_details: PMUserSummary | null;
  assigned_to_name: string | null;
  technician_name: string | null;
  created_by_name: string | null;
}

export type PMListResponse = PaginatedResponse<PMListItem> & {
  total_pages: number;
  current_page: number;
  page_size: number;
};

export interface PMDetail {
  pm_id: string;
  job: number | null;
  pmtitle: string;
  topics: PMTopic[];
  scheduled_date: string;
  completed_date: string | null;
  frequency: PMFrequency;
  custom_days: number | null;
  next_due_date: string | null;
  before_image: string | null;
  after_image: string | null;
  before_image_url: string | null;
  after_image_url: string | null;
  notes: string | null;
  procedure: string | null;
  procedure_template: number | null;
  procedure_template_id: number | null;
  procedure_template_name: string | null;
  created_by: PMCreatedBy | null;
  updated_at: string;
  is_overdue: boolean;
  days_remaining: number | null;
  machines: MachineEmbedded[];
  property_id: string | null;
  assigned_to: number | null;
  assigned_to_details: PMUserSummary | null;
  created_by_details: PMUserSummary | null;
  assigned_to_name: string | null;
  technician_name: string | null;
  created_by_name: string | null;
  master_plan: number | null;
  occurrence_due_date: string | null;
  generated_at: string | null;
}

export interface PMCreatePayload {
  property_id?: string;
  scheduled_date: string;
  frequency: PMFrequency;
  machine_ids: string[];
  pmtitle?: string;
  topic_ids?: number[];
  completed_date?: string | null;
  custom_days?: number | null;
  before_image?: File;
  after_image?: File;
  notes?: string;
  procedure?: string;
  procedure_template?: number | null;
  assigned_to?: number | null;
  remarks?: string;
}

export interface PMUpdatePayload {
  property_id?: string;
  scheduled_date: string;
  frequency: PMFrequency;
  pmtitle?: string;
  machine_ids?: string[];
  topic_ids?: number[];
  completed_date?: string | null;
  custom_days?: number | null;
  before_image?: File;
  after_image?: File;
  notes?: string;
  procedure?: string;
  procedure_template?: number | null;
  assigned_to?: number | null;
  remarks?: string;
}

export interface PMWriteResponse {
  pm_id: string;
  pmtitle: string;
  topics: PMTopic[];
  scheduled_date: string;
  completed_date: string | null;
  frequency: PMFrequency;
  custom_days: number | null;
  next_due_date: string | null;
  before_image: string | null;
  after_image: string | null;
  before_image_url: string | null;
  after_image_url: string | null;
  notes: string | null;
  procedure: string | null;
  procedure_template: number | null;
  procedure_template_id: number | null;
  procedure_template_name: string | null;
  machines: MachineEmbedded[];
  property_id: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  technician_name: string | null;
  remarks: string | null;
}

export interface PMQuery {
  property_id?: string;
  machine_id?: string;
  pm_id?: string;
  status?: PMStatus;
  topic_id?: number;
  frequency?: PMFrequency;
  date_from?: string;
  date_to?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface PMProjectedOccurrence {
  pm_id: string | null;
  plan_id: string;
  pmtitle: string;
  scheduled_date: string;
  completed_date: null;
  next_due_date: string;
  status: PMCalendarStatus;
  frequency: PMFrequency;
  calendar_date: string;
  occurrence_type: PMOccurrenceType;
  calendar_status: PMCalendarStatus;
  generated_pm_id: string | null;
  lead_time_days: number;
  machine_ids: string[];
}

export type PMScheduleActualItem = PMListItem & {
  calendar_date: string;
  occurrence_type: "scheduled" | "next_due";
  calendar_status: "open" | "completed";
};

export type PMScheduleItem = PMScheduleActualItem | PMProjectedOccurrence;

export interface PMScheduleDay {
  date: string;
  weekday: string;
  items: PMScheduleItem[];
  overdue_count: number;
  open_count: number;
  completed_count: number;
}

export interface PMScheduleResponse {
  from: string;
  to: string;
  days: PMScheduleDay[];
  total: number;
  status: PMScheduleFilterStatus;
}

export interface PMCompletionPayload {
  completed_date?: string;
  completion_notes?: string;
  after_image?: File;
}

export interface PMInventoryUsage {
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
  source: string;
  notes: string | null;
  consumed_by: number | null;
  consumed_by_name: string;
  consumed_at: string;
  created_at: string;
}

export interface PMCompletionResponse extends PMDetail {
  inventory_usage: PMInventoryUsage[];
  next_schedule_pm_id?: string;
  next_schedule_scheduled_date?: string;
}
