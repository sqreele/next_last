export const DASHBOARD_MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type DashboardMonthLabel = (typeof DASHBOARD_MONTH_LABELS)[number];
export type DashboardStatusLabel = "Completed" | "Waiting Sparepart" | "Waiting Fix Defect";

export interface DashboardTrendPoint {
  month: DashboardMonthLabel;
  year: number;
  jobs: number;
}

export interface DashboardPmNonPmPoint {
  month: DashboardMonthLabel;
  year: number;
  pm: number;
  nonPm: number;
}

export interface DashboardStatusPoint {
  month: DashboardMonthLabel;
  year: number;
  status: DashboardStatusLabel;
  count: number;
}

export interface DashboardTopUserPoint {
  month: DashboardMonthLabel;
  year: number;
  user: string;
  pm: number;
  nonPm: number;
}

export interface DashboardTopicPoint {
  month: DashboardMonthLabel;
  year: number;
  topic: string;
  count: number;
  pm: number;
  nonPm: number;
  isPreventive: boolean;
}

export interface DashboardSummaryResponse {
  totalJobs: number;
  pmJobs: number;
  nonPmJobs: number;
  completionRate: number;
  trendByMonth: DashboardTrendPoint[];
  pmNonPmByMonth: DashboardPmNonPmPoint[];
  statusByMonth: DashboardStatusPoint[];
  topUsersByMonth: DashboardTopUserPoint[];
  topicsByMonth: DashboardTopicPoint[];
}

export interface JobDashboardStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  waitingSparepart: number;
  defect: number;
  preventiveMaintenance: number;
}

export interface DashboardSummaryQuery {
  property_id: string;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isDashboardMonthLabel(value: unknown): value is DashboardMonthLabel {
  return typeof value === "string" && DASHBOARD_MONTH_LABELS.some((month) => month === value);
}

function hasPeriod(value: object): value is object & { month: DashboardMonthLabel; year: number } {
  return "month" in value && isDashboardMonthLabel(value.month) &&
    "year" in value && Number.isInteger(value.year);
}

function isTrendPoint(value: unknown): value is DashboardTrendPoint {
  return typeof value === "object" && value !== null && hasPeriod(value) &&
    "jobs" in value && isCount(value.jobs);
}

function isPmNonPmPoint(value: unknown): value is DashboardPmNonPmPoint {
  return typeof value === "object" && value !== null && hasPeriod(value) &&
    "pm" in value && isCount(value.pm) && "nonPm" in value && isCount(value.nonPm);
}

function isStatusPoint(value: unknown): value is DashboardStatusPoint {
  return typeof value === "object" && value !== null && hasPeriod(value) &&
    "status" in value && (value.status === "Completed" || value.status === "Waiting Sparepart" || value.status === "Waiting Fix Defect") &&
    "count" in value && isCount(value.count);
}

function isTopUserPoint(value: unknown): value is DashboardTopUserPoint {
  return typeof value === "object" && value !== null && hasPeriod(value) &&
    "user" in value && typeof value.user === "string" &&
    "pm" in value && isCount(value.pm) && "nonPm" in value && isCount(value.nonPm);
}

function isTopicPoint(value: unknown): value is DashboardTopicPoint {
  return typeof value === "object" && value !== null && hasPeriod(value) &&
    "topic" in value && typeof value.topic === "string" &&
    "count" in value && isCount(value.count) &&
    "pm" in value && isCount(value.pm) && "nonPm" in value && isCount(value.nonPm) &&
    "isPreventive" in value && typeof value.isPreventive === "boolean";
}

export function isDashboardSummaryResponse(value: unknown): value is DashboardSummaryResponse {
  if (typeof value !== "object" || value === null) return false;
  return (
    "totalJobs" in value && isCount(value.totalJobs) &&
    "pmJobs" in value && isCount(value.pmJobs) &&
    "nonPmJobs" in value && isCount(value.nonPmJobs) &&
    "completionRate" in value && isFiniteNumber(value.completionRate) &&
    "trendByMonth" in value && Array.isArray(value.trendByMonth) && value.trendByMonth.every(isTrendPoint) &&
    "pmNonPmByMonth" in value && Array.isArray(value.pmNonPmByMonth) && value.pmNonPmByMonth.every(isPmNonPmPoint) &&
    "statusByMonth" in value && Array.isArray(value.statusByMonth) && value.statusByMonth.every(isStatusPoint) &&
    "topUsersByMonth" in value && Array.isArray(value.topUsersByMonth) && value.topUsersByMonth.every(isTopUserPoint) &&
    "topicsByMonth" in value && Array.isArray(value.topicsByMonth) && value.topicsByMonth.every(isTopicPoint)
  );
}

export function isJobDashboardStats(value: unknown): value is JobDashboardStats {
  if (typeof value !== "object" || value === null) return false;
  return "total" in value && isCount(value.total) &&
    "pending" in value && isCount(value.pending) &&
    "inProgress" in value && isCount(value.inProgress) &&
    "completed" in value && isCount(value.completed) &&
    "cancelled" in value && isCount(value.cancelled) &&
    "waitingSparepart" in value && isCount(value.waitingSparepart) &&
    "defect" in value && isCount(value.defect) &&
    "preventiveMaintenance" in value && isCount(value.preventiveMaintenance);
}

export function dashboardSummaryQueryString(query: DashboardSummaryQuery): string {
  const params = new URLSearchParams();
  params.set("property_id", query.property_id);
  return params.toString();
}
