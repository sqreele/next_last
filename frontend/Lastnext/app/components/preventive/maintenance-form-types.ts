import type { FrequencyType } from "@/app/lib/preventiveMaintenanceModels";

export interface FormValues {
  pmtitle: string;
  scheduled_date: string;
  completed_date: string;
  frequency: FrequencyType;
  custom_days: number | "" | null;
  status: string;
  notes: string;
  before_image_file: File | null;
  after_image_file: File | null;
  selected_topics: number[];
  selected_machine_ids: string[];
  property_id: string | null;
  procedure: string;
  procedure_template: number | ""; // Maintenance task template ID (empty string for "none")
  assigned_to: string;
  create_master_plan: boolean;
  lead_time_days: number;
}

export type MaintenanceTaskOption = {
  id: number;
  name: string;
  group_id?: string | null;
  category?: string;
  frequency: string;
  difficulty_level: string;
  responsible_department?: string;
  custom_days?: number | null;
  machine_ids?: string[];
  machines?: Array<{
    machine_id: string;
    name?: string | null;
    group_id?: string | null;
    property_id?: string | number | null;
  }>;
};

export const normalizeGroupId = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};
