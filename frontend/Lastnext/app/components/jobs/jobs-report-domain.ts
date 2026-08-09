import { endOfDay, startOfDay } from "date-fns";
import type { UtilityConsumptionRow } from "@/app/dashboard/utility-consumption/types";
import type { Job, JobPriority, JobStatus } from "@/app/lib/types";

export type PmFilterType = "all" | "pm" | "non_pm";
export type TopicFilterValue = "all" | "none" | string;
export type UserFilterValue = "all" | "none" | string;

export interface ComparisonSnapshot {
  total: number;
  pm: number;
  nonPm: number;
}

export interface ComparisonMetric {
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
}

export interface UtilityMonthSnapshot {
  nightsale: number;
  water: number;
  totalkwh: number;
}

export const STATUS_FILTER_OPTIONS: Array<{ value: JobStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "waiting_sparepart", label: "Waiting spare part" },
];

export const PRIORITY_FILTER_OPTIONS: Array<{ value: JobPriority | "all"; label: string }> = [
  { value: "all", label: "All priorities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const PM_FILTER_OPTIONS: Array<{ value: PmFilterType; label: string }> = [
  { value: "all", label: "PM + Non-PM" },
  { value: "pm", label: "PM only" },
  { value: "non_pm", label: "Non-PM only" },
];

export function getJobUserKey(user: Job["user"] | undefined | null): string | null {
  if (user === undefined || user === null) return null;
  if (typeof user === "string") return user.trim() || null;
  if (typeof user === "number") return Number.isNaN(user) ? null : String(user);
  if (typeof user === "object") {
    if (user.id != null && String(user.id).trim() !== "") return String(user.id).trim();
    if (user.username != null && String(user.username).trim() !== "") {
      return `username:${String(user.username).trim()}`;
    }
  }
  return null;
}

export function jobIsPm(job: Job): boolean {
  return job.is_preventivemaintenance === true;
}

export function parseLocalDateYmd(ymd: string): Date | null {
  const parts = ymd.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return null;
  const [year, month, day] = parts;
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

export function filterJobsForReport(
  jobs: Job[],
  statusFilter: JobStatus | "all",
  priorityFilter: JobPriority | "all",
  pmFilter: PmFilterType,
  topicFilter: TopicFilterValue,
  userFilter: UserFilterValue,
  monthFilter: "all" | string,
  yearFilter: "all" | string,
  createdFrom: string,
  createdTo: string,
): Job[] {
  return jobs.filter((job) => {
    if (statusFilter !== "all" && job.status !== statusFilter) return false;
    if (priorityFilter !== "all" && job.priority !== priorityFilter) return false;
    const isPm = jobIsPm(job);
    if (pmFilter === "pm" && !isPm) return false;
    if (pmFilter === "non_pm" && isPm) return false;

    const userKey = getJobUserKey(job.user);
    if (userFilter === "none" ? userKey !== null : userFilter !== "all" && userKey !== userFilter) {
      return false;
    }

    const createdDate = new Date(job.created_at);
    if (monthFilter !== "all") {
      const wantedMonth = Number(monthFilter);
      if (Number.isNaN(wantedMonth) || createdDate.getMonth() + 1 !== wantedMonth) return false;
    }
    if (yearFilter !== "all") {
      const wantedYear = Number(yearFilter);
      if (Number.isNaN(wantedYear) || createdDate.getFullYear() !== wantedYear) return false;
    }

    const topics = job.topics;
    const hasTopics = Array.isArray(topics) && topics.length > 0;
    if (topicFilter === "none" ? hasTopics : topicFilter !== "all" && !topics?.some((topic) => Number(topic.id) === Number(topicFilter))) {
      return false;
    }

    const created = createdDate.getTime();
    if (createdFrom.trim()) {
      const day = parseLocalDateYmd(createdFrom);
      if (day && created < startOfDay(day).getTime()) return false;
    }
    if (createdTo.trim()) {
      const day = parseLocalDateYmd(createdTo);
      if (day && created > endOfDay(day).getTime()) return false;
    }
    return true;
  });
}

export function buildComparisonSnapshot(jobs: Job[]): ComparisonSnapshot {
  const total = jobs.length;
  const pm = jobs.filter(jobIsPm).length;
  return { total, pm, nonPm: total - pm };
}

export function buildComparisonMetrics(
  current: ComparisonSnapshot,
  previous: ComparisonSnapshot,
): ComparisonMetric[] {
  return [
    { label: "Job orders", current: current.total, previous: previous.total },
    { label: "PM jobs", current: current.pm, previous: previous.pm },
    { label: "Non-PM jobs", current: current.nonPm, previous: previous.nonPm },
  ].map((row) => {
    const delta = row.current - row.previous;
    return {
      ...row,
      delta,
      deltaPct: row.previous === 0 ? null : Math.round((delta / row.previous) * 100),
    };
  });
}

export function buildUtilitySnapshot(rows: UtilityConsumptionRow[]): UtilityMonthSnapshot {
  return rows.reduce(
    (snapshot, row) => ({
      nightsale: snapshot.nightsale + (Number(row.nightsale) || 0),
      water: snapshot.water + (Number(row.water) || 0),
      totalkwh: snapshot.totalkwh + (Number(row.totalkwh) || 0),
    }),
    { nightsale: 0, water: 0, totalkwh: 0 },
  );
}
