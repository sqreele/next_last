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
import { JOB_STATUS_CHART_COLORS } from "@/app/design-system/status-colors";

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
  tone: "neutral" | "info" | "warning" | "waiting" | "success" | "danger" | "primary";
  className: string;
  dotClassName: string;
  optionClassName: string;
  buttonClassName: string;
  chartColor: string;
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
    tone: "info",
    className: "border-info/30 bg-info/10 text-info",
    dotClassName: "bg-info",
    optionClassName: "font-semibold text-info focus:bg-info/10",
    buttonClassName: "bg-info text-info-foreground hover:bg-info/90",
    chartColor: JOB_STATUS_CHART_COLORS.pending,
  },
  in_progress: {
    label: "In Progress",
    description: "Work is currently underway",
    icon: Wrench,
    tone: "warning",
    className: "border-warning/35 bg-warning/10 text-warning-emphasis",
    dotClassName: "bg-warning",
    optionClassName: "font-semibold text-warning-emphasis focus:bg-warning/10",
    buttonClassName: "bg-warning text-warning-foreground hover:bg-[hsl(var(--warning-hover))]",
    chartColor: JOB_STATUS_CHART_COLORS.in_progress,
  },
  waiting_sparepart: {
    label: "Waiting for Spare Parts",
    description: "Work is paused until parts arrive",
    icon: PackageSearch,
    tone: "waiting",
    className: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200",
    dotClassName: "bg-violet-500",
    optionClassName: "font-semibold text-violet-800 focus:bg-violet-50 dark:text-violet-200 dark:focus:bg-violet-950",
    buttonClassName: "bg-violet-600 text-white hover:bg-violet-700",
    chartColor: JOB_STATUS_CHART_COLORS.waiting_sparepart,
  },
  completed: {
    label: "Completed",
    description: "Work has been completed",
    icon: CheckCircle2,
    tone: "success",
    className: "border-success/30 bg-success/10 text-success",
    dotClassName: "bg-success",
    optionClassName: "font-semibold text-success focus:bg-success/10",
    buttonClassName: "bg-success text-success-foreground hover:bg-[hsl(var(--success-hover))]",
    chartColor: JOB_STATUS_CHART_COLORS.completed,
  },
  cancelled: {
    label: "Cancelled",
    description: "Work was cancelled",
    icon: Ban,
    tone: "danger",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
    optionClassName: "font-semibold text-destructive focus:bg-destructive/10",
    buttonClassName: "bg-destructive text-destructive-foreground hover:bg-[hsl(var(--destructive-hover))]",
    chartColor: JOB_STATUS_CHART_COLORS.cancelled,
  },
  overdue: {
    label: "Overdue",
    description: "Work is past its due date",
    icon: TriangleAlert,
    tone: "danger",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
    optionClassName: "font-semibold text-destructive focus:bg-destructive/10",
    buttonClassName: "bg-destructive text-destructive-foreground hover:bg-[hsl(var(--destructive-hover))]",
    chartColor: "hsl(var(--destructive))",
  },
  verified: {
    label: "Verified",
    description: "Completed work has been verified",
    icon: ShieldCheck,
    tone: "success",
    className: "border-success/30 bg-success/10 text-success",
    dotClassName: "bg-success",
    optionClassName: "font-semibold text-success focus:bg-success/10",
    buttonClassName: "bg-success text-success-foreground hover:bg-[hsl(var(--success-hover))]",
    chartColor: "hsl(var(--success))",
  },
  waiting_fix_defect: {
    label: "Waiting Fix Defect",
    description: "A reported defect still needs attention",
    icon: Clock3,
    tone: "warning",
    className: "border-warning/35 bg-warning/10 text-warning-emphasis",
    dotClassName: "bg-warning",
    optionClassName: "font-semibold text-warning-emphasis focus:bg-warning/10",
    buttonClassName: "bg-warning text-warning-foreground hover:bg-[hsl(var(--warning-hover))]",
    chartColor: "hsl(var(--warning))",
  },
  waiting_vendor: {
    label: "Waiting for Vendor",
    description: "Work is paused for an external vendor",
    icon: Clock3,
    tone: "warning",
    className: "border-warning/35 bg-warning/10 text-warning-emphasis",
    dotClassName: "bg-warning",
    optionClassName: "font-semibold text-warning-emphasis focus:bg-warning/10",
    buttonClassName: "bg-warning text-warning-foreground hover:bg-[hsl(var(--warning-hover))]",
    chartColor: "hsl(var(--warning))",
  },
  preventive_maintenance: {
    label: "Preventive Maintenance",
    description: "Scheduled preventive work",
    icon: Wrench,
    tone: "primary",
    className: "border-primary/30 bg-primary/10 text-primary",
    dotClassName: "bg-primary",
    optionClassName: "font-semibold text-primary focus:bg-primary/10",
    buttonClassName: "bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]",
    chartColor: "hsl(var(--primary))",
  },
  scheduled: {
    label: "Scheduled",
    description: "Work is planned for a future time",
    icon: Clock3,
    tone: "neutral",
    className: "border-border bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
    optionClassName: "font-semibold text-muted-foreground focus:bg-muted",
    buttonClassName: "bg-muted text-foreground hover:bg-muted/80",
    chartColor: "hsl(var(--muted-foreground))",
  },
  rejected: {
    label: "Rejected",
    description: "Work was not approved",
    icon: Ban,
    tone: "danger",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
    optionClassName: "font-semibold text-destructive focus:bg-destructive/10",
    buttonClassName: "bg-destructive text-destructive-foreground hover:bg-[hsl(var(--destructive-hover))]",
    chartColor: "hsl(var(--destructive))",
  },
  urgent: {
    label: "Urgent",
    description: "Immediate attention is required",
    icon: TriangleAlert,
    tone: "danger",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
    optionClassName: "font-semibold text-destructive focus:bg-destructive/10",
    buttonClassName: "bg-destructive text-destructive-foreground hover:bg-[hsl(var(--destructive-hover))]",
    chartColor: "hsl(var(--destructive))",
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
      tone: "neutral",
      className: "border-border bg-muted text-muted-foreground",
      dotClassName: "bg-muted-foreground",
      optionClassName: "font-semibold text-muted-foreground focus:bg-muted",
      buttonClassName: "bg-muted text-foreground hover:bg-muted/80",
      chartColor: "hsl(var(--muted-foreground))",
    }
  );
}
