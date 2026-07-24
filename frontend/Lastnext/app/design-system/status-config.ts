import type { LucideIcon } from "lucide-react";
import {
  Ban,
  CheckCircle2,
  CircleDot,
  Clock3,
  PackageSearch,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";

export type StatusTone =
  | "neutral"
  | "info"
  | "progress"
  | "waiting"
  | "success"
  | "danger";

export type StatusConfig = {
  label: string;
  description: string;
  icon: LucideIcon;
  className: string;
  dotClassName: string;
};

export const statusAliases: Readonly<Record<string, string>> = {
  complete: "completed",
  assigned: "pending",
  open: "pending",
  "in progress": "in_progress",
  waiting_spare_part: "waiting_sparepart",
  "waiting spare part": "waiting_sparepart",
  "waiting sparepart": "waiting_sparepart",
  "waiting fix defect": "waiting_fix_defect",
  under_review: "waiting_fix_defect",
  defect: "waiting_fix_defect",
  pm: "preventive_maintenance",
  preventive: "preventive_maintenance",
  "preventive maintenance": "preventive_maintenance",
  fixed: "completed",
};

export const statusConfig = {
  pending: {
    label: "Pending",
    description: "Ready to be assigned or started",
    icon: CircleDot,
    className: "border-info/30 bg-info/10 text-info",
    dotClassName: "bg-info",
  },
  in_progress: {
    label: "In Progress",
    description: "Work is currently underway",
    icon: Wrench,
    className: "border-warning/35 bg-warning/10 text-warning-foreground",
    dotClassName: "bg-warning",
  },
  waiting_sparepart: {
    label: "Waiting for Spare Parts",
    description: "Work is paused until parts arrive",
    icon: PackageSearch,
    className: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200",
    dotClassName: "bg-violet-500",
  },
  completed: {
    label: "Completed",
    description: "Work has been completed",
    icon: CheckCircle2,
    className: "border-success/30 bg-success/10 text-success",
    dotClassName: "bg-success",
  },
  cancelled: {
    label: "Cancelled",
    description: "Work was cancelled",
    icon: Ban,
    className: "border-border bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
  },
  overdue: {
    label: "Overdue",
    description: "Work is past its due date",
    icon: TriangleAlert,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
  verified: {
    label: "Verified",
    description: "Completed work has been verified",
    icon: ShieldCheck,
    className: "border-success/30 bg-success/10 text-success",
    dotClassName: "bg-success",
  },
  waiting_fix_defect: {
    label: "Waiting Fix Defect",
    description: "A reported defect still needs attention",
    icon: Clock3,
    className: "border-warning/35 bg-warning/10 text-warning-foreground",
    dotClassName: "bg-warning",
  },
  waiting_vendor: {
    label: "Waiting for Vendor",
    description: "Work is paused for an external vendor",
    icon: Clock3,
    className: "border-warning/35 bg-warning/10 text-warning-foreground",
    dotClassName: "bg-warning",
  },
  preventive_maintenance: {
    label: "Preventive Maintenance",
    description: "Scheduled preventive work",
    icon: Wrench,
    className: "border-primary/30 bg-primary/10 text-primary",
    dotClassName: "bg-primary",
  },
  scheduled: {
    label: "Scheduled",
    description: "Work is planned for a future time",
    icon: Clock3,
    className: "border-border bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
  },
  rejected: {
    label: "Rejected",
    description: "Work was not approved",
    icon: Ban,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
  urgent: {
    label: "Urgent",
    description: "Immediate attention is required",
    icon: TriangleAlert,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
} as const satisfies Record<string, StatusConfig>;

export type ConfiguredStatus = keyof typeof statusConfig;

export function normalizeStatusValue(status?: string): string {
  const key = (status || "pending").trim().toLowerCase().replace(/[-\s]+/g, "_");
  return statusAliases[key] || statusAliases[key.replace(/_/g, " ")] || key;
}

export function getStatusConfig(status?: string): StatusConfig {
  const normalized = normalizeStatusValue(status);
  return (
    statusConfig[normalized as ConfiguredStatus] ?? {
      label: normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      description: "Current workflow status",
      icon: CircleDot,
      className: "border-border bg-muted text-muted-foreground",
      dotClassName: "bg-muted-foreground",
    }
  );
}

