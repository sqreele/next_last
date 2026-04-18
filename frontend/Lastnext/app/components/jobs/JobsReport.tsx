"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
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
} from 'lucide-react';
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
} from 'recharts';
import { useUser, useProperties } from '@/app/lib/stores/mainStore';
import { useSession } from '@/app/lib/session.client';
import { useDetailedUsers, type DetailedUser } from '@/app/lib/hooks/useDetailedUsers';
import { Job, TabValue, JobStatus, JobPriority, STATUS_COLORS } from '@/app/lib/types';
import { fetchAllJobsForProperty } from '@/app/lib/data.server';
import { useMinLoaderTime } from '@/app/lib/hooks/useMinLoaderTime';
import { endOfDay, format, startOfDay } from 'date-fns';
import { jobsToCSV, downloadCSV } from '@/app/lib/utils/csv-export';
import type { UtilityConsumptionRow } from '@/app/dashboard/utility-consumption/types';

const STATUS_FILTER_OPTIONS: Array<{ value: JobStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'waiting_sparepart', label: 'Waiting spare part' },
];

const PRIORITY_FILTER_OPTIONS: Array<{ value: JobPriority | 'all'; label: string }> = [
  { value: 'all', label: 'All priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

type PmFilterType = 'all' | 'pm' | 'non_pm';

const PM_FILTER_OPTIONS: Array<{ value: PmFilterType; label: string }> = [
  { value: 'all', label: 'PM + Non-PM' },
  { value: 'pm', label: 'PM only' },
  { value: 'non_pm', label: 'Non-PM only' },
];

const UNASSIGNED_ROOM_KEY = '__unassigned__';

/** Stable key for report user filter; `null` = no assignee. */
function getJobUserKey(user: Job['user'] | undefined | null): string | null {
  if (user === undefined || user === null) return null;
  if (typeof user === 'string') {
    const s = user.trim();
    return s.length ? s : null;
  }
  if (typeof user === 'number') {
    if (Number.isNaN(user)) return null;
    return String(user);
  }
  if (typeof user === 'object') {
    const o = user as { id?: string | number; username?: string };
    if (o.id != null && String(o.id).trim() !== '') {
      return String(o.id).trim();
    }
    if (o.username != null && String(o.username).trim() !== '') {
      return `username:${String(o.username).trim()}`;
    }
  }
  return null;
}

function cleanAuthUsername(raw: string): string {
  if (raw.includes('auth0_') || raw.includes('google-oauth2_')) {
    return raw.replace(/^(auth0_|google-oauth2_)/, '');
  }
  return raw;
}

function getReportUserLabel(
  user: Job['user'] | undefined | null,
  detailedUsers: DetailedUser[],
  sessionUser: { id?: string; username?: string; first_name?: string | null; last_name?: string | null } | undefined
): string {
  if (user === undefined || user === null) return 'Unassigned';

  if (typeof user === 'object' && user && 'username' in user) {
    const detailed = detailedUsers.find((u) => u.username === user.username);
    if (detailed?.full_name?.trim()) return detailed.full_name.trim();
    if (detailed?.username) return cleanAuthUsername(detailed.username);
    const u = user.username ? cleanAuthUsername(String(user.username)) : '';
    return u || 'Unknown user';
  }

  if (typeof user === 'string' || typeof user === 'number') {
    const userStr = String(user);
    const detailed = detailedUsers.find(
      (u) =>
        u.id.toString() === userStr || u.username === userStr || u.email === userStr
    );
    if (detailed?.full_name?.trim()) return detailed.full_name.trim();
    if (detailed?.username) return cleanAuthUsername(detailed.username);

    if (sessionUser?.id) {
      const sid = String(sessionUser.id).trim();
      if (userStr === sid || userStr.toLowerCase() === sid.toLowerCase()) {
        const fn = [sessionUser.first_name, sessionUser.last_name].filter(Boolean).join(' ').trim();
        return fn || sessionUser.username || 'You';
      }
      if (userStr.includes('google-oauth2_') && sid.includes('google-oauth2_')) {
        if (userStr.replace('google-oauth2_', '') === sid.replace('google-oauth2_', '')) {
          return sessionUser.username || 'You';
        }
      }
      const un = parseInt(userStr, 10);
      const sn = parseInt(sid, 10);
      if (!Number.isNaN(un) && !Number.isNaN(sn) && un === sn) {
        return sessionUser.username || 'You';
      }
    }

    if (!Number.isNaN(Number(userStr))) return `User #${userStr}`;
    return `User ${userStr}`;
  }

  return 'Unknown user';
}

function jobIsPm(job: Job): boolean {
  return job.is_preventivemaintenance === true;
}

/** Rooms linked to a job (each job can count toward multiple rooms). */
function getJobRoomEntries(job: Job): Array<{ key: string; displayName: string; roomId: string }> {
  if (job.rooms && job.rooms.length > 0) {
    return job.rooms.map((room) => {
      const id = room.room_id ?? room.name;
      const key = `id:${String(id)}`;
      const displayName =
        (room.name && String(room.name).trim()) || `Room ${room.room_id ?? ''}`.trim() || 'Unnamed room';
      return {
        key,
        displayName,
        roomId: room.room_id != null ? String(room.room_id) : '—',
      };
    });
  }
  if (job.room_name && String(job.room_name).trim()) {
    const name = String(job.room_name).trim();
    return [{ key: `name:${name}`, displayName: name, roomId: '—' }];
  }
  return [];
}

function parseLocalDateYmd(ymd: string): Date | null {
  const parts = ymd.trim().split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d);
}

/** `all` = any topic; `none` = jobs with no topics; otherwise numeric topic id as string. */
type TopicFilterValue = 'all' | 'none' | string;

/** `all` = any user; `none` = no assignee; otherwise key from {@link getJobUserKey}. */
type UserFilterValue = 'all' | 'none' | string;

function filterJobsForReport(
  jobs: Job[],
  statusFilter: JobStatus | 'all',
  priorityFilter: JobPriority | 'all',
  pmFilter: PmFilterType,
  topicFilter: TopicFilterValue,
  userFilter: UserFilterValue,
  monthFilter: 'all' | string,
  yearFilter: 'all' | string,
  createdFrom: string,
  createdTo: string
): Job[] {
  return jobs.filter((job) => {
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && job.priority !== priorityFilter) return false;
    const isPm = jobIsPm(job);
    if (pmFilter === 'pm' && !isPm) return false;
    if (pmFilter === 'non_pm' && isPm) return false;

    const userKey = getJobUserKey(job.user);
    if (userFilter === 'none') {
      if (userKey !== null) return false;
    } else if (userFilter !== 'all') {
      if (userKey !== userFilter) return false;
    }

    const createdDate = new Date(job.created_at);
    if (monthFilter !== 'all') {
      const wantedMonth = Number(monthFilter);
      if (Number.isNaN(wantedMonth) || createdDate.getMonth() + 1 !== wantedMonth) return false;
    }
    if (yearFilter !== 'all') {
      const wantedYear = Number(yearFilter);
      if (Number.isNaN(wantedYear) || createdDate.getFullYear() !== wantedYear) return false;
    }

    const topics = job.topics;
    const hasTopics = Array.isArray(topics) && topics.length > 0;
    if (topicFilter === 'none') {
      if (hasTopics) return false;
    } else if (topicFilter !== 'all') {
      const wantId = Number(topicFilter);
      if (Number.isNaN(wantId)) return false;
      if (!topics?.some((t) => Number(t.id) === wantId)) return false;
    }

    const created = createdDate.getTime();
    if (createdFrom.trim()) {
      const day = parseLocalDateYmd(createdFrom);
      if (day) {
        const from = startOfDay(day).getTime();
        if (created < from) return false;
      }
    }
    if (createdTo.trim()) {
      const day = parseLocalDateYmd(createdTo);
      if (day) {
        const to = endOfDay(day).getTime();
        if (created > to) return false;
      }
    }
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
  high: '#dc2626',
  medium: '#ea580c',
  low: '#16a34a',
};

function formatChartCount(v: number | string) {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  return String(n);
}

/** Always show digit (including 0) for short bar charts like PM vs non-PM. */
function formatChartCountWithZero(v: number | string) {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return '';
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
  previous: ComparisonSnapshot
): ComparisonMetric[] {
  return [
    { label: 'Job orders', current: current.total, previous: previous.total },
    { label: 'PM jobs', current: current.pm, previous: previous.pm },
    { label: 'Non-PM jobs', current: current.nonPm, previous: previous.nonPm },
  ].map((row) => {
    const delta = row.current - row.previous;
    const deltaPct = row.previous === 0 ? null : Math.round((delta / row.previous) * 100);
    return { ...row, delta, deltaPct };
  });
}

function buildUtilitySnapshot(rows: UtilityConsumptionRow[]): UtilityMonthSnapshot {
  return rows.reduce(
    (acc, row) => {
      acc.nightsale += Number(row.nightsale) || 0;
      acc.water += Number(row.water) || 0;
      acc.totalkwh += Number(row.totalkwh) || 0;
      return acc;
    },
    { nightsale: 0, water: 0, totalkwh: 0 }
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
  which: 'pm' | 'nonPm'
) {
  const { x, y, width, height, payload } = props;
  if (
    x == null ||
    y == null ||
    width == null ||
    height == null ||
    !payload ||
    typeof payload !== 'object'
  ) {
    return null;
  }
  const pm = Number(payload.pm) || 0;
  const nonPm = Number(payload.nonPm) || 0;
  if (pm <= 0 || nonPm <= 0) return null;

  const val = which === 'pm' ? pm : nonPm;
  if (val <= 0) return null;

  const nx = typeof x === 'number' ? x : Number(x);
  const ny = typeof y === 'number' ? y : Number(y);
  const nw = typeof width === 'number' ? width : Number(width);
  const nh = typeof height === 'number' ? height : Number(height);
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
      style={{ textShadow: '0 0 2px rgba(0,0,0,0.35)' }}
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
  segment: 'pm' | 'nonPm'
) {
  const { x, y, width, height, payload } = props;
  if (
    x == null ||
    y == null ||
    width == null ||
    height == null ||
    !payload ||
    typeof payload !== 'object'
  ) {
    return null;
  }
  const pm = Number(payload.pm) || 0;
  const nonPm = Number(payload.nonPm) || 0;
  const total = pm + nonPm;
  if (total === 0) return null;
  if (segment === 'nonPm' && nonPm === 0) return null;
  if (segment === 'pm' && nonPm > 0) return null;

  const nx = typeof x === 'number' ? x : Number(x);
  const ny = typeof y === 'number' ? y : Number(y);
  const nw = typeof width === 'number' ? width : Number(width);
  const nh = typeof height === 'number' ? height : Number(height);

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

export default function JobsReport({ jobs = [], filter = 'all', onRefresh }: JobsReportProps) {
  const { data: session } = useSession();
  const { userProfile, selectedPropertyId: selectedProperty } = useUser();
  const { properties: userProperties } = useProperties();
  const { users: detailedUsers } = useDetailedUsers();
  
  const [isGeneratingCsv, setIsGeneratingCsv] = useState(false);
  const [reportJobs, setReportJobs] = useState<Job[]>([]);
  const [utilityRows, setUtilityRows] = useState<UtilityConsumptionRow[]>([]);
  const [utilityLoading, setUtilityLoading] = useState(false);
  const [utilityError, setUtilityError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<JobPriority | 'all'>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [pmFilter, setPmFilter] = useState<PmFilterType>('all');
  const [topicFilter, setTopicFilter] = useState<TopicFilterValue>('all');
  const [userFilter, setUserFilter] = useState<UserFilterValue>('all');
  const [monthFilter, setMonthFilter] = useState<'all' | string>('all');
  const [yearFilter, setYearFilter] = useState<'all' | string>('all');
  const { recordLoaderShown, clearLoadingAfterMinTime } = useMinLoaderTime(setLoading);

  const topicFilterOptions = useMemo(() => {
    const byId = new Map<number, { id: number; title: string }>();
    reportJobs.forEach((job) => {
      job.topics?.forEach((t) => {
        if (t == null || t.id == null) return;
        const id = Number(t.id);
        if (Number.isNaN(id)) return;
        const title = (t.title && String(t.title).trim()) || `Topic ${id}`;
        if (!byId.has(id)) byId.set(id, { id, title });
      });
    });
    return Array.from(byId.values()).sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    );
  }, [reportJobs]);

  const jobsWithNoTopicCount = useMemo(
    () => reportJobs.filter((j) => !j.topics?.length).length,
    [reportJobs]
  );

  const jobsWithNoUserCount = useMemo(
    () => reportJobs.filter((j) => getJobUserKey(j.user) === null).length,
    [reportJobs]
  );

  const userFilterOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    reportJobs.forEach((job) => {
      const key = getJobUserKey(job.user);
      if (!key || byKey.has(key)) return;
      byKey.set(key, getReportUserLabel(job.user, detailedUsers, session?.user));
    });
    return Array.from(byKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      );
  }, [reportJobs, detailedUsers, session?.user]);

  /**
   * Keep provided jobs reactive even when length stays the same, while avoiding
   * fetch loops from default `jobs = []` creating a new array every render.
   */
  const providedJobsFingerprint = useMemo(
    () =>
      jobs
        .map((job) =>
          [
            String((job as { job_id?: string }).job_id ?? ''),
            String(job.created_at ?? ''),
            String(job.status ?? ''),
            String(job.priority ?? ''),
            String(job.completed_at ?? ''),
            String(job.topics?.length ?? 0),
            String(job.rooms?.length ?? 0),
            String(jobIsPm(job)),
          ].join('|')
        )
        .join('||'),
    [jobs]
  );

  const stableProvidedJobs = useMemo(() => jobs, [providedJobsFingerprint]);

  const filteredReportJobs = useMemo(
    () =>
      filterJobsForReport(
        reportJobs,
        statusFilter,
        priorityFilter,
        pmFilter,
        topicFilter,
        userFilter,
        monthFilter,
        yearFilter,
        createdFrom,
        createdTo
      ),
    [
      reportJobs,
      statusFilter,
      priorityFilter,
      pmFilter,
      topicFilter,
      userFilter,
      monthFilter,
      yearFilter,
      createdFrom,
      createdTo,
    ]
  );

  const yearFilterOptions = useMemo(() => {
    const years = new Set<number>();
    reportJobs.forEach((job) => {
      const d = new Date(job.created_at);
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [reportJobs]);

  const monthFilterOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format(new Date(2020, i, 1), 'MMMM') })),
    []
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
        params.set('property_id', String(selectedProperty));
        params.set('page_size', '1000');
        const res = await fetch(`/api/utility/consumption?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error('Unable to load utility consumption for comparison.');
        }
        const payload: UtilityConsumptionRow[] = await res.json();
        setUtilityRows(Array.isArray(payload) ? payload : []);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setUtilityRows([]);
        setUtilityError(error instanceof Error ? error.message : 'Unable to load utility consumption.');
      } finally {
        setUtilityLoading(false);
      }
    }

    loadUtilityRows();
    return () => controller.abort();
  }, [selectedProperty]);

  useEffect(() => {
    if (topicFilter === 'none' && jobsWithNoTopicCount === 0) {
      setTopicFilter('all');
      return;
    }
    if (topicFilter === 'all' || topicFilter === 'none') return;
    const ok = topicFilterOptions.some((t) => String(t.id) === topicFilter);
    if (!ok) setTopicFilter('all');
  }, [topicFilter, topicFilterOptions, jobsWithNoTopicCount]);

  useEffect(() => {
    if (userFilter === 'none' && jobsWithNoUserCount === 0) {
      setUserFilter('all');
      return;
    }
    if (userFilter === 'all' || userFilter === 'none') return;
    const ok = userFilterOptions.some((u) => u.key === userFilter);
    if (!ok) setUserFilter('all');
  }, [userFilter, userFilterOptions, jobsWithNoUserCount]);

  const roomsJobsSummary = useMemo((): RoomJobsSummaryRow[] => {
    const map = new Map<
      string,
      { displayName: string; roomId: string; jobCount: number; pmJobCount: number }
    >();

    filteredReportJobs.forEach((job) => {
      const isPm = jobIsPm(job);
      const entries = getJobRoomEntries(job);
      if (entries.length === 0) {
        const cur = map.get(UNASSIGNED_ROOM_KEY) ?? {
          displayName: 'No room linked',
          roomId: '—',
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
        if (r.roomId !== '—') cur.roomId = r.roomId;
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
    [roomsChartData.length]
  );

  /** Chronological month buckets for charts (statistics.jobsByMonth order is not sorted). */
  const jobsByMonthChart = useMemo(() => {
    const map = new Map<string, { sortKey: string; label: string; count: number }>();
    filteredReportJobs.forEach((job) => {
      const d = new Date(job.created_at);
      const sortKey = format(d, 'yyyy-MM');
      const label = format(d, 'MMM yyyy');
      const cur = map.get(sortKey);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(sortKey, { sortKey, label, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredReportJobs]);

  const jobsAndNightSaleByMonthChart = useMemo(() => {
    const monthMap = new Map<string, { sortKey: string; label: string; jobs: number; nightSale: number }>();

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

      const sortKey = format(monthDate, 'yyyy-MM');
      const existing = monthMap.get(sortKey);
      if (existing) {
        existing.nightSale += Number(row.nightsale) || 0;
        return;
      }

      monthMap.set(sortKey, {
        sortKey,
        label: format(monthDate, 'MMM yyyy'),
        jobs: 0,
        nightSale: Number(row.nightsale) || 0,
      });
    });

    const sorted = Array.from(monthMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const bySortKey = new Map(sorted.map((row) => [row.sortKey, row]));

    return sorted.map((row) => {
      const [yearStr, monthStr] = row.sortKey.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const prevYearKey = `${year - 1}-${String(month).padStart(2, '0')}`;
      const prevYearRow = bySortKey.get(prevYearKey);
      const jobsYoyPct =
        prevYearRow && prevYearRow.jobs !== 0
          ? ((row.jobs - prevYearRow.jobs) / prevYearRow.jobs) * 100
          : null;
      const nightSaleYoyPct =
        prevYearRow && prevYearRow.nightSale !== 0
          ? ((row.nightSale - prevYearRow.nightSale) / prevYearRow.nightSale) * 100
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
      inMonth(new Date(job.created_at), currentYear, currentMonth)
    );
    const previousMonthJobs = filteredReportJobs.filter((job) =>
      inMonth(new Date(job.created_at), previousMonthDate.getFullYear(), previousMonthDate.getMonth())
    );
    const sameMonthLastYearJobs = filteredReportJobs.filter((job) =>
      inMonth(new Date(job.created_at), previousYear, currentMonth)
    );
    const currentMonthUtilityRows = utilityRows.filter((row) => row.year === currentYear && new Date(`${row.month} 1, ${row.year}`).getMonth() === currentMonth);
    const previousMonthUtilityRows = utilityRows.filter(
      (row) =>
        row.year === previousMonthDate.getFullYear() &&
        new Date(`${row.month} 1, ${row.year}`).getMonth() === previousMonthDate.getMonth()
    );
    const sameMonthLastYearUtilityRows = utilityRows.filter(
      (row) =>
        row.year === previousYear &&
        new Date(`${row.month} 1, ${row.year}`).getMonth() === currentMonth
    );

    const monthLabel = format(new Date(currentYear, currentMonth, 1), 'MMMM yyyy');
    const previousMonthLabel = format(previousMonthDate, 'MMMM yyyy');
    const sameMonthLastYearLabel = format(new Date(previousYear, currentMonth, 1), 'MMMM yyyy');

    const currentSnapshot = buildComparisonSnapshot(currentMonthJobs);
    const previousMonthSnapshot = buildComparisonSnapshot(previousMonthJobs);
    const previousYearSnapshot = buildComparisonSnapshot(sameMonthLastYearJobs);
    const utilityCurrent = buildUtilitySnapshot(currentMonthUtilityRows);
    const utilityPreviousMonth = buildUtilitySnapshot(previousMonthUtilityRows);
    const utilityPreviousYear = buildUtilitySnapshot(sameMonthLastYearUtilityRows);
    const safeRatio = (num: number, den: number) => (den > 0 ? num / den : 0);

    return {
      monthLabel,
      previousMonthLabel,
      sameMonthLastYearLabel,
      monthOverMonth: buildComparisonMetrics(currentSnapshot, previousMonthSnapshot),
      yearOverYear: buildComparisonMetrics(currentSnapshot, previousYearSnapshot),
      utility: {
        currentNightSale: utilityCurrent.nightsale,
        previousMonthNightSale: utilityPreviousMonth.nightsale,
        sameMonthLastYearNightSale: utilityPreviousYear.nightsale,
        monthOverMonthNightSale: utilityCurrent.nightsale - utilityPreviousMonth.nightsale,
        yearOverYearNightSale: utilityCurrent.nightsale - utilityPreviousYear.nightsale,
        nightSalePerJobOrder: safeRatio(utilityCurrent.nightsale, currentSnapshot.total),
        previousMonthNightSalePerJobOrder: safeRatio(utilityPreviousMonth.nightsale, previousMonthSnapshot.total),
        sameMonthLastYearNightSalePerJobOrder: safeRatio(utilityPreviousYear.nightsale, previousYearSnapshot.total),
        monthOverMonthNightSalePerJobOrder:
          safeRatio(utilityCurrent.nightsale, currentSnapshot.total) -
          safeRatio(utilityPreviousMonth.nightsale, previousMonthSnapshot.total),
        yearOverYearNightSalePerJobOrder:
          safeRatio(utilityCurrent.nightsale, currentSnapshot.total) -
          safeRatio(utilityPreviousYear.nightsale, previousYearSnapshot.total),
        nightSalePerPmJob: safeRatio(utilityCurrent.nightsale, currentSnapshot.pm),
      },
    };
  }, [filteredReportJobs, utilityRows]);

  // Get current property information
  const currentProperty = useMemo(() => {
    if (!selectedProperty) return null;
    return userProperties.find(p => p.property_id === selectedProperty) || null;
  }, [selectedProperty, userProperties]);

  // Filter jobs by selected property - memoized to prevent infinite loops
  const filteredJobs = useMemo(() => {
    if (!selectedProperty || !jobs.length) return jobs;
    
    return jobs.filter(job => {
      // Check direct property_id match
      if (job.property_id === selectedProperty) return true;
      
      // Check properties array
      if (job.properties && Array.isArray(job.properties)) {
        return job.properties.some(prop => {
          if (typeof prop === 'string' || typeof prop === 'number') {
            return String(prop) === String(selectedProperty);
          }
          if (typeof prop === 'object' && prop !== null) {
            return String(prop.property_id || prop.id) === String(selectedProperty);
          }
          return false;
        });
      }
      
      // Check profile_image.properties
      if (job.profile_image?.properties && Array.isArray(job.profile_image.properties)) {
        return job.profile_image.properties.some(prop => {
          if (typeof prop === 'string' || typeof prop === 'number') {
            return String(prop) === String(selectedProperty);
          }
          if (typeof prop === 'object' && prop !== null) {
            return String(prop.property_id || prop.id) === String(selectedProperty);
          }
          return false;
        });
      }
      
      // Check rooms.properties
      if (job.rooms && Array.isArray(job.rooms)) {
        return job.rooms.some(room => {
          if (room.properties && Array.isArray(room.properties)) {
            return room.properties.some(prop => String(prop) === String(selectedProperty));
          }
          return false;
        });
      }
      
      return false;
    });
  }, [jobs, selectedProperty]);

  // Calculate comprehensive statistics (respects export filters)
  const statistics: ReportStatistics = useMemo(() => {
    const total = filteredReportJobs.length;
    const pmJobs = filteredReportJobs.filter((job) => jobIsPm(job)).length;
    const nonPmJobs = total - pmJobs;
    const completed = filteredReportJobs.filter(job => job.status === 'completed').length;
    const inProgress = filteredReportJobs.filter(job => job.status === 'in_progress').length;
    const pending = filteredReportJobs.filter(job => job.status === 'pending').length;
    const cancelled = filteredReportJobs.filter(job => job.status === 'cancelled').length;
    const waitingSparepart = filteredReportJobs.filter(job => job.status === 'waiting_sparepart').length;
    const highPriority = filteredReportJobs.filter(job => job.priority === 'high').length;
    const mediumPriority = filteredReportJobs.filter(job => job.priority === 'medium').length;
    const lowPriority = filteredReportJobs.filter(job => job.priority === 'low').length;
    
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    // Calculate average response time
    const completedJobDates = filteredReportJobs
      .filter(job => job.status === 'completed' && job.completed_at)
      .map(job => new Date(job.completed_at!).getTime() - new Date(job.created_at).getTime());
    
    const averageResponseTime = completedJobDates.length > 0 
      ? Math.round(completedJobDates.reduce((sum, time) => sum + time, 0) / completedJobDates.length / (1000 * 60 * 60 * 24))
      : 0;

    // Group jobs by month
    const jobsByMonth = filteredReportJobs.reduce((acc, job) => {
      const month = format(new Date(job.created_at), 'MMM yyyy');
      const existing = acc.find(item => item.month === month);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ month, count: 1 });
      }
      return acc;
    }, [] as Array<{ month: string; count: number }>);

    // Jobs by status
    const jobsByStatus = [
      { status: 'Completed', count: completed, color: STATUS_COLORS.completed },
      { status: 'In Progress', count: inProgress, color: STATUS_COLORS.in_progress },
      { status: 'Pending', count: pending, color: STATUS_COLORS.pending },
      { status: 'Cancelled', count: cancelled, color: STATUS_COLORS.cancelled },
      { status: 'Waiting Parts', count: waitingSparepart, color: STATUS_COLORS.waiting_sparepart }
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
      jobsByStatus
    };
  }, [filteredReportJobs]);

  const pmVsNonPmChartRows = useMemo(
    () => [
      { name: 'PM', value: statistics.pmJobs, fill: '#7c3aed' },
      { name: 'Non-PM', value: statistics.nonPmJobs, fill: '#0ea5e9' },
    ],
    [statistics.pmJobs, statistics.nonPmJobs]
  );

  const priorityChartRows = useMemo(
    () => [
      { name: 'High', value: statistics.highPriority, fill: PRIORITY_COLORS.high },
      { name: 'Medium', value: statistics.mediumPriority, fill: PRIORITY_COLORS.medium },
      { name: 'Low', value: statistics.lowPriority, fill: PRIORITY_COLORS.low },
    ],
    [statistics.highPriority, statistics.mediumPriority, statistics.lowPriority]
  );

  // Load jobs for the selected property if external jobs were not provided.
  useEffect(() => {
    if (selectedProperty && stableProvidedJobs.length === 0) {
      const loadPropertyJobs = async () => {
        recordLoaderShown();
        setLoading(true);
        try {
          console.log('🔍 JobsReport: Loading property jobs for:', selectedProperty);
          console.log('🔍 JobsReport: Session available:', !!session);
          console.log('🔍 JobsReport: Session user:', session?.user);
          console.log('🔍 JobsReport: Access token available:', !!session?.user?.accessToken);
          
          // Try to get access token from session, or use a fallback
          let accessToken = session?.user?.accessToken;
          
          // If no access token in session, try to get it from the session endpoint
          if (!accessToken) {
            console.log('🔍 JobsReport: No access token in session, trying to fetch from session endpoint...');
            try {
              const sessionResponse = await fetch('/api/auth/session-compat');
              if (sessionResponse.ok) {
                const sessionData = await sessionResponse.json();
                accessToken = sessionData?.user?.accessToken;
                console.log('🔍 JobsReport: Access token from session endpoint:', !!accessToken);
              }
            } catch (sessionError) {
              console.error('❌ JobsReport: Error fetching session:', sessionError);
            }
          }
          
          if (!accessToken) {
            console.error('❌ JobsReport: No access token available');
            throw new Error('No access token available');
          }
          
          const propertyJobs = await fetchAllJobsForProperty(selectedProperty, accessToken);
          console.log(`✅ JobsReport: Loaded ${propertyJobs.length} jobs for property ${selectedProperty}`);
          setReportJobs(propertyJobs);
        } catch (error) {
          console.error('Error loading property jobs:', error);
        } finally {
          clearLoadingAfterMinTime();
        }
      };
      
      loadPropertyJobs();
    } else if (stableProvidedJobs.length > 0) {
      setReportJobs(stableProvidedJobs);
    }
  }, [
    selectedProperty,
    stableProvidedJobs,
    session?.user?.accessToken,
    recordLoaderShown,
    clearLoadingAfterMinTime,
  ]);


  // Generate CSV export
  const handleGenerateCSV = async () => {
    if (!filteredReportJobs.length) {
      alert('No jobs match the current filters. Adjust filters or clear them to export.');
      return;
    }

    try {
      setIsGeneratingCsv(true);
      const propertyName = currentProperty?.name || `Property ${selectedProperty}`;

      const csvContent = jobsToCSV(filteredReportJobs, userProperties, {
        includeImages: false,
        includeUserDetails: true,
        includeRoomDetails: true,
        includePropertyDetails: true,
        dateFormat: 'readable'
      });

      const date = format(new Date(), 'yyyy-MM-dd');
      const filterParts = [
        statusFilter !== 'all' ? statusFilter : '',
        priorityFilter !== 'all' ? priorityFilter : '',
        pmFilter !== 'all' ? pmFilter : '',
        topicFilter === 'none'
          ? 'no-topic'
          : topicFilter !== 'all'
            ? `topic-${topicFilter}`
            : '',
        userFilter === 'none'
          ? 'no-user'
          : userFilter !== 'all'
            ? `user-${userFilter.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`
            : '',
        monthFilter !== 'all' ? `month-${monthFilter}` : '',
        yearFilter !== 'all' ? `year-${yearFilter}` : '',
        createdFrom.trim() ? `from-${createdFrom}` : '',
        createdTo.trim() ? `to-${createdTo}` : '',
      ].filter(Boolean);
      const filterSlug = filterParts.length ? `-${filterParts.join('-')}` : '';
      const filename = `${propertyName.replace(/\s+/g, '-')}-jobs-report${filterSlug}-${date}.csv`
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-');

      downloadCSV(csvContent, filename);
    } catch (error: any) {
      console.error('Error generating CSV:', error);
      alert(`Failed to generate CSV: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingCsv(false);
    }
  };

  // Check if session is still loading
  if (!session) {
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
            <p className="mt-2 text-gray-500">Loading your session...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Check if user is authenticated
  if (!session?.user?.accessToken) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Authentication Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Please log in to view the jobs report.</p>
            <p className="text-sm mt-2">You need to be authenticated to access this feature.</p>
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
          <div className="text-center py-8 text-gray-500">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Please select a property to view the jobs report.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Loading Jobs Report...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading jobs for {currentProperty?.name}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {currentProperty?.name} - Jobs Report
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Property ID: {selectedProperty}
                {filter !== 'all' ? ` · Tab filter: ${filter}` : ''}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
              <p className="text-xs text-gray-500 sm:mr-2">
                Export uses filtered rows ({filteredReportJobs.length}/{reportJobs.length})
              </p>
              <Button 
                onClick={handleGenerateCSV} 
                disabled={isGeneratingCsv || filteredReportJobs.length === 0}
                variant="outline"
                className="flex items-center gap-2"
              >
                {isGeneratingCsv ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" />
                    Export CSV ({filteredReportJobs.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filters — same scope as statistics and CSV export */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report & export filters</CardTitle>
          <p className="text-sm font-normal text-gray-500">
            Narrow jobs before export. Charts and CSV only include rows that match all selected criteria
            (including topic and user).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-9">
            <div className="space-y-1.5">
              <label htmlFor="jobs-report-status" className="text-xs font-medium text-gray-700">
                Status
              </label>
              <select
                id="jobs-report-status"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as JobStatus | 'all')}
              >
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="jobs-report-priority" className="text-xs font-medium text-gray-700">
                Priority
              </label>
              <select
                id="jobs-report-priority"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as JobPriority | 'all')}
              >
                {PRIORITY_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="jobs-report-pm" className="text-xs font-medium text-gray-700">
                Job type (PM)
              </label>
              <select
                id="jobs-report-pm"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              <label htmlFor="jobs-report-topic" className="text-xs font-medium text-gray-700">
                Topic
              </label>
              <select
                id="jobs-report-topic"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value as TopicFilterValue)}
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
              <label htmlFor="jobs-report-user" className="text-xs font-medium text-gray-700">
                User
              </label>
              <select
                id="jobs-report-user"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value as UserFilterValue)}
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
              <label htmlFor="jobs-report-from" className="text-xs font-medium text-gray-700">
                Created from
              </label>
              <input
                id="jobs-report-from"
                type="date"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="jobs-report-to" className="text-xs font-medium text-gray-700">
                Created to
              </label>
              <input
                id="jobs-report-to"
                type="date"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="jobs-report-month" className="text-xs font-medium text-gray-700">
                Month
              </label>
              <select
                id="jobs-report-month"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value as 'all' | string)}
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
              <label htmlFor="jobs-report-year" className="text-xs font-medium text-gray-700">
                Year
              </label>
              <select
                id="jobs-report-year"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value as 'all' | string)}
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-gray-600"
              onClick={() => {
                setStatusFilter('all');
                setPriorityFilter('all');
                setPmFilter('all');
                setTopicFilter('all');
                setUserFilter('all');
                setMonthFilter('all');
                setYearFilter('all');
                setCreatedFrom('');
                setCreatedTo('');
              }}
            >
              Clear filters
            </Button>
            {filteredReportJobs.length === 0 && reportJobs.length > 0 ? (
              <span className="text-xs text-amber-700">No jobs match — loosen filters to see data.</span>
            ) : null}
          </div>
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
                <p className="text-sm text-gray-500">Total</p>
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
                <p className="text-sm text-gray-500">PM jobs</p>
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
                <p className="text-sm text-gray-500">Non-PM</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              <div className="min-w-0">
                <p className="text-2xl font-bold">{statistics.completionRate}%</p>
                <p className="text-sm text-gray-500">Complete</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 shrink-0 text-orange-600" />
              <div className="min-w-0">
                <p className="text-2xl font-bold">{statistics.averageResponseTime}d</p>
                <p className="text-sm text-gray-500">Avg time</p>
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
                <p className="text-sm text-gray-500">High Prio</p>
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
            <p className="text-sm font-normal text-gray-500">
              Count per status for the current filter selection.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {filteredReportJobs.length === 0 ? (
              <div className="flex h-72 min-h-[18rem] items-center justify-center text-sm text-gray-500">
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
                    <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Jobs">
                      {statistics.jobsByStatus.map((entry, index) => (
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
            <p className="text-sm font-normal text-gray-500">
              Chronological trend from filtered jobs (tooltip includes YoY %).
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {jobsByMonthChart.length === 0 ? (
              <div className="flex h-72 min-h-[18rem] items-center justify-center text-sm text-gray-500">
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
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#6b7280" />
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
                          name === 'Jobs'
                            ? item?.payload?.jobsYoyPct
                            : item?.payload?.nightSaleYoyPct;
                        const yoy =
                          typeof rawYoy === 'number'
                            ? rawYoy
                            : typeof rawYoy === 'string'
                              ? Number(rawYoy)
                              : null;
                        const valueText =
                          typeof value === 'number'
                            ? value.toLocaleString()
                            : String(value);
                        const yoyText =
                          yoy == null || Number.isNaN(yoy) || !Number.isFinite(yoy)
                            ? 'N/A'
                            : `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%`;
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
          <p className="text-sm font-normal text-gray-500">
            Compares current month job orders and PM mix against last month and the same month last year.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredReportJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No jobs match the filters.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Month by month ({monthlyAndYearlyComparisons.monthLabel} vs {monthlyAndYearlyComparisons.previousMonthLabel})
                </h3>
                <div className="mt-3 space-y-2">
                  {monthlyAndYearlyComparisons.monthOverMonth.map((row) => (
                    <div key={`mom-${row.label}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700">{row.label}</span>
                      <span className="text-gray-500 tabular-nums">
                        {row.current} vs {row.previous}
                      </span>
                      <span
                        className={`tabular-nums font-medium ${
                          row.delta > 0 ? 'text-green-600' : row.delta < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}
                      >
                        {row.delta >= 0 ? '+' : ''}
                        {row.delta}
                        {row.deltaPct === null ? '' : ` (${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct}%)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Year to year ({monthlyAndYearlyComparisons.monthLabel} vs {monthlyAndYearlyComparisons.sameMonthLastYearLabel})
                </h3>
                <div className="mt-3 space-y-2">
                  {monthlyAndYearlyComparisons.yearOverYear.map((row) => (
                    <div key={`yoy-${row.label}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700">{row.label}</span>
                      <span className="text-gray-500 tabular-nums">
                        {row.current} vs {row.previous}
                      </span>
                      <span
                        className={`tabular-nums font-medium ${
                          row.delta > 0 ? 'text-green-600' : row.delta < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}
                      >
                        {row.delta >= 0 ? '+' : ''}
                        {row.delta}
                        {row.deltaPct === null ? '' : ` (${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct}%)`}
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
              <p className="mt-2 text-sm text-blue-700">Loading utility consumption...</p>
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
                      {monthlyAndYearlyComparisons.utility.monthOverMonthNightSale >= 0 ? '+' : ''}
                      {monthlyAndYearlyComparisons.utility.monthOverMonthNightSale.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">YoY Night Sale Δ</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility.yearOverYearNightSale >= 0 ? '+' : ''}
                      {monthlyAndYearlyComparisons.utility.yearOverYearNightSale.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Night Sale / Job order</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility.nightSalePerJobOrder.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Night Sale / PM job</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility.nightSalePerPmJob.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md border border-blue-200 bg-white/80 p-3">
                    <p className="text-blue-700">MoM Night Sale / Job order Δ</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility.monthOverMonthNightSalePerJobOrder >= 0 ? '+' : ''}
                      {monthlyAndYearlyComparisons.utility.monthOverMonthNightSalePerJobOrder.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-md border border-blue-200 bg-white/80 p-3">
                    <p className="text-blue-700">YoY Night Sale / Job order Δ</p>
                    <p className="font-semibold tabular-nums text-blue-900">
                      {monthlyAndYearlyComparisons.utility.yearOverYearNightSalePerJobOrder >= 0 ? '+' : ''}
                      {monthlyAndYearlyComparisons.utility.yearOverYearNightSalePerJobOrder.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-64 w-full rounded-md border border-blue-100 bg-white p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={[
                        {
                          period: monthlyAndYearlyComparisons.previousMonthLabel,
                          nightSale: monthlyAndYearlyComparisons.utility.previousMonthNightSale,
                          perJobOrder: monthlyAndYearlyComparisons.utility.previousMonthNightSalePerJobOrder,
                        },
                        {
                          period: monthlyAndYearlyComparisons.monthLabel,
                          nightSale: monthlyAndYearlyComparisons.utility.currentNightSale,
                          perJobOrder: monthlyAndYearlyComparisons.utility.nightSalePerJobOrder,
                        },
                        {
                          period: monthlyAndYearlyComparisons.sameMonthLastYearLabel,
                          nightSale: monthlyAndYearlyComparisons.utility.sameMonthLastYearNightSale,
                          perJobOrder: monthlyAndYearlyComparisons.utility.sameMonthLastYearNightSalePerJobOrder,
                        },
                      ]}
                      margin={{ top: 10, right: 12, left: 6, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#1d4ed8" />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#1d4ed8" />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#0e7490" />
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
            <p className="text-sm font-normal text-gray-500">
              Based on <span className="font-medium">Preventive maintenance</span> flag on each job (
              <code className="text-xs">is_preventivemaintenance</code>).
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {filteredReportJobs.length === 0 ? (
              <div className="flex h-56 min-h-[14rem] items-center justify-center text-sm text-gray-500">
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
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#6b7280" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" allowDecimals={false} />
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
            <p className="text-sm font-normal text-gray-500">
              Horizontal bars — value labels at the end of each bar.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {filteredReportJobs.length === 0 ? (
              <div className="flex h-56 min-h-[14rem] items-center justify-center text-sm text-gray-500">
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
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#6b7280" allowDecimals={false} />
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
          <p className="text-sm font-normal text-gray-500">
            Stacked bars: <span className="text-violet-700 font-medium">PM</span> +{' '}
            <span className="text-sky-700 font-medium">Non-PM</span>. White numbers inside each segment when
            both exist; total at bar end. Same counting rules
            as before (multi-room jobs count per room; no room → &quot;No room linked&quot;).
            {roomsJobsSummary.length > ROOMS_CHART_MAX ? (
              <span className="mt-1 block text-amber-800">
                Showing top {ROOMS_CHART_MAX} rooms by job count ({roomsJobsSummary.length} rows total).
              </span>
            ) : null}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredReportJobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No jobs match the filters.</p>
          ) : roomsJobsSummary.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No room data on these jobs.</p>
          ) : (
            <div style={{ height: roomsChartHeight }} className="w-full min-h-[14rem]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={roomsChartData}
                  margin={{ top: 8, right: 52, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#6b7280" allowDecimals={false} />
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
                        <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                          <p className="font-semibold text-gray-900">{p.fullLabel}</p>
                          <p className="text-gray-500">Room ID: {p.roomId}</p>
                          <p className="text-violet-700">PM: {p.pm}</p>
                          <p className="text-sky-700">Non-PM: {p.nonPm}</p>
                          <p className="mt-1 font-medium text-gray-800">Total jobs: {p.total}</p>
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
                      content={(p) => RoomsInnerSegmentLabel(p, 'pm')}
                    />
                    <LabelList
                      dataKey="pm"
                      content={(p) => RoomsStackEndLabel(p, 'pm')}
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
                      content={(p) => RoomsInnerSegmentLabel(p, 'nonPm')}
                    />
                    <LabelList
                      dataKey="nonPm"
                      content={(p) => RoomsStackEndLabel(p, 'nonPm')}
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
          <div className="space-y-2 text-sm text-gray-600">
            <p>• Generated on: {format(new Date(), 'PPP')}</p>
            <p>• Property: {currentProperty?.name}</p>
            <p>• Total jobs in this report (after filters): {statistics.total}</p>
            <p>• PM jobs: {statistics.pmJobs} · Non-PM: {statistics.nonPmJobs}</p>
            <p>• Distinct rooms in chart data: {roomsJobsSummary.length}</p>
            <p>• Jobs loaded for property: {reportJobs.length}</p>
            <p>• Completion rate: {statistics.completionRate}%</p>
            <p>• Average response time: {statistics.averageResponseTime} days</p>
            <p>• High priority jobs requiring attention: {statistics.highPriority}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
