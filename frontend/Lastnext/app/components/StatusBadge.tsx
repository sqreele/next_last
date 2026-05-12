import * as React from "react";
import { cn } from "@/app/lib/utils/cn";

type StatusTone =
  | "green"
  | "blue"
  | "indigo"
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
  pending: { label: "Pending", tone: "blue" },
  in_progress: { label: "In Progress", tone: "indigo" },
  waiting_sparepart: { label: "Waiting Sparepart", tone: "orange" },
  waiting_vendor: { label: "Waiting Vendor", tone: "orange" },
  waiting_fix_defect: { label: "Waiting Fix Defect", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "red" },
  rejected: { label: "Rejected", tone: "red" },
  overdue: { label: "Overdue", tone: "red" },
};

const toneClasses: Record<StatusTone, string> = {
  green: "border-emerald-300 bg-emerald-100 text-emerald-900",
  blue: "border-blue-300 bg-blue-100 text-blue-900",
  indigo: "border-indigo-300 bg-indigo-100 text-indigo-900",
  amber: "border-amber-300 bg-amber-100 text-amber-900",
  orange: "border-orange-300 bg-orange-100 text-orange-900",
  purple: "border-purple-300 bg-purple-100 text-purple-900",
  red: "border-red-300 bg-red-100 text-red-900",
  gray: "border-slate-300 bg-slate-100 text-slate-800",
};

const dotClasses: Record<StatusTone, string> = {
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
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
