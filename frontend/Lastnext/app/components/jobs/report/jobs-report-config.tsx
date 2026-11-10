"use client";

import React from "react";

import { Job, TabValue, JobStatus, JobPriority } from "@/app/lib/types";

import { type PmFilterType } from "@/app/lib/jobs-report-data";

export const STATUS_FILTER_OPTIONS: Array<{
  value: JobStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "waiting_sparepart", label: "Waiting spare part" },
];

export const PRIORITY_FILTER_OPTIONS: Array<{
  value: JobPriority | "all";
  label: string;
}> = [
  { value: "all", label: "All priorities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const PM_FILTER_OPTIONS: Array<{ value: PmFilterType; label: string }> = [
  { value: "all", label: "PM + Non-PM" },
  { value: "pm", label: "PM only" },
  { value: "non_pm", label: "Non-PM only" },
];

export const UNASSIGNED_ROOM_KEY = "__unassigned__";

export interface JobsReportProps {
  jobs?: Job[];
  filter?: TabValue;
  onRefresh?: () => void;
}

export interface ReportStatistics {
  total: number;
  pmJobs: number;
  nonPmJobs: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
  waitingSparepart: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  completionRate: number;
  averageResponseTime: number;
  jobsByMonth: Array<{ month: string; count: number }>;
  jobsByStatus: Array<{ status: string; count: number; color: string }>;
}

export interface RoomJobsSummaryRow {
  key: string;
  displayName: string;
  roomId: string;
  jobCount: number;
  pmJobCount: number;
}

export const PRIORITY_COLORS: Record<JobPriority, string> = {
  critical: "#DC2626",
  high: "#F97316",
  medium: "#2563EB",
  low: "#16A34A",
};

export function formatChartCount(v: number | string) {
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return "";
  return String(n);
}

/** Always show digit (including 0) for short bar charts like PM vs non-PM. */
export function formatChartCountWithZero(v: number | string) {
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return "";
  return String(n);
}

export const LABEL_TEXT_STYLE = { fontSize: 11, fontWeight: 600 as const };

/** Inner label on stacked room bar when both PM and non-PM exist (avoids duplicating the total). */
export function RoomsInnerSegmentLabel(
  props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    payload?: { pm?: number; nonPm?: number };
  },
  which: "pm" | "nonPm",
) {
  const { x, y, width, height, payload } = props;
  if (
    x == null ||
    y == null ||
    width == null ||
    height == null ||
    !payload ||
    typeof payload !== "object"
  ) {
    return null;
  }
  const pm = Number(payload.pm) || 0;
  const nonPm = Number(payload.nonPm) || 0;
  if (pm <= 0 || nonPm <= 0) return null;

  const val = which === "pm" ? pm : nonPm;
  if (val <= 0) return null;

  const nx = typeof x === "number" ? x : Number(x);
  const ny = typeof y === "number" ? y : Number(y);
  const nw = typeof width === "number" ? width : Number(width);
  const nh = typeof height === "number" ? height : Number(height);
  if (nw < 16) return null;

  return (
    <text
      x={nx + nw / 2}
      y={ny + nh / 2}
      fill="#ffffff"
      fontSize={10}
      fontWeight={600}
      textAnchor="middle"
      dominantBaseline="middle"
      className="tabular-nums"
      style={{ textShadow: "0 0 2px rgba(0,0,0,0.35)" }}
    >
      {val}
    </text>
  );
}

export const ROOMS_CHART_MAX = 25;

export function truncateRoomLabel(name: string, max = 24): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Total at end of stack: on non-PM segment when it exists, else on PM segment. */
export function RoomsStackEndLabel(
  props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    payload?: { pm?: number; nonPm?: number };
  },
  segment: "pm" | "nonPm",
) {
  const { x, y, width, height, payload } = props;
  if (
    x == null ||
    y == null ||
    width == null ||
    height == null ||
    !payload ||
    typeof payload !== "object"
  ) {
    return null;
  }
  const pm = Number(payload.pm) || 0;
  const nonPm = Number(payload.nonPm) || 0;
  const total = pm + nonPm;
  if (total === 0) return null;
  if (segment === "nonPm" && nonPm === 0) return null;
  if (segment === "pm" && nonPm > 0) return null;

  const nx = typeof x === "number" ? x : Number(x);
  const ny = typeof y === "number" ? y : Number(y);
  const nw = typeof width === "number" ? width : Number(width);
  const nh = typeof height === "number" ? height : Number(height);

  return (
    <text
      x={nx + nw + 8}
      y={ny + nh / 2}
      fill="#111827"
      dominantBaseline="middle"
      className="tabular-nums"
      style={LABEL_TEXT_STYLE}
    >
      {total}
    </text>
  );
}

export const EMPTY_JOBS: Job[] = [];
