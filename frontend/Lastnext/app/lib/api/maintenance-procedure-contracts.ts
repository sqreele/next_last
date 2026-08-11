import type { PaginatedResponse } from "../api-contracts";

export type MaintenanceProcedureFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "annual"
  | "custom";

export type MaintenanceProcedureDifficulty =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "expert";

export interface MaintenanceProcedureMachineReference {
  machine_id: string;
  name: string;
  group_id: string | null;
  property_id: number;
}

export interface MaintenanceProcedureListItem {
  id: number;
  name: string;
  group_id: string | null;
  category: string | null;
  frequency: MaintenanceProcedureFrequency;
  estimated_duration: string;
  responsible_department: string | null;
  difficulty_level: MaintenanceProcedureDifficulty;
  schedule_count: number;
  machine_ids: string[];
  machines: MaintenanceProcedureMachineReference[];
  created_at: string;
}

export type MaintenanceProcedureListResponse =
  PaginatedResponse<MaintenanceProcedureListItem> & {
    total_pages: number;
    current_page: number;
    page_size: number;
  };

export interface MaintenanceProcedureDetail {
  id: number;
  name: string;
  group_id: string | null;
  category: string | null;
  description: string;
  frequency: MaintenanceProcedureFrequency;
  estimated_duration: string;
  responsible_department: string | null;
  required_tools: string | null;
  safety_notes: string | null;
  difficulty_level: MaintenanceProcedureDifficulty;
  machine_ids: string[];
  machines: MaintenanceProcedureMachineReference[];
  created_at: string;
  updated_at: string;
}

export interface MaintenanceProcedureCreatePayload {
  name: string;
  description: string;
  group_id?: string | null;
  category?: string | null;
  frequency?: MaintenanceProcedureFrequency;
  estimated_duration?: string;
  responsible_department?: string | null;
  required_tools?: string | null;
  safety_notes?: string | null;
  difficulty_level?: MaintenanceProcedureDifficulty;
}

/** PUT accepts the serializer's writable fields; name and description remain required. */
export interface MaintenanceProcedureUpdatePayload {
  name: string;
  description: string;
  group_id?: string | null;
  category?: string | null;
  frequency?: MaintenanceProcedureFrequency;
  estimated_duration?: string;
  responsible_department?: string | null;
  required_tools?: string | null;
  safety_notes?: string | null;
  difficulty_level?: MaintenanceProcedureDifficulty;
}

/** PATCH is explicitly enabled by DRF ModelViewSet partial_update. */
export interface MaintenanceProcedurePatchPayload {
  name?: string;
  description?: string;
  group_id?: string | null;
  category?: string | null;
  frequency?: MaintenanceProcedureFrequency;
  estimated_duration?: string;
  responsible_department?: string | null;
  required_tools?: string | null;
  safety_notes?: string | null;
  difficulty_level?: MaintenanceProcedureDifficulty;
}

export interface MaintenanceProcedureListQuery {
  page?: number;
  page_size?: number;
  difficulty_level?: MaintenanceProcedureDifficulty;
  created_at?: string;
  search?: string;
  ordering?: "name" | "-name" | "created_at" | "-created_at" | "estimated_duration" | "-estimated_duration";
}
