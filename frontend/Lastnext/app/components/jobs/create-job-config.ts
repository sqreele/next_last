import type React from "react";
import { Wrench, ShieldAlert, CalendarCheck } from "lucide-react";
import type { DictKey } from "@/app/lib/i18n/dictionary";
import type { FormValues } from "./create-job-validation";

export const PRIORITY_OPTIONS = [
  { value: "low", labelKey: "priority.low" },
  { value: "medium", labelKey: "priority.medium" },
  { value: "high", labelKey: "priority.high" },
  { value: "critical", labelKey: "priority.critical" },
] as const satisfies Array<{ value: string; labelKey: DictKey }>;

export const STATUS_OPTIONS = [
  { value: "pending", labelKey: "status.pending" },
  { value: "in_progress", labelKey: "status.inProgress" },
  { value: "waiting_sparepart", labelKey: "status.waitingSparepart" },
  { value: "completed", labelKey: "status.completed" },
  { value: "cancelled", labelKey: "status.cancelled" },
] as const satisfies Array<{ value: string; labelKey: DictKey }>;

export const JOB_TYPES = [
  {
    key: "work_order",
    labelKey: "createJob.type.workOrder",
    descriptionKey: "createJob.type.workOrderDesc",
    icon: Wrench,
  },
  {
    key: "defect",
    labelKey: "createJob.type.defect",
    descriptionKey: "createJob.type.defectDesc",
    icon: ShieldAlert,
  },
  {
    key: "pm",
    labelKey: "createJob.type.pm",
    descriptionKey: "createJob.type.pmDesc",
    icon: CalendarCheck,
  },
] as const satisfies Array<{
  key: string;
  labelKey: DictKey;
  descriptionKey: DictKey;
  icon: React.ElementType;
}>;

export const initialValues: FormValues = {
  description: "",
  status: "pending",
  priority: "medium",
  remarks: "",
  topic: { title: "", description: "" },
  locationType: "location",
  machine_id: "",
  documents: [],
  room: null,
  area_id: null,
  floor: null,
  files: [],
  afterFiles: [],
  beforeImageTokens: [],
  afterImageTokens: [],
  is_defective: false,
  is_preventivemaintenance: false,
  procedure_template: null,
};

export const SECTION_CARD_CLASS =
  "scroll-mt-32 rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5";
export const FORM_SHELL_CLASS =
  "mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden pb-28 text-foreground md:pb-4";
export const FIELD_BASE_CLASS =
  "border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/20";
