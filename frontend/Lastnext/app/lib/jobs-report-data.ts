import type { Job, JobStatus, JobPriority } from './types';
import type { UtilityConsumptionRow } from '../dashboard/utility-consumption/types';
import { getDisplayName } from './utils/display-name';

export type PmFilterType = "all" | "pm" | "non_pm";

/** Stable key for report user filter; `null` = no assignee. */
export function getJobUserKey(user: Job["user"] | undefined | null): string | null {
  if (user === undefined || user === null) return null;
  if (typeof user === "string") {
    const s = user.trim();
    return s.length ? s : null;
  }
  if (typeof user === "number") {
    if (Number.isNaN(user)) return null;
    return String(user);
  }
  if (typeof user === "object") {
    const o = user as { id?: string | number; username?: string };
    if (o.id != null && String(o.id).trim() !== "") {
      return String(o.id).trim();
    }
    if (o.username != null && String(o.username).trim() !== "") {
      return `username:${String(o.username).trim()}`;
    }
  }
  return null;
}

export function getReportUserLabel(
  user: Job["user"] | undefined | null,
  sessionUser:
    | {
        id?: string;
        username?: string;
        first_name?: string | null;
        last_name?: string | null;
      }
    | undefined,
): string {
  if (user === undefined || user === null) return "Unknown Technician";

  if (typeof user === "object" && user && "username" in user) {
    return getDisplayName(user, "Unknown Technician");
  }

  if (typeof user === "string" || typeof user === "number") {
    const userStr = String(user);
    if (sessionUser?.id) {
      const sid = String(sessionUser.id).trim();
      if (userStr === sid || userStr.toLowerCase() === sid.toLowerCase()) {
        const fn = [sessionUser.first_name, sessionUser.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        return getDisplayName(
          { ...sessionUser, full_name: fn },
          "Unknown Technician",
        );
      }
      if (
        userStr.includes("google-oauth2_") &&
        sid.includes("google-oauth2_")
      ) {
        if (
          userStr.replace("google-oauth2_", "") ===
          sid.replace("google-oauth2_", "")
        ) {
          return getDisplayName(sessionUser, "Unknown Technician");
        }
      }
      const un = parseInt(userStr, 10);
      const sn = parseInt(sid, 10);
      if (!Number.isNaN(un) && !Number.isNaN(sn) && un === sn) {
        return getDisplayName(sessionUser, "Unknown Technician");
      }
    }

    return getDisplayName(userStr, "Unknown Technician");
  }

  return "Unknown Technician";
}

export function jobIsPm(job: Job): boolean {
  return job.is_preventivemaintenance === true;
}

/** Rooms linked to a job (each job can count toward multiple rooms). */
export function getJobRoomEntries(
  job: Job,
): Array<{ key: string; displayName: string; roomId: string }> {
  if (job.rooms && job.rooms.length > 0) {
    return job.rooms.map((room) => {
      const id = room.room_id ?? room.name;
      const key = `id:${String(id)}`;
      const displayName =
        (room.name && String(room.name).trim()) ||
        `Room ${room.room_id ?? ""}`.trim() ||
        "Unnamed room";
      return {
        key,
        displayName,
        roomId: room.room_id != null ? String(room.room_id) : "—",
      };
    });
  }
  if (job.room_name && String(job.room_name).trim()) {
    const name = String(job.room_name).trim();
    return [{ key: `name:${name}`, displayName: name, roomId: "—" }];
  }
  return [];
}

/** `all` = any topic; `none` = jobs with no topics; otherwise numeric topic id as string. */
export type TopicFilterValue = "all" | "none" | string;

/** `all` = any user; `none` = no assignee; otherwise key from {@link getJobUserKey}. */
export type UserFilterValue = "all" | "none" | string;

export const DEFAULT_REPORT_TIMEZONE = "Asia/Bangkok";

export function getReportDateParts(value: string, reportTimezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: reportTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value || "";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return { year, month, ymd: `${year}-${month}-${day}` };
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
  search: string,
  reportTimezone: string,
): Job[] {
  return jobs.filter((job) => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (normalizedSearch) {
      const searchable = [
        job.job_id,
        job.description,
        job.remarks,
        job.area?.name,
        job.area_name,
        getDisplayName(job.user, ""),
        ...(job.rooms?.map((room) => room.name) || []),
        ...(job.topics?.map((topic) => topic.title) || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      if (!searchable.includes(normalizedSearch)) return false;
    }
    if (statusFilter !== "all" && job.status !== statusFilter) return false;
    if (priorityFilter !== "all" && job.priority !== priorityFilter)
      return false;
    const isPm = jobIsPm(job);
    if (pmFilter === "pm" && !isPm) return false;
    if (pmFilter === "non_pm" && isPm) return false;

    const userKey = getJobUserKey(job.user);
    if (userFilter === "none") {
      if (userKey !== null) return false;
    } else if (userFilter !== "all") {
      if (userKey !== userFilter) return false;
    }

    const createdDate = getReportDateParts(job.created_at, reportTimezone);
    if (!createdDate) return false;
    if (monthFilter !== "all") {
      if (createdDate.month !== monthFilter.padStart(2, "0")) return false;
    }
    if (yearFilter !== "all") {
      if (createdDate.year !== yearFilter) return false;
    }

    const topics = job.topics;
    const hasTopics = Array.isArray(topics) && topics.length > 0;
    if (topicFilter === "none") {
      if (hasTopics) return false;
    } else if (topicFilter !== "all") {
      const wantId = Number(topicFilter);
      if (Number.isNaN(wantId)) return false;
      if (!topics?.some((t) => Number(t.id) === wantId)) return false;
    }

    if (createdFrom.trim() && createdDate.ymd < createdFrom) return false;
    if (createdTo.trim() && createdDate.ymd > createdTo) return false;
    return true;
  });
}

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

export function buildComparisonSnapshot(jobs: Job[]): ComparisonSnapshot {
  const total = jobs.length;
  const pm = jobs.filter((job) => jobIsPm(job)).length;
  const nonPm = total - pm;
  return { total, pm, nonPm };
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
    const deltaPct =
      row.previous === 0 ? null : Math.round((delta / row.previous) * 100);
    return { ...row, delta, deltaPct };
  });
}

export function buildUtilitySnapshot(
  rows: UtilityConsumptionRow[],
): UtilityMonthSnapshot {
  return rows.reduce(
    (acc, row) => {
      acc.nightsale += Number(row.nightsale) || 0;
      acc.water += Number(row.water) || 0;
      acc.totalkwh += Number(row.totalkwh) || 0;
      return acc;
    },
    { nightsale: 0, water: 0, totalkwh: 0 },
  );
}
