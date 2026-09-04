"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { PageLoader } from "@/app/components/ui/loading";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  FileText,
  Building2,
  Building,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Settings,
  FileSpreadsheet,
  Wrench,
  ClipboardList,
  Search,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useMainStore,
  useProperties,
  useUser,
} from "@/app/lib/stores/mainStore";
import { useSession } from "@/app/lib/session.client";
import {
  Job,
  TabValue,
  JobStatus,
  JobPriority,
  STATUS_COLORS,
} from "@/app/lib/types";
import { fetchAllJobsForPropertyWithSession } from "@/app/lib/api-client";
import { format } from "date-fns";
import { exportJobsToExcel } from "@/app/lib/utils/excel-export";
import { exportJobsReportToPdf } from "@/app/lib/utils/pdf-export";
import { getDisplayName } from "@/app/lib/utils/display-name";
import type { UtilityConsumptionRow } from "@/app/dashboard/utility-consumption/types";
import {
  assertJobsReportPropertyBoundary,
  buildJobsReportCsvUrl,
  canExportJobsReport,
  getCsvFilename,
  getJobsReportDetailHref,
  isCurrentJobsReportRequest,
  type JobsReportFilters,
} from "@/app/lib/jobs-report.mjs";

const STATUS_FILTER_OPTIONS: Array<{
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

const PRIORITY_FILTER_OPTIONS: Array<{
  value: JobPriority | "all";
  label: string;
}> = [
  { value: "all", label: "All priorities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

type PmFilterType = "all" | "pm" | "non_pm";

const PM_FILTER_OPTIONS: Array<{ value: PmFilterType; label: string }> = [
  { value: "all", label: "PM + Non-PM" },
  { value: "pm", label: "PM only" },
  { value: "non_pm", label: "Non-PM only" },
];

const UNASSIGNED_ROOM_KEY = "__unassigned__";

/** Stable key for report user filter; `null` = no assignee. */
function getJobUserKey(user: Job["user"] | undefined | null): string | null {
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

function getReportUserLabel(
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

function jobIsPm(job: Job): boolean {
  return job.is_preventivemaintenance === true;
}

/** Rooms linked to a job (each job can count toward multiple rooms). */
function getJobRoomEntries(
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
type TopicFilterValue = "all" | "none" | string;

/** `all` = any user; `none` = no assignee; otherwise key from {@link getJobUserKey}. */
type UserFilterValue = "all" | "none" | string;

const DEFAULT_REPORT_TIMEZONE = "Asia/Bangkok";

function getReportDateParts(value: string, reportTimezone: string) {
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

function filterJobsForReport(
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

interface JobsReportProps {
  jobs?: Job[];
  filter?: TabValue;
  onRefresh?: () => void;
}

interface ReportStatistics {
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

interface RoomJobsSummaryRow {
  key: string;
  displayName: string;
  roomId: string;
  jobCount: number;
  pmJobCount: number;
}

interface ComparisonSnapshot {
  total: number;
  pm: number;
  nonPm: number;
}

interface ComparisonMetric {
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
}

interface UtilityMonthSnapshot {
  nightsale: number;
  water: number;
  totalkwh: number;
}

const PRIORITY_COLORS: Record<JobPriority, string> = {
  high: "#F97316",
  medium: "#2563EB",
  low: "#16A34A",
};

function formatChartCount(v: number | string) {
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return "";
  return String(n);
}

/** Always show digit (including 0) for short bar charts like PM vs non-PM. */
function formatChartCountWithZero(v: number | string) {
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return "";
  return String(n);
}

const LABEL_TEXT_STYLE = { fontSize: 11, fontWeight: 600 as const };

function buildComparisonSnapshot(jobs: Job[]): ComparisonSnapshot {
  const total = jobs.length;
  const pm = jobs.filter((job) => jobIsPm(job)).length;
  const nonPm = total - pm;
  return { total, pm, nonPm };
}

function buildComparisonMetrics(
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

function buildUtilitySnapshot(
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

/** Inner label on stacked room bar when both PM and non-PM exist (avoids duplicating the total). */
function RoomsInnerSegmentLabel(
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

const ROOMS_CHART_MAX = 25;

function truncateRoomLabel(name: string, max = 24): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Total at end of stack: on non-PM segment when it exists, else on PM segment. */
function RoomsStackEndLabel(
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

const EMPTY_JOBS: Job[] = [];

export default function JobsReport({
  jobs = EMPTY_JOBS,
  filter = "all",
}: JobsReportProps) {
  const { data: session, status: sessionStatus } = useSession();
  const { selectedPropertyId: selectedProperty } = useUser();
  const { properties: userProperties } = useProperties();

  const [isGeneratingCsv, setIsGeneratingCsv] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [reportJobs, setReportJobs] = useState<Job[]>([]);
  const [loadedPropertyId, setLoadedPropertyId] = useState<string | null>(null);
  const [utilityRows, setUtilityRows] = useState<UtilityConsumptionRow[]>([]);
  const [utilityLoading, setUtilityLoading] = useState(false);
  const [utilityError, setUtilityError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<JobPriority | "all">(
    "all",
  );
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [pmFilter, setPmFilter] = useState<PmFilterType>("all");
  const [topicFilter, setTopicFilter] = useState<TopicFilterValue>("all");
  const [userFilter, setUserFilter] = useState<UserFilterValue>("all");
  const [monthFilter, setMonthFilter] = useState<"all" | string>("all");
  const [yearFilter, setYearFilter] = useState<"all" | string>("all");
  const reportRequestIdRef = useRef(0);
  const reportControllerRef = useRef<AbortController | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const exportInFlightRef = useRef(false);
  const currentProperty = useMemo(() => {
    if (!selectedProperty) return null;
    return (
      userProperties.find((p) => p.property_id === selectedProperty) || null
    );
  }, [selectedProperty, userProperties]);
  const reportTimezone = currentProperty?.timezone || DEFAULT_REPORT_TIMEZONE;
  const visibleReportJobs = useMemo(
    () => (loadedPropertyId === selectedProperty ? reportJobs : []),
    [loadedPropertyId, reportJobs, selectedProperty],
  );

  const topicFilterOptions = useMemo(() => {
    const byId = new Map<number, { id: number; title: string }>();
    visibleReportJobs.forEach((job) => {
      job.topics?.forEach((t) => {
        if (t == null || t.id == null) return;
        const id = Number(t.id);
        if (Number.isNaN(id)) return;
        const title = (t.title && String(t.title).trim()) || `Topic ${id}`;
        if (!byId.has(id)) byId.set(id, { id, title });
      });
    });
    return Array.from(byId.values()).sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
  }, [visibleReportJobs]);

  const jobsWithNoTopicCount = useMemo(
    () => visibleReportJobs.filter((j) => !j.topics?.length).length,
    [visibleReportJobs],
  );

  const jobsWithNoUserCount = useMemo(
    () => visibleReportJobs.filter((j) => getJobUserKey(j.user) === null).length,
    [visibleReportJobs],
  );

  const userFilterOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    visibleReportJobs.forEach((job) => {
      const key = getJobUserKey(job.user);
      if (!key || byKey.has(key)) return;
      byKey.set(
        key,
        getReportUserLabel(job.user, session?.user),
      );
    });
    return Array.from(byKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
      );
  }, [visibleReportJobs, session?.user]);

  const stableProvidedJobs = jobs;

  const filteredReportJobs = useMemo(
    () =>
      filterJobsForReport(
        visibleReportJobs,
        statusFilter,
        priorityFilter,
        pmFilter,
        topicFilter,
        userFilter,
        monthFilter,
        yearFilter,
        createdFrom,
        createdTo,
        searchFilter,
        reportTimezone,
      ),
    [
      visibleReportJobs,
      statusFilter,
      priorityFilter,
      pmFilter,
      topicFilter,
      userFilter,
      monthFilter,
      yearFilter,
      createdFrom,
      createdTo,
      searchFilter,
      reportTimezone,
    ],
  );

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filteredReportJobs.length / pageSize));
  const paginatedReportJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReportJobs.slice(start, start + pageSize);
  }, [currentPage, filteredReportJobs]);

  const dateRangeInvalid = Boolean(
    createdFrom && createdTo && createdFrom > createdTo,
  );

  const activeFilters: JobsReportFilters = {
    status: statusFilter,
    priority: priorityFilter,
    pm: pmFilter,
    topic: topicFilter,
    user: userFilter,
    month: monthFilter,
    year: yearFilter,
    createdFrom,
    createdTo,
    search: searchFilter,
  };

  const yearFilterOptions = useMemo(() => {
    const years = new Set<number>();
    visibleReportJobs.forEach((job) => {
      const date = getReportDateParts(job.created_at, reportTimezone);
      if (date) years.add(Number(date.year));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [reportTimezone, visibleReportJobs]);

  const monthFilterOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1),
        label: format(new Date(2020, i, 1), "MMMM"),
      })),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadUtilityRows() {
      if (!selectedProperty) {
        setUtilityRows([]);
        setUtilityError(null);
        setUtilityLoading(false);
        return;
      }
      try {
        setUtilityLoading(true);
        setUtilityError(null);
        const params = new URLSearchParams();
        params.set("property_id", String(selectedProperty));
        params.set("page_size", "1000");
        const res = await fetch(
          `/api/utility/consumption?${params.toString()}`,
          {
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          throw new Error("Unable to load utility consumption for comparison.");
        }
        const payload: UtilityConsumptionRow[] = await res.json();
        if (
          !controller.signal.aborted &&
          useMainStore.getState().selectedPropertyId === selectedProperty
        ) {
          setUtilityRows(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setUtilityRows([]);
        setUtilityError(
          error instanceof Error
            ? error.message
            : "Unable to load utility consumption.",
        );
      } finally {
        if (!controller.signal.aborted) setUtilityLoading(false);
      }
    }

    loadUtilityRows();
    return () => controller.abort();
  }, [selectedProperty]);

  useEffect(() => {
    if (topicFilter === "none" && jobsWithNoTopicCount === 0) {
      setTopicFilter("all");
      return;
    }
    if (topicFilter === "all" || topicFilter === "none") return;
    const ok = topicFilterOptions.some((t) => String(t.id) === topicFilter);
    if (!ok) setTopicFilter("all");
  }, [topicFilter, topicFilterOptions, jobsWithNoTopicCount]);

  useEffect(() => {
    if (userFilter === "none" && jobsWithNoUserCount === 0) {
      setUserFilter("all");
      return;
    }
    if (userFilter === "all" || userFilter === "none") return;
    const ok = userFilterOptions.some((u) => u.key === userFilter);
    if (!ok) setUserFilter("all");
  }, [userFilter, userFilterOptions, jobsWithNoUserCount]);

  const roomsJobsSummary = useMemo((): RoomJobsSummaryRow[] => {
    const map = new Map<
      string,
      {
        displayName: string;
        roomId: string;
        jobCount: number;
        pmJobCount: number;
      }
    >();

    filteredReportJobs.forEach((job) => {
      const isPm = jobIsPm(job);
      const entries = getJobRoomEntries(job);
      if (entries.length === 0) {
        const cur = map.get(UNASSIGNED_ROOM_KEY) ?? {
          displayName: "No room linked",
          roomId: "—",
          jobCount: 0,
          pmJobCount: 0,
        };
        cur.jobCount += 1;
        if (isPm) cur.pmJobCount += 1;
        map.set(UNASSIGNED_ROOM_KEY, cur);
        return;
      }
      entries.forEach((r) => {
        const cur = map.get(r.key) ?? {
          displayName: r.displayName,
          roomId: r.roomId,
          jobCount: 0,
          pmJobCount: 0,
        };
        cur.jobCount += 1;
        if (isPm) cur.pmJobCount += 1;
        if (r.displayName) cur.displayName = r.displayName;
        if (r.roomId !== "—") cur.roomId = r.roomId;
        map.set(r.key, cur);
      });
    });

    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        displayName: v.displayName,
        roomId: v.roomId,
        jobCount: v.jobCount,
        pmJobCount: v.pmJobCount,
      }))
      .sort((a, b) => b.jobCount - a.jobCount);
  }, [filteredReportJobs]);

  /** Top rooms, reversed so highest count appears at top of horizontal bar chart. */
  const roomsChartData = useMemo(() => {
    const top = roomsJobsSummary.slice(0, ROOMS_CHART_MAX);
    return [...top].reverse().map((r) => {
      const pm = r.pmJobCount;
      const nonPm = Math.max(0, r.jobCount - pm);
      return {
        label: truncateRoomLabel(r.displayName),
        fullLabel: r.displayName,
        roomId: r.roomId,
        pm,
        nonPm,
        total: r.jobCount,
      };
    });
  }, [roomsJobsSummary]);

  const roomsChartHeight = useMemo(
    () => Math.min(720, 56 + Math.max(roomsChartData.length, 1) * 36),
    [roomsChartData.length],
  );

  /** Chronological month buckets for charts (statistics.jobsByMonth order is not sorted). */
  const jobsByMonthChart = useMemo(() => {
    const map = new Map<
      string,
      { sortKey: string; label: string; count: number }
    >();
    filteredReportJobs.forEach((job) => {
      const d = new Date(job.created_at);
      const sortKey = format(d, "yyyy-MM");
      const label = format(d, "MMM yyyy");
      const cur = map.get(sortKey);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(sortKey, { sortKey, label, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey),
    );
  }, [filteredReportJobs]);

  const jobsAndNightSaleByMonthChart = useMemo(() => {
    const monthMap = new Map<
      string,
      { sortKey: string; label: string; jobs: number; nightSale: number }
    >();

    jobsByMonthChart.forEach((monthRow) => {
      monthMap.set(monthRow.sortKey, {
        sortKey: monthRow.sortKey,
        label: monthRow.label,
        jobs: monthRow.count,
        nightSale: 0,
      });
    });

    utilityRows.forEach((row) => {
      const monthDate = new Date(`${row.month} 1, ${row.year}`);
      if (Number.isNaN(monthDate.getTime())) return;

      const sortKey = format(monthDate, "yyyy-MM");
      const existing = monthMap.get(sortKey);
      if (existing) {
        existing.nightSale += Number(row.nightsale) || 0;
        return;
      }

      monthMap.set(sortKey, {
        sortKey,
        label: format(monthDate, "MMM yyyy"),
        jobs: 0,
        nightSale: Number(row.nightsale) || 0,
      });
    });

    const sorted = Array.from(monthMap.values()).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey),
    );
    const bySortKey = new Map(sorted.map((row) => [row.sortKey, row]));

    return sorted.map((row) => {
      const [yearStr, monthStr] = row.sortKey.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const prevYearKey = `${year - 1}-${String(month).padStart(2, "0")}`;
      const prevYearRow = bySortKey.get(prevYearKey);
      const jobsYoyPct =
        prevYearRow && prevYearRow.jobs !== 0
          ? ((row.jobs - prevYearRow.jobs) / prevYearRow.jobs) * 100
          : null;
      const nightSaleYoyPct =
        prevYearRow && prevYearRow.nightSale !== 0
          ? ((row.nightSale - prevYearRow.nightSale) / prevYearRow.nightSale) *
            100
          : null;
      return {
        ...row,
        jobsYoyPct,
        nightSaleYoyPct,
      };
    });
  }, [jobsByMonthChart, utilityRows]);

  const monthlyAndYearlyComparisons = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const previousYear = currentYear - 1;

    const inMonth = (date: Date, year: number, month: number) =>
      date.getFullYear() === year && date.getMonth() === month;

    const currentMonthJobs = filteredReportJobs.filter((job) =>
      inMonth(new Date(job.created_at), currentYear, currentMonth),
    );
    const previousMonthJobs = filteredReportJobs.filter((job) =>
      inMonth(
        new Date(job.created_at),
        previousMonthDate.getFullYear(),
        previousMonthDate.getMonth(),
      ),
    );
    const sameMonthLastYearJobs = filteredReportJobs.filter((job) =>
      inMonth(new Date(job.created_at), previousYear, currentMonth),
    );
    const currentMonthUtilityRows = utilityRows.filter(
      (row) =>
        row.year === currentYear &&
        new Date(`${row.month} 1, ${row.year}`).getMonth() === currentMonth,
    );
    const previousMonthUtilityRows = utilityRows.filter(
      (row) =>
        row.year === previousMonthDate.getFullYear() &&
        new Date(`${row.month} 1, ${row.year}`).getMonth() ===
          previousMonthDate.getMonth(),
    );
    const sameMonthLastYearUtilityRows = utilityRows.filter(
      (row) =>
        row.year === previousYear &&
        new Date(`${row.month} 1, ${row.year}`).getMonth() === currentMonth,
    );

    const monthLabel = format(
      new Date(currentYear, currentMonth, 1),
      "MMMM yyyy",
    );
    const previousMonthLabel = format(previousMonthDate, "MMMM yyyy");
    const sameMonthLastYearLabel = format(
      new Date(previousYear, currentMonth, 1),
      "MMMM yyyy",
    );

    const currentSnapshot = buildComparisonSnapshot(currentMonthJobs);
    const previousMonthSnapshot = buildComparisonSnapshot(previousMonthJobs);
    const previousYearSnapshot = buildComparisonSnapshot(sameMonthLastYearJobs);
    const utilityCurrent = buildUtilitySnapshot(currentMonthUtilityRows);
    const utilityPreviousMonth = buildUtilitySnapshot(previousMonthUtilityRows);
    const utilityPreviousYear = buildUtilitySnapshot(
      sameMonthLastYearUtilityRows,
    );
    const safeRatio = (num: number, den: number) => (den > 0 ? num / den : 0);

    return {
      monthLabel,
      previousMonthLabel,
      sameMonthLastYearLabel,
      monthOverMonth: buildComparisonMetrics(
        currentSnapshot,
        previousMonthSnapshot,
      ),
      yearOverYear: buildComparisonMetrics(
        currentSnapshot,
        previousYearSnapshot,
      ),
      utility: {
        currentNightSale: utilityCurrent.nightsale,
        previousMonthNightSale: utilityPreviousMonth.nightsale,
        sameMonthLastYearNightSale: utilityPreviousYear.nightsale,
        monthOverMonthNightSale:
          utilityCurrent.nightsale - utilityPreviousMonth.nightsale,
        yearOverYearNightSale:
          utilityCurrent.nightsale - utilityPreviousYear.nightsale,
        nightSalePerJobOrder: safeRatio(
          utilityCurrent.nightsale,
          currentSnapshot.total,
        ),
        previousMonthNightSalePerJobOrder: safeRatio(
          utilityPreviousMonth.nightsale,
          previousMonthSnapshot.total,
        ),
        sameMonthLastYearNightSalePerJobOrder: safeRatio(
          utilityPreviousYear.nightsale,
          previousYearSnapshot.total,
        ),
        monthOverMonthNightSalePerJobOrder:
          safeRatio(utilityCurrent.nightsale, currentSnapshot.total) -
          safeRatio(
            utilityPreviousMonth.nightsale,
            previousMonthSnapshot.total,
          ),
        yearOverYearNightSalePerJobOrder:
          safeRatio(utilityCurrent.nightsale, currentSnapshot.total) -
          safeRatio(utilityPreviousYear.nightsale, previousYearSnapshot.total),
        nightSalePerPmJob: safeRatio(
          utilityCurrent.nightsale,
          currentSnapshot.pm,
        ),
      },
    };
  }, [filteredReportJobs, utilityRows]);

  // Calculate comprehensive statistics (respects export filters)
  const statistics: ReportStatistics = useMemo(() => {
    const total = filteredReportJobs.length;
    const pmJobs = filteredReportJobs.filter((job) => jobIsPm(job)).length;
    const nonPmJobs = total - pmJobs;
    const completed = filteredReportJobs.filter(
      (job) => job.status === "completed",
    ).length;
    const inProgress = filteredReportJobs.filter(
      (job) => job.status === "in_progress",
    ).length;
    const pending = filteredReportJobs.filter(
      (job) => job.status === "pending",
    ).length;
    const cancelled = filteredReportJobs.filter(
      (job) => job.status === "cancelled",
    ).length;
    const waitingSparepart = filteredReportJobs.filter(
      (job) => job.status === "waiting_sparepart",
    ).length;
    const highPriority = filteredReportJobs.filter(
      (job) => job.priority === "high",
    ).length;
    const mediumPriority = filteredReportJobs.filter(
      (job) => job.priority === "medium",
    ).length;
    const lowPriority = filteredReportJobs.filter(
      (job) => job.priority === "low",
    ).length;

    const completionRate =
      total > 0 ? Math.round((completed / total) * 100) : 0;

    // Calculate average response time
    const completedJobDates = filteredReportJobs
      .filter((job) => job.status === "completed" && job.completed_at)
      .map(
        (job) =>
          new Date(job.completed_at!).getTime() -
          new Date(job.created_at).getTime(),
      );

    const averageResponseTime =
      completedJobDates.length > 0
        ? Math.round(
            completedJobDates.reduce((sum, time) => sum + time, 0) /
              completedJobDates.length /
              (1000 * 60 * 60 * 24),
          )
        : 0;

    // Group jobs by month
    const jobsByMonth = filteredReportJobs.reduce(
      (acc, job) => {
        const month = format(new Date(job.created_at), "MMM yyyy");
        const existing = acc.find((item) => item.month === month);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ month, count: 1 });
        }
        return acc;
      },
      [] as Array<{ month: string; count: number }>,
    );

    // Jobs by status
    const jobsByStatus = [
      { status: "Completed", count: completed, color: STATUS_COLORS.completed },
      {
        status: "In Progress",
        count: inProgress,
        color: STATUS_COLORS.in_progress,
      },
      { status: "Pending", count: pending, color: STATUS_COLORS.pending },
      { status: "Cancelled", count: cancelled, color: STATUS_COLORS.cancelled },
      {
        status: "Waiting Parts",
        count: waitingSparepart,
        color: STATUS_COLORS.waiting_sparepart,
      },
    ];

    return {
      total,
      pmJobs,
      nonPmJobs,
      completed,
      inProgress,
      pending,
      cancelled,
      waitingSparepart,
      highPriority,
      mediumPriority,
      lowPriority,
      completionRate,
      averageResponseTime,
      jobsByMonth,
      jobsByStatus,
    };
  }, [filteredReportJobs]);

  const pmVsNonPmChartRows = useMemo(
    () => [
      { name: "PM", value: statistics.pmJobs, fill: "#7c3aed" },
      { name: "Non-PM", value: statistics.nonPmJobs, fill: "#0ea5e9" },
    ],
    [statistics.pmJobs, statistics.nonPmJobs],
  );

  const priorityChartRows = useMemo(
    () => [
      {
        name: "High",
        value: statistics.highPriority,
        fill: PRIORITY_COLORS.high,
      },
      {
        name: "Medium",
        value: statistics.mediumPriority,
        fill: PRIORITY_COLORS.medium,
      },
      { name: "Low", value: statistics.lowPriority, fill: PRIORITY_COLORS.low },
    ],
    [
      statistics.highPriority,
      statistics.mediumPriority,
      statistics.lowPriority,
    ],
  );

  useEffect(() => {
    reportControllerRef.current?.abort();
    exportControllerRef.current?.abort();
    reportRequestIdRef.current += 1;
    setReportJobs([]);
    setLoadedPropertyId(null);
    setReportError(null);
    setExportError(null);
    setCurrentPage(1);
    setSearchFilter("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setPmFilter("all");
    setTopicFilter("all");
    setUserFilter("all");
    setMonthFilter("all");
    setYearFilter("all");
    setCreatedFrom("");
    setCreatedTo("");
  }, [selectedProperty]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    statusFilter,
    priorityFilter,
    pmFilter,
    topicFilter,
    userFilter,
    monthFilter,
    yearFilter,
    createdFrom,
    createdTo,
    searchFilter,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Load the complete authorized Property projection once for analytics.
  useEffect(() => {
    if (!selectedProperty || sessionStatus === "loading") return;
    if (!session?.user) {
      setLoading(false);
      setReportError("Authentication is required to load this report.");
      return;
    }

    const requestPropertyId = selectedProperty;
    const requestId = ++reportRequestIdRef.current;
    const controller = new AbortController();
    reportControllerRef.current?.abort();
    reportControllerRef.current = controller;
    setReportJobs([]);
    setLoadedPropertyId(null);
    setReportError(null);
    setLoading(true);

    const loadPropertyJobs = async () => {
      try {
        const propertyJobs =
          stableProvidedJobs.length > 0
            ? stableProvidedJobs
            : await fetchAllJobsForPropertyWithSession<Job>(
                requestPropertyId,
                controller.signal,
              );
        const scopedJobs = assertJobsReportPropertyBoundary(
          propertyJobs,
          requestPropertyId,
        );
        const isCurrent = isCurrentJobsReportRequest({
          requestId,
          currentRequestId: reportRequestIdRef.current,
          requestPropertyId,
          currentPropertyId: useMainStore.getState().selectedPropertyId,
        });
        if (!controller.signal.aborted && isCurrent) {
          setReportJobs(scopedJobs);
          setLoadedPropertyId(requestPropertyId);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (requestId !== reportRequestIdRef.current) return;
        setReportJobs([]);
        setLoadedPropertyId(null);
        setReportError(
          error instanceof Error ? error.message : "Unable to load report.",
        );
      } finally {
        if (!controller.signal.aborted && requestId === reportRequestIdRef.current) {
          setLoading(false);
        }
      }
    };

    void loadPropertyJobs();
    return () => controller.abort();
  }, [
    reloadKey,
    selectedProperty,
    sessionStatus,
    stableProvidedJobs,
    session?.user,
  ]);

  // Shared filename + filter-description helpers used by all exports.
  const buildExportFilename = (extension: string) => {
    const propertyName =
      currentProperty?.name || `Property ${selectedProperty}`;
    const date = format(new Date(), "yyyy-MM-dd");
    const filterParts = [
      statusFilter !== "all" ? statusFilter : "",
      priorityFilter !== "all" ? priorityFilter : "",
      pmFilter !== "all" ? pmFilter : "",
      topicFilter === "none"
        ? "no-topic"
        : topicFilter !== "all"
          ? `topic-${topicFilter}`
          : "",
      userFilter === "none"
        ? "no-user"
        : userFilter !== "all"
          ? `user-${userFilter.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`
          : "",
      monthFilter !== "all" ? `month-${monthFilter}` : "",
      yearFilter !== "all" ? `year-${yearFilter}` : "",
      createdFrom.trim() ? `from-${createdFrom}` : "",
      createdTo.trim() ? `to-${createdTo}` : "",
    ].filter(Boolean);
    const filterSlug = filterParts.length ? `-${filterParts.join("-")}` : "";
    return `${propertyName.replace(/\s+/g, "-")}-jobs-report${filterSlug}-${date}.${extension}`
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-");
  };

  const buildFilterDescription = () => {
    const parts: string[] = [];
    if (statusFilter !== "all") parts.push(`status=${statusFilter}`);
    if (priorityFilter !== "all") parts.push(`priority=${priorityFilter}`);
    if (pmFilter !== "all") parts.push(`type=${pmFilter}`);
    if (topicFilter !== "all")
      parts.push(`topic=${topicFilter === "none" ? "none" : topicFilter}`);
    if (userFilter !== "all")
      parts.push(
        `assignee=${userFilter === "none" ? "unassigned" : userFilter}`,
      );
    if (monthFilter !== "all") parts.push(`month=${monthFilter}`);
    if (yearFilter !== "all") parts.push(`year=${yearFilter}`);
    if (createdFrom.trim()) parts.push(`from=${createdFrom}`);
    if (createdTo.trim()) parts.push(`to=${createdTo}`);
    if (searchFilter.trim()) parts.push(`search=${searchFilter.trim()}`);
    return parts.length ? parts.join("; ") : "no filters applied";
  };

  // CSV is generated from a fresh, server-authorized copy of the same filters.
  const handleGenerateCSV = async () => {
    if (
      exportInFlightRef.current ||
      dateRangeInvalid ||
      !canExportJobsReport({
        propertyId: selectedProperty,
        rowCount: filteredReportJobs.length,
        exporting: isGeneratingCsv,
      })
    ) return;

    const exportPropertyId = selectedProperty;
    const exportUrl = buildJobsReportCsvUrl({
      propertyId: exportPropertyId,
      filters: activeFilters,
    });
    if (!exportUrl || !exportPropertyId) return;

    const controller = new AbortController();
    exportControllerRef.current?.abort();
    exportControllerRef.current = controller;
    exportInFlightRef.current = true;
    setExportError(null);
    setIsGeneratingCsv(true);
    try {
      const response = await fetch(exportUrl, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        let message = "Unable to export CSV.";
        try {
          const payload = (await response.json()) as { detail?: unknown };
          if (payload.detail) message = String(payload.detail);
        } catch {
          // Preserve the stable user-facing fallback.
        }
        throw new Error(message);
      }
      if (
        controller.signal.aborted ||
        useMainStore.getState().selectedPropertyId !== exportPropertyId
      ) return;

      const blob = await response.blob();
      const filename = getCsvFilename(
        response.headers.get("content-disposition"),
        `jobs-report-${exportPropertyId}-${format(new Date(), "yyyy-MM-dd")}.csv`,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      if (controller.signal.aborted) return;
      setExportError(
        error instanceof Error ? error.message : "Unable to export CSV.",
      );
    } finally {
      exportInFlightRef.current = false;
      setIsGeneratingCsv(false);
    }
  };

  const handleGenerateExcel = async () => {
    if (!filteredReportJobs.length) {
      alert(
        "No jobs match the current filters. Adjust filters or clear them to export.",
      );
      return;
    }
    try {
      setIsGeneratingExcel(true);
      const propertyName =
        currentProperty?.name || `Property ${selectedProperty}`;
      // Yield to the browser so the spinner can paint before XLSX work blocks the main thread.
      await new Promise((resolve) => setTimeout(resolve, 0));
      exportJobsToExcel(filteredReportJobs, userProperties, {
        propertyName,
        summary: statistics,
        filterDescription: buildFilterDescription(),
        filename: buildExportFilename("xlsx"),
        includeImages: true,
        maxImageColumns: 3,
        includeUserDetails: true,
        includeRoomDetails: true,
        includePropertyDetails: true,
        dateFormat: "readable",
      });
    } catch (error: unknown) {
      console.error("Error generating Excel:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to generate Excel: ${message}`);
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!filteredReportJobs.length) {
      alert(
        "No jobs match the current filters. Adjust filters or clear them to export.",
      );
      return;
    }
    try {
      setIsGeneratingPdf(true);
      const propertyName =
        currentProperty?.name || `Property ${selectedProperty}`;
      await new Promise((resolve) => setTimeout(resolve, 0));
      await exportJobsReportToPdf(filteredReportJobs, userProperties, {
        propertyName,
        summary: statistics,
        filterDescription: buildFilterDescription(),
        filename: buildExportFilename("pdf"),
        includeImages: true,
        maxImageColumns: 3,
      });
    } catch (error: unknown) {
      console.error("Error generating PDF:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to generate PDF: ${message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Check if session is still loading
  if (sessionStatus === "loading") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Loading Session...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-muted-foreground">
              Loading your session...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Check if user is authenticated
  if (sessionStatus === "unauthenticated" || !session?.user) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Authentication Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Please log in to view the jobs report.</p>
            <p className="text-sm mt-2">
              You need to be authenticated to access this feature.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!selectedProperty) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Property Jobs Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>
              {userProperties.length
                ? "Select a property to view reports."
                : "You do not have an accessible Property for reporting."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading || (loadedPropertyId !== selectedProperty && !reportError)) {
    return (
      <PageLoader
        label="Loading jobs report"
        description={`Loading report rows${currentProperty?.name ? ` for ${currentProperty.name}` : ""}.`}
      />
    );
  }

  if (reportError) {
    return (
      <Card className="w-full" role="alert">
        <CardHeader>
          <CardTitle>Unable to load report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-destructive">{reportError}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Retry report
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex min-w-0 items-start gap-2">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="break-words">
                  {currentProperty?.name} - Jobs Report
                </span>
              </CardTitle>
              <p className="mt-1 break-all text-xs text-muted-foreground sm:text-sm">
                Property ID: {selectedProperty}
                {filter !== "all" ? ` · Tab filter: ${filter}` : ""}
              </p>
            </div>
            <div className="flex w-full flex-col items-stretch gap-2 lg:w-auto lg:items-end">
              <p className="text-xs text-muted-foreground">
                Export uses filtered rows ({filteredReportJobs.length}/
                {visibleReportJobs.length})
              </p>
              <div className="grid w-full grid-cols-3 gap-2 lg:w-auto">
                <Button
                  onClick={handleGenerateExcel}
                  disabled={
                    isGeneratingExcel || filteredReportJobs.length === 0
                  }
                  isLoading={isGeneratingExcel}
                  loadingText="Building Excel..."
                  className="min-w-0 items-center justify-center gap-1 bg-emerald-600 px-2 text-white hover:bg-emerald-700 sm:gap-2 sm:px-4"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="hidden sm:inline">Export Excel</span>
                  <span className="sm:hidden">Excel</span>
                  <span className="text-xs opacity-90">
                    ({filteredReportJobs.length})
                  </span>
                </Button>
                <Button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf || filteredReportJobs.length === 0}
                  isLoading={isGeneratingPdf}
                  loadingText="Building PDF..."
                  className="min-w-0 items-center justify-center gap-1 bg-rose-600 px-2 text-white hover:bg-rose-700 sm:gap-2 sm:px-4"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Export PDF</span>
                  <span className="sm:hidden">PDF</span>
                </Button>
                <Button
                  onClick={handleGenerateCSV}
                  disabled={
                    dateRangeInvalid ||
                    !canExportJobsReport({
                      propertyId: selectedProperty,
                      rowCount: filteredReportJobs.length,
                      exporting: isGeneratingCsv,
                    })
                  }
                  isLoading={isGeneratingCsv}
                  loadingText="Exporting CSV..."
                  variant="outline"
                  className="min-w-0 items-center justify-center gap-1 px-2 sm:gap-2 sm:px-4"
                >
                  <ClipboardList className="h-4 w-4" />
                  CSV
                </Button>
              </div>
              {exportError ? (
                <p className="text-sm font-medium text-destructive" role="alert">
                  Unable to export CSV. {exportError}
                </p>
              ) : null}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filters — same scope as statistics and CSV export */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report & export filters</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Narrow jobs before export. Charts and CSV only include rows that
            match all selected criteria (including topic and user).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 [&_input]:min-h-11 [&_select]:min-h-11 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="jobs-report-search"
                className="text-xs font-medium text-muted-foreground"
              >
                Search report
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="jobs-report-search"
                  type="search"
                  value={searchFilter}
                  onChange={(event) => setSearchFilter(event.target.value)}
                  placeholder="Job ID, description, room, area, topic, or assignee"
                  className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jobs-report-status"
                className="text-xs font-medium text-muted-foreground"
              >
                Status
              </label>
              <select
                id="jobs-report-status"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as JobStatus | "all")
                }
              >
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jobs-report-priority"
                className="text-xs font-medium text-muted-foreground"
              >
                Priority
              </label>
              <select
                id="jobs-report-priority"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(e.target.value as JobPriority | "all")
                }
              >
                {PRIORITY_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jobs-report-pm"
                className="text-xs font-medium text-muted-foreground"
              >
                Job type (PM)
              </label>
              <select
                id="jobs-report-pm"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                value={pmFilter}
                onChange={(e) => setPmFilter(e.target.value as PmFilterType)}
              >
                {PM_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jobs-report-topic"
                className="text-xs font-medium text-muted-foreground"
              >
                Topic
              </label>
              <select
                id="jobs-report-topic"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                value={topicFilter}
                onChange={(e) =>
                  setTopicFilter(e.target.value as TopicFilterValue)
                }
              >
                <option value="all">All topics</option>
                {jobsWithNoTopicCount > 0 ? (
                  <option value="none">
                    No topic ({jobsWithNoTopicCount})
                  </option>
                ) : null}
                {topicFilterOptions.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jobs-report-user"
                className="text-xs font-medium text-muted-foreground"
              >
                User
              </label>
              <select
                id="jobs-report-user"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                value={userFilter}
                onChange={(e) =>
                  setUserFilter(e.target.value as UserFilterValue)
                }
              >
                <option value="all">All users</option>
                {jobsWithNoUserCount > 0 ? (
                  <option value="none">
                    No assignee ({jobsWithNoUserCount})
                  </option>
                ) : null}
                {userFilterOptions.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jobs-report-from"
                className="text-xs font-medium text-muted-foreground"
              >
                Created from
              </label>
              <input
                id="jobs-report-from"
                type="date"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
                max={createdTo || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jobs-report-to"
                className="text-xs font-medium text-muted-foreground"
              >
                Created to
              </label>
              <input
                id="jobs-report-to"
                type="date"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
                min={createdFrom || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jobs-report-month"
                className="text-xs font-medium text-muted-foreground"
              >
                Month
              </label>
              <select
                id="jobs-report-month"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                value={monthFilter}
                onChange={(e) =>
                  setMonthFilter(e.target.value as "all" | string)
                }
              >
                <option value="all">All months</option>
                {monthFilterOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jobs-report-year"
                className="text-xs font-medium text-muted-foreground"
              >
                Year
              </label>
              <select
                id="jobs-report-year"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                value={yearFilter}
                onChange={(e) =>
                  setYearFilter(e.target.value as "all" | string)
                }
              >
                <option value="all">All years</option>
                {yearFilterOptions.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 w-full text-muted-foreground sm:w-auto"
              onClick={() => {
                setStatusFilter("all");
                setPriorityFilter("all");
                setPmFilter("all");
                setTopicFilter("all");
                setUserFilter("all");
                setMonthFilter("all");
                setYearFilter("all");
                setCreatedFrom("");
                setCreatedTo("");
                setSearchFilter("");
                setExportError(null);
                setCurrentPage(1);
              }}
            >
              Clear filters
            </Button>
            {filteredReportJobs.length === 0 && visibleReportJobs.length > 0 ? (
              <span className="text-xs text-amber-700">
                No jobs match — loosen filters to see data.
              </span>
            ) : null}
            {dateRangeInvalid ? (
              <span className="text-xs font-medium text-destructive" role="alert">
                Created-to must be on or after Created-from.
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-base">Filtered job rows</CardTitle>
              <p className="text-sm font-normal text-muted-foreground">
                CSV exports all {filteredReportJobs.length} matching rows, not only this page.
              </p>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {filteredReportJobs.length
                ? `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(
                    currentPage * pageSize,
                    filteredReportJobs.length,
                  )} of ${filteredReportJobs.length}`
                : "0 matching jobs"}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {visibleReportJobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <p className="font-semibold text-foreground">No jobs in this Property</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Jobs created for this Property will appear in the report.
              </p>
            </div>
          ) : filteredReportJobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <p className="font-semibold text-foreground">
                No jobs match the selected report filters
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear or adjust filters to see report rows.
              </p>
            </div>
          ) : (
            <>
              <ol className="space-y-3 md:hidden" aria-label="Filtered job rows">
                {paginatedReportJobs.map((job) => {
                  const detailHref = getJobsReportDetailHref(
                    job.job_id,
                    selectedProperty,
                  );
                  const location =
                    job.rooms?.map((room) => room.name).filter(Boolean).join(", ") ||
                    job.area?.name ||
                    job.area_name ||
                    "No location";
                  return (
                    <li key={job.job_id} className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-all text-sm font-bold text-foreground">
                            #{job.job_id}
                          </p>
                          <p className="mt-1 line-clamp-2 text-sm text-foreground/80">
                            {job.description || job.topics?.[0]?.title || "Untitled job"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-border px-2 py-1 text-xs font-semibold capitalize">
                          {String(job.status).replaceAll("_", " ")}
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm text-muted-foreground">
                        <div className="flex justify-between gap-3">
                          <dt>Priority</dt>
                          <dd className="font-medium capitalize text-foreground">{job.priority}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Location</dt>
                          <dd className="min-w-0 break-words text-right text-foreground">{location}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Assigned to</dt>
                          <dd className="min-w-0 break-words text-right text-foreground">
                            {getReportUserLabel(job.user, session?.user)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Created</dt>
                          <dd className="text-right text-foreground">
                            {format(new Date(job.created_at), "PP")}
                          </dd>
                        </div>
                      </dl>
                      {detailHref ? (
                        <Link
                          href={detailHref}
                          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          View job detail
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ol>

              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-muted/90 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-3">Job ID</th>
                      <th scope="col" className="px-3 py-3">Created</th>
                      <th scope="col" className="px-3 py-3">Status</th>
                      <th scope="col" className="px-3 py-3">Priority</th>
                      <th scope="col" className="px-3 py-3">Description</th>
                      <th scope="col" className="px-3 py-3">Location</th>
                      <th scope="col" className="px-3 py-3">Assigned to</th>
                      <th scope="col" className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedReportJobs.map((job) => {
                      const detailHref = getJobsReportDetailHref(job.job_id, selectedProperty);
                      const location =
                        job.rooms?.map((room) => room.name).filter(Boolean).join(", ") ||
                        job.area?.name ||
                        job.area_name ||
                        "—";
                      return (
                        <tr key={job.job_id} className="align-top hover:bg-muted/40">
                          <td className="whitespace-nowrap px-3 py-3 font-semibold">#{job.job_id}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                            {format(new Date(job.created_at), "PP")}
                          </td>
                          <td className="px-3 py-3">
                            <span className="rounded-full border border-border px-2 py-1 text-xs font-semibold capitalize">
                              {String(job.status).replaceAll("_", " ")}
                            </span>
                          </td>
                          <td className="px-3 py-3 capitalize">{job.priority}</td>
                          <td className="max-w-xs px-3 py-3">
                            <span className="line-clamp-2" title={job.description || ""}>
                              {job.description || job.topics?.[0]?.title || "Untitled job"}
                            </span>
                          </td>
                          <td className="max-w-48 break-words px-3 py-3">{location}</td>
                          <td className="max-w-48 break-words px-3 py-3">
                            {getReportUserLabel(job.user, session?.user)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {detailHref ? (
                              <Link
                                href={detailHref}
                                className="inline-flex min-h-9 items-center rounded-md px-3 font-semibold text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                View
                              </Link>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 ? (
                <nav
                  className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
                  aria-label="Jobs Report pages"
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  >
                    Next
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* Key Statistics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 shrink-0 text-blue-600" />
              <div className="min-w-0">
                <p className="text-2xl font-bold">{statistics.total}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 shrink-0 text-violet-600" />
              <div className="min-w-0">
                <p className="text-2xl font-bold">{statistics.pmJobs}</p>
                <p className="text-sm text-muted-foreground">PM jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 shrink-0 text-sky-600" />
              <div className="min-w-0">
                <p className="text-2xl font-bold">{statistics.nonPmJobs}</p>
                <p className="text-sm text-muted-foreground">Non-PM</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              <div className="min-w-0">
                <p className="text-2xl font-bold">
                  {statistics.completionRate}%
                </p>
                <p className="text-sm text-muted-foreground">Complete</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 shrink-0 text-orange-600" />
              <div className="min-w-0">
                <p className="text-2xl font-bold">
                  {statistics.averageResponseTime}d
                </p>
                <p className="text-sm text-muted-foreground">Avg time</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="text-2xl font-bold">{statistics.highPriority}</p>
                <p className="text-sm text-muted-foreground">High Prio</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts — filtered jobs only */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5" />
              Jobs by status
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Count per status for the current filter selection.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {filteredReportJobs.length === 0 ? (
              <div className="flex h-72 min-h-[18rem] items-center justify-center text-sm text-muted-foreground">
                No jobs match the filters.
              </div>
            ) : (
              <div className="h-72 w-full min-h-[18rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={statistics.jobsByStatus}
                    margin={{ top: 28, right: 12, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="status"
                      tick={{ fontSize: 11 }}
                      stroke="#6b7280"
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={56}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="#6b7280"
                      allowDecimals={false}
                    />
                    <Tooltip />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Jobs">
                      {statistics.jobsByStatus.map((entry) => (
                        <Cell key={`cell-${entry.status}`} fill={entry.color} />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="top"
                        formatter={formatChartCountWithZero}
                        fill="#374151"
                        style={LABEL_TEXT_STYLE}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5" />
              Jobs by month (created)
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Chronological trend from filtered jobs (tooltip includes YoY %).
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {jobsByMonthChart.length === 0 ? (
              <div className="flex h-72 min-h-[18rem] items-center justify-center text-sm text-muted-foreground">
                No jobs match the filters.
              </div>
            ) : (
              <div className="h-72 w-full min-h-[18rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={jobsAndNightSaleByMonthChart}
                    margin={{ top: 28, right: 12, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      stroke="#6b7280"
                    />
                    <YAxis
                      yAxisId="jobs"
                      tick={{ fontSize: 11 }}
                      stroke="#6b7280"
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="nightSale"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      stroke="#16a34a"
                      allowDecimals={false}
                    />
                    <Tooltip
                      formatter={(value, name, item) => {
                        const rawYoy =
                          name === "Jobs"
                            ? item?.payload?.jobsYoyPct
                            : item?.payload?.nightSaleYoyPct;
                        const yoy =
                          typeof rawYoy === "number"
                            ? rawYoy
                            : typeof rawYoy === "string"
                              ? Number(rawYoy)
                              : null;
                        const valueText =
                          typeof value === "number"
                            ? value.toLocaleString()
                            : String(value);
                        const yoyText =
                          yoy == null ||
                          Number.isNaN(yoy) ||
                          !Number.isFinite(yoy)
                            ? "N/A"
                            : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`;
                        return [`${valueText} (YoY ${yoyText})`, String(name)];
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      yAxisId="jobs"
                      dataKey="jobs"
                      name="Jobs"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    >
                      <LabelList
                        dataKey="jobs"
                        position="top"
                        formatter={formatChartCount}
                        fill="#374151"
                        style={LABEL_TEXT_STYLE}
                      />
                    </Line>
                    <Line
                      type="monotone"
                      yAxisId="nightSale"
                      dataKey="nightSale"
                      name="Night sale"
                      stroke="#16a34a"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5" />
            Month-by-month & year-to-year comparison
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Compares current month job orders and PM mix against last month and
            the same month last year.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredReportJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No jobs match the filters.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Month by month ({monthlyAndYearlyComparisons.monthLabel} vs{" "}
                  {monthlyAndYearlyComparisons.previousMonthLabel})
                </h3>
                <div className="mt-3 space-y-2">
                  {monthlyAndYearlyComparisons.monthOverMonth.map((row) => (
                    <div
                      key={`mom-${row.label}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {row.current} vs {row.previous}
                      </span>
                      <span
                        className={`tabular-nums font-medium ${
                          row.delta > 0
                            ? "text-green-600"
                            : row.delta < 0
                              ? "text-red-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {row.delta >= 0 ? "+" : ""}
                        {row.delta}
                        {row.deltaPct === null
                          ? ""
                          : ` (${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct}%)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Year to year ({monthlyAndYearlyComparisons.monthLabel} vs{" "}
                  {monthlyAndYearlyComparisons.sameMonthLastYearLabel})
                </h3>
                <div className="mt-3 space-y-2">
                  {monthlyAndYearlyComparisons.yearOverYear.map((row) => (
                    <div
                      key={`yoy-${row.label}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {row.current} vs {row.previous}
                      </span>
                      <span
                        className={`tabular-nums font-medium ${
                          row.delta > 0
                            ? "text-green-600"
                            : row.delta < 0
                              ? "text-red-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {row.delta >= 0 ? "+" : ""}
                        {row.delta}
                        {row.deltaPct === null
                          ? ""
                          : ` (${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct}%)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
            <h3 className="text-sm font-semibold text-blue-900">
              Utility Consumption comparison (Night Sale vs Jobs)
            </h3>
            {utilityLoading ? (
              <p className="mt-2 text-sm text-blue-700">
                Loading utility consumption...
              </p>
            ) : utilityError ? (
              <p className="mt-2 text-sm text-red-600">{utilityError}</p>
            ) : (
              <>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <p className="text-blue-700">Current Night Sale</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility.currentNightSale.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">MoM Night Sale Δ</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility
                        .monthOverMonthNightSale >= 0
                        ? "+"
                        : ""}
                      {monthlyAndYearlyComparisons.utility.monthOverMonthNightSale.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">YoY Night Sale Δ</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility
                        .yearOverYearNightSale >= 0
                        ? "+"
                        : ""}
                      {monthlyAndYearlyComparisons.utility.yearOverYearNightSale.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Night Sale / Job order</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility.nightSalePerJobOrder.toFixed(
                        2,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Night Sale / PM job</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility.nightSalePerPmJob.toFixed(
                        2,
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md border border-blue-200 bg-card/80 p-3">
                    <p className="text-blue-700">
                      MoM Night Sale / Job order Δ
                    </p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility
                        .monthOverMonthNightSalePerJobOrder >= 0
                        ? "+"
                        : ""}
                      {monthlyAndYearlyComparisons.utility.monthOverMonthNightSalePerJobOrder.toFixed(
                        2,
                      )}
                    </p>
                  </div>
                  <div className="rounded-md border border-blue-200 bg-card/80 p-3">
                    <p className="text-blue-700">
                      YoY Night Sale / Job order Δ
                    </p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility
                        .yearOverYearNightSalePerJobOrder >= 0
                        ? "+"
                        : ""}
                      {monthlyAndYearlyComparisons.utility.yearOverYearNightSalePerJobOrder.toFixed(
                        2,
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-64 w-full rounded-md border border-blue-100 bg-card p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={[
                        {
                          period:
                            monthlyAndYearlyComparisons.previousMonthLabel,
                          nightSale:
                            monthlyAndYearlyComparisons.utility
                              .previousMonthNightSale,
                          perJobOrder:
                            monthlyAndYearlyComparisons.utility
                              .previousMonthNightSalePerJobOrder,
                        },
                        {
                          period: monthlyAndYearlyComparisons.monthLabel,
                          nightSale:
                            monthlyAndYearlyComparisons.utility
                              .currentNightSale,
                          perJobOrder:
                            monthlyAndYearlyComparisons.utility
                              .nightSalePerJobOrder,
                        },
                        {
                          period:
                            monthlyAndYearlyComparisons.sameMonthLastYearLabel,
                          nightSale:
                            monthlyAndYearlyComparisons.utility
                              .sameMonthLastYearNightSale,
                          perJobOrder:
                            monthlyAndYearlyComparisons.utility
                              .sameMonthLastYearNightSalePerJobOrder,
                        },
                      ]}
                      margin={{ top: 10, right: 12, left: 6, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 11 }}
                        stroke="#1d4ed8"
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11 }}
                        stroke="#1d4ed8"
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        stroke="#0e7490"
                      />
                      <Tooltip />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="nightSale"
                        name="Night Sale"
                        stroke="#1d4ed8"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="perJobOrder"
                        name="Night Sale / Job order"
                        stroke="#0e7490"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-5 w-5" />
              PM vs non-PM
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Based on{" "}
              <span className="font-medium">Preventive maintenance</span> flag
              on each job (
              <code className="text-xs">is_preventivemaintenance</code>).
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {filteredReportJobs.length === 0 ? (
              <div className="flex h-56 min-h-[14rem] items-center justify-center text-sm text-muted-foreground">
                No jobs match the filters.
              </div>
            ) : (
              <div className="h-56 w-full min-h-[14rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pmVsNonPmChartRows}
                    margin={{ top: 28, right: 12, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      stroke="#6b7280"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="#6b7280"
                      allowDecimals={false}
                    />
                    <Tooltip />
                    <Bar dataKey="value" name="Jobs" radius={[6, 6, 0, 0]}>
                      {pmVsNonPmChartRows.map((row) => (
                        <Cell key={row.name} fill={row.fill} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="top"
                        formatter={formatChartCountWithZero}
                        fill="#374151"
                        style={LABEL_TEXT_STYLE}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5" />
              Jobs by priority
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Horizontal bars — value labels at the end of each bar.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {filteredReportJobs.length === 0 ? (
              <div className="flex h-56 min-h-[14rem] items-center justify-center text-sm text-muted-foreground">
                No jobs match the filters.
              </div>
            ) : (
              <div className="h-56 w-full min-h-[14rem] max-w-2xl lg:max-w-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={priorityChartRows}
                    margin={{ top: 8, right: 48, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      stroke="#6b7280"
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={64}
                      tick={{ fontSize: 12 }}
                      stroke="#6b7280"
                    />
                    <Tooltip />
                    <Bar dataKey="value" name="Jobs" radius={[0, 6, 6, 0]}>
                      {priorityChartRows.map((row) => (
                        <Cell key={row.name} fill={row.fill} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="right"
                        formatter={formatChartCountWithZero}
                        fill="#374151"
                        style={LABEL_TEXT_STYLE}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building className="h-5 w-5" />
            Rooms with jobs
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Stacked bars:{" "}
            <span className="text-violet-700 font-medium">PM</span> +{" "}
            <span className="text-sky-700 font-medium">Non-PM</span>. White
            numbers inside each segment when both exist; total at bar end. Same
            counting rules as before (multi-room jobs count per room; no room →
            &quot;No room linked&quot;).
            {roomsJobsSummary.length > ROOMS_CHART_MAX ? (
              <span className="mt-1 block text-amber-800">
                Showing top {ROOMS_CHART_MAX} rooms by job count (
                {roomsJobsSummary.length} rows total).
              </span>
            ) : null}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredReportJobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No jobs match the filters.
            </p>
          ) : roomsJobsSummary.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No room data on these jobs.
            </p>
          ) : (
            <div
              style={{ height: roomsChartHeight }}
              className="w-full min-h-[14rem]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={roomsChartData}
                  margin={{ top: 8, right: 52, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={108}
                    tick={{ fontSize: 10 }}
                    stroke="#6b7280"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const p = payload[0].payload as {
                        fullLabel: string;
                        roomId: string;
                        pm: number;
                        nonPm: number;
                        total: number;
                      };
                      return (
                        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-soft">
                          <p className="font-semibold text-foreground">
                            {p.fullLabel}
                          </p>
                          <p className="text-muted-foreground">
                            Room ID: {p.roomId}
                          </p>
                          <p className="text-violet-700">PM: {p.pm}</p>
                          <p className="text-sky-700">Non-PM: {p.nonPm}</p>
                          <p className="mt-1 font-medium text-foreground">
                            Total jobs: {p.total}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="pm"
                    name="PM"
                    stackId="roomJobs"
                    fill="#7c3aed"
                    radius={[4, 0, 0, 4]}
                  >
                    <LabelList
                      dataKey="pm"
                      content={(p) => RoomsInnerSegmentLabel(p, "pm")}
                    />
                    <LabelList
                      dataKey="pm"
                      content={(p) => RoomsStackEndLabel(p, "pm")}
                    />
                  </Bar>
                  <Bar
                    dataKey="nonPm"
                    name="Non-PM"
                    stackId="roomJobs"
                    fill="#0ea5e9"
                    radius={[0, 4, 4, 0]}
                  >
                    <LabelList
                      dataKey="nonPm"
                      content={(p) => RoomsInnerSegmentLabel(p, "nonPm")}
                    />
                    <LabelList
                      dataKey="nonPm"
                      content={(p) => RoomsStackEndLabel(p, "nonPm")}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Report Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Generated on: {format(new Date(), "PPP")}</p>
            <p>• Property: {currentProperty?.name}</p>
            <p>
              • Total jobs in this report (after filters): {statistics.total}
            </p>
            <p>
              • PM jobs: {statistics.pmJobs} · Non-PM: {statistics.nonPmJobs}
            </p>
            <p>• Distinct rooms in chart data: {roomsJobsSummary.length}</p>
            <p>• Jobs loaded for property: {visibleReportJobs.length}</p>
            <p>• Completion rate: {statistics.completionRate}%</p>
            <p>
              • Average response time: {statistics.averageResponseTime} days
            </p>
            <p>
              • High priority jobs requiring attention:{" "}
              {statistics.highPriority}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
