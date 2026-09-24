/** Shared job-status palette for charts and other non-Tailwind renderers. */
export const JOB_STATUS_CHART_COLORS = {
  pending: "hsl(var(--info))",
  in_progress: "hsl(var(--warning))",
  waiting_sparepart: "#8B5CF6",
  completed: "hsl(var(--success))",
  cancelled: "hsl(var(--destructive))",
} as const;
