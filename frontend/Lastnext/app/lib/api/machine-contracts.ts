import type { PaginatedResponse } from "../api-contracts";
import type { PropertyApiResponse } from "./location-contracts";

export type MachineStatus =
  "active" | "maintenance" | "repair" | "inactive" | "retired";

export type MachineLifecycleState =
  | "active"
  | "under_warranty"
  | "out_of_warranty"
  | "replacement_due"
  | "retired";

/** Full MachineSerializer shape used when a machine is embedded in a PM read. */
export interface MachineEmbedded {
  id: number;
  machine_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  serial_number: string | null;
  description: string | null;
  location: string | null;
  property: number;
  property_name: string;
  status: MachineStatus;
  group_id: string | null;
  installation_date: string | null;
  last_maintenance_date: string | null;
  task_count: number;
  purchase_date: string | null;
  purchase_cost: string | null;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  expected_replacement_date: string | null;
  replacement_cost_estimate: string | null;
  supplier: string | null;
  supplier_contact: string | null;
  asset_tag: string | null;
  lifecycle_notes: string | null;
  lifecycle_state: MachineLifecycleState;
  is_under_warranty: boolean;
  image: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface MachineListItem {
  id: number;
  machine_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  serial_number: string | null;
  status: MachineStatus;
  location: string | null;
  property_name: string;
  task_count: number;
  next_maintenance_date: string | null;
  last_maintenance_date: string | null;
  expected_replacement_date: string | null;
  warranty_end_date: string | null;
  lifecycle_state: MachineLifecycleState;
  is_under_warranty: boolean;
  image_url: string | null;
}

export interface MachineMaintenanceProcedureSummary {
  id: number;
  name: string;
  group_id: string | null;
  category: string | null;
  frequency: string;
  estimated_duration: number | null;
  responsible_department: string | null;
  difficulty_level: string;
  created_at: string | null;
}

/** Machine detail nests a PM list shape owned by the PM API domain. */
export interface MachineDetail<TPreventiveMaintenance> extends Omit<
  MachineEmbedded,
  "property" | "property_name" | "task_count"
> {
  property: PropertyApiResponse;
  preventive_maintenances: TPreventiveMaintenance[];
  maintenance_tasks: never[];
  maintenance_procedures: MachineMaintenanceProcedureSummary[];
  days_since_last_maintenance: number | null;
  next_maintenance_date: string | null;
}

export interface MachineCreatePayload {
  name: string;
  property: number;
  brand?: string | null;
  category?: string | null;
  serial_number?: string | null;
  description?: string | null;
  location?: string | null;
  status?: MachineStatus;
  group_id?: string | null;
  installation_date?: string | null;
  last_maintenance_date?: string | null;
  purchase_date?: string | null;
  purchase_cost?: string | number | null;
  warranty_start_date?: string | null;
  warranty_end_date?: string | null;
  expected_replacement_date?: string | null;
  replacement_cost_estimate?: string | number | null;
  supplier?: string | null;
  supplier_contact?: string | null;
  asset_tag?: string | null;
  lifecycle_notes?: string | null;
  image?: File | null;
}

/** Explicit PATCH shape; PUT uses MachineCreatePayload. */
export interface MachinePatchPayload {
  name?: string;
  property?: number;
  brand?: string | null;
  category?: string | null;
  serial_number?: string | null;
  description?: string | null;
  location?: string | null;
  status?: MachineStatus;
  group_id?: string | null;
  installation_date?: string | null;
  last_maintenance_date?: string | null;
  purchase_date?: string | null;
  purchase_cost?: string | number | null;
  warranty_start_date?: string | null;
  warranty_end_date?: string | null;
  expected_replacement_date?: string | null;
  replacement_cost_estimate?: string | number | null;
  supplier?: string | null;
  supplier_contact?: string | null;
  asset_tag?: string | null;
  lifecycle_notes?: string | null;
  image?: File | null;
}

export interface MachineQuery {
  status?: MachineStatus;
  property?: number;
  property_id?: string;
  location?: string;
  category?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export type MachineListResponse = PaginatedResponse<MachineListItem> & {
  total_pages: number;
  current_page: number;
  page_size: number;
};

export interface MachinePreventiveMaintenanceWritePayload {
  preventive_maintenance_ids: string[];
}
