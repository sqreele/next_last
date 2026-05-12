import * as React from "react";
import { cn } from "@/app/lib/utils/cn";

type StatusTone =
  | "green"
  | "blue"
  | "amber"
  | "orange"
  | "purple"
  | "red"
  | "gray";

type StatusBadgeConfig = {
  label: string;
  tone: StatusTone;
};

const statusAliases: Record<string, string> = {
  complete: "completed",
  pending: "pending",
  assigned: "open",
  "in progress": "in_progress",
  waiting_sparepart: "waiting_sparepart",
  waiting_spare_part: "waiting_sparepart",
  "waiting spare part": "waiting_sparepart",
  "waiting sparepart": "waiting_sparepart",
  "waiting fix defect": "waiting_fix_defect",
  under_review: "waiting_fix_defect",
  defect: "waiting_fix_defect",
  fixed: "completed",
  rejected: "rejected",
};

const statusConfig: Record<string, StatusBadgeConfig> = {
  completed: { label: "Completed", tone: "green" },
  verified: { label: "Verified", tone: "green" },
  open: { label: "Open", tone: "blue" },
  scheduled: { label: "Scheduled", tone: "gray" },
  pending: { label: "Pending", tone: "gray" },
  in_progress: { label: "In Progress", tone: "blue" },
  waiting_sparepart: { label: "Waiting Sparepart", tone: "orange" },
  waiting_vendor: { label: "Waiting Vendor", tone: "orange" },
  waiting_fix_defect: { label: "Waiting Fix Defect", tone: "red" },
  cancelled: { label: "Cancelled", tone: "red" },
  rejected: { label: "Rejected", tone: "red" },
  overdue: { label: "Overdue", tone: "red" },
};

const toneClasses: Record<StatusTone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
  purple: "border-purple-200 bg-purple-50 text-purple-800",
  red: "border-red-200 bg-red-50 text-red-800",
  gray: "border-slate-200 bg-slate-50 text-slate-700",
};

const dotClasses: Record<StatusTone, string> = {
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};

export function normalizeStatus(status?: string) {
  const key = (status || "open")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  return statusAliases[key] || statusAliases[key.replace(/_/g, " ")] || key;
}

export function humanize(value?: string) {
  if (!value) return "Unassigned";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getStatusBadgeConfig(status?: string): StatusBadgeConfig {
  const normalized = normalizeStatus(status);
  return (
    statusConfig[normalized] || { label: humanize(normalized), tone: "gray" }
  );
}

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: string;
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const normalized = normalizeStatus(status);
  const config = getStatusBadgeConfig(status);

  return (
    <span
      className={cn(
        "inline-flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold leading-snug shadow-sm sm:min-h-9 sm:px-3 sm:text-sm",
        "whitespace-normal break-words text-left align-middle",
        toneClasses[config.tone],
        `pcms-status-badge--${normalized}`,
        className,
      )}
      title={config.label}
      {...props}
    >
      <span
        className={cn(
          "h-2 w-2 flex-none rounded-full",
          dotClasses[config.tone],
        )}
        aria-hidden="true"
      />
      <span className="min-w-0">{config.label}</span>
    </span>
  );
}
