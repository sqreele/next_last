'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useJobsDashboard } from '@/app/lib/hooks/useJobsDashboard';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Hammer,
  MoreVertical,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Timer,
  TrendingUp,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import JobList from '@/app/components/jobs/jobList';
import { Job, JobStatus } from '@/app/lib/types';
import { getDisplayName } from '@/app/lib/utils/display-name';
import {
  PriorityBadge,
  SkeletonCard,
  StatusBadge,
  humanize,
  normalizePriority,
  normalizeStatus,
} from '@/app/components/pcms-ui';
import { SkeletonList, SkeletonTable } from '@/app/components/ui/loading';
import { MobileKpiStrip } from '@/app/components/dashboard/MobileKpiStrip';
import { RecentActivityFeed } from '@/app/components/dashboard/RecentActivityFeed';
import { TechnicianKpiBoard } from '@/app/components/dashboard/TechnicianKpiBoard';

type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary';

const STATUS_SUMMARY: Array<{ value: string; label: string; tone: StatTone }> = [
  { value: 'pending', label: 'Open', tone: 'primary' },
  { value: 'assigned', label: 'Assigned', tone: 'info' },
  { value: 'in_progress', label: 'In Progress', tone: 'warning' },
  { value: 'waiting_sparepart', label: 'Waiting Spare Part', tone: 'warning' },
  { value: 'waiting_vendor', label: 'Waiting Vendor', tone: 'warning' },
  { value: 'completed', label: 'Completed', tone: 'success' },
  { value: 'verified', label: 'Verified', tone: 'success' },
  { value: 'cancelled', label: 'Cancelled', tone: 'danger' },
  { value: 'defect', label: 'Defect', tone: 'danger' },
];

const TAB_CONFIG = [
  { value: 'all', label: 'All Jobs' },
  { value: 'pending', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_sparepart', label: 'Waiting Spare Part' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'defect', label: 'Defect' },
  { value: 'preventive_maintenance', label: 'Preventive' },
];

function getUserName(user: Job['user']) {
  return getDisplayName(user, 'Unknown Technician');
}

function getRoomOrArea(job: Job) {
  return job.room_name || job.rooms?.[0]?.name || 'Not assigned';
}

function formatDate(dateString?: string | null) {
  if (!dateString) return 'Not set';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeTime(dateString?: string | null) {
  if (!dateString) return '';
  const date = new Date(dateString).getTime();
  if (Number.isNaN(date)) return '';
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateString);
}

function isOverdue(job: Job) {
  if (job.completed_at || job.status === 'completed' || job.status === 'cancelled') return false;
  const createdAt = new Date(job.created_at).getTime();
  if (Number.isNaN(createdAt)) return false;
  const ageInDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
  return ageInDays >= 3 || normalizePriority(job.urgency || job.priority) === 'critical';
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'NA';
}

const STATUS_TONE: Record<string, StatTone> = {
  open: 'primary',
  pending: 'primary',
  assigned: 'info',
  in_progress: 'warning',
  waiting_sparepart: 'warning',
  waiting_spare_part: 'warning',
  waiting_vendor: 'warning',
  waiting_fix_defect: 'warning',
  completed: 'success',
  verified: 'success',
  cancelled: 'danger',
  defect: 'danger',
};

function statusTone(status?: string): StatTone {
  return STATUS_TONE[normalizeStatus(status || '')] || 'secondary';
}

function DashboardLoading() {
  return (
    <div className="sneat-dashboard" aria-busy="true" aria-live="polite">
      <div className="sneat-page-header">
        <div className="sneat-page-header__title">
          <h1>KPI Dashboard</h1>
          <p>Loading maintenance overview...</p>
        </div>
      </div>
      <div className="sneat-top-row">
        <div className="sneat-welcome-card" />
        <div className="sneat-stat-grid sneat-stat-grid--4">
          {Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}
        </div>
      </div>
    </div>
  );
}

export default function ImprovedDashboard() {
  useSessionGuard();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const {
    jobs,
    properties,
    loading,
    error,
    stats,
    viewMode,
    selectedTab,
    pagination,
    isLoadingMore,
    hasMoreJobs,
    refreshJobs,
    setSelectedTab,
    setPage,
    enableRealTime,
    disableRealTime,
    exportJobs,
  } = useJobsDashboard();

  useEffect(() => {
    enableRealTime();
    return () => disableRealTime();
  }, [enableRealTime, disableRealTime]);

  const metrics = useMemo(() => {
    const countByStatus = STATUS_SUMMARY.reduce<Record<string, number>>((acc, status) => {
      acc[normalizeStatus(status.value)] = 0;
      return acc;
    }, {});

    jobs.forEach((job) => {
      const normalized = normalizeStatus(job.status);
      countByStatus[normalized] = (countByStatus[normalized] || 0) + 1;
      if (job.is_defective) countByStatus.defect = (countByStatus.defect || 0) + 1;
    });

    countByStatus.open = stats.pending || countByStatus.open || 0;
    countByStatus.in_progress = stats.inProgress || countByStatus.in_progress || 0;
    countByStatus.waiting_spare_part = stats.waitingSparepart || countByStatus.waiting_spare_part || 0;
    countByStatus.completed = stats.completed || countByStatus.completed || 0;
    countByStatus.cancelled = stats.cancelled || countByStatus.cancelled || 0;
    countByStatus.defect = stats.defect || countByStatus.defect || 0;

    const total = stats.total || jobs.length;
    const completed = countByStatus.completed || 0;
    const verified = countByStatus.verified || 0;
    const overdue = jobs.filter(isOverdue).length;
    const completionRate = total > 0 ? Math.round(((completed + verified) / total) * 100) : 0;

    const priorityCounts = jobs.reduce<Record<string, number>>(
      (acc, job) => {
        const priority = normalizePriority(job.urgency || job.priority);
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
      },
      { low: 0, medium: 0, high: 0, critical: 0 },
    );

    const categoryCounts = jobs.reduce<Record<string, number>>((acc, job) => {
      const category = job.category || job.topics?.[0]?.title || 'General maintenance';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    const technicianMap = jobs.reduce<Record<string, { assigned: number; completed: number }>>((acc, job) => {
      const name = getUserName(job.user);
      if (!acc[name]) acc[name] = { assigned: 0, completed: 0 };
      acc[name].assigned += 1;
      if (job.status === 'completed' || normalizeStatus(job.status) === 'verified') acc[name].completed += 1;
      return acc;
    }, {});

    // Weekly bar series (last 7 days job count)
    const buckets: Array<{ label: string; count: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      buckets.push({
        label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3),
        count: 0,
      });
    }
    jobs.forEach((job) => {
      const created = new Date(job.created_at);
      if (Number.isNaN(created.getTime())) return;
      created.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 6) {
        buckets[6 - diffDays].count += 1;
      }
    });
    const weeklyMax = Math.max(1, ...buckets.map((b) => b.count));
    const peakIndex = buckets.reduce((idx, b, i) => (b.count > buckets[idx].count ? i : idx), 0);

    // Week-over-week deltas: jobs created/completed/overdue in last 7 days vs the 7 days before.
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const last7Start = now - 7 * dayMs;
    const prior7Start = now - 14 * dayMs;
    let totalLast = 0;
    let totalPrior = 0;
    let openLast = 0;
    let openPrior = 0;
    let completedLast = 0;
    let completedPrior = 0;
    let overdueLast = 0;
    let overduePrior = 0;
    jobs.forEach((job) => {
      const created = new Date(job.created_at).getTime();
      if (!Number.isNaN(created)) {
        if (created >= last7Start) totalLast += 1;
        else if (created >= prior7Start) totalPrior += 1;
      }
      const status = normalizeStatus(job.status);
      if (status === 'pending' || status === 'open') {
        if (!Number.isNaN(created)) {
          if (created >= last7Start) openLast += 1;
          else if (created >= prior7Start) openPrior += 1;
        }
      }
      if ((status === 'completed' || status === 'verified') && job.completed_at) {
        const c = new Date(job.completed_at).getTime();
        if (!Number.isNaN(c)) {
          if (c >= last7Start) completedLast += 1;
          else if (c >= prior7Start) completedPrior += 1;
        }
      }
      if (isOverdue(job) && !Number.isNaN(created)) {
        if (created >= last7Start) overdueLast += 1;
        else if (created >= prior7Start) overduePrior += 1;
      }
    });
    const deltas = {
      total: totalLast - totalPrior,
      open: openLast - openPrior,
      completed: completedLast - completedPrior,
      overdue: overdueLast - overduePrior,
    };

    return {
      total,
      open: countByStatus.open || 0,
      inProgress: countByStatus.in_progress || 0,
      completed,
      verified,
      overdue,
      completionRate,
      deltas,
      statusCounts: countByStatus,
      priorityCounts,
      categoryRows: Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
      technicianRows: Object.entries(technicianMap)
        .map(([name, values]) => ({
          name,
          assigned: values.assigned,
          completed: values.completed,
          rate: values.assigned > 0 ? Math.round((values.completed / values.assigned) * 100) : 0,
        }))
        .sort((a, b) => b.assigned - a.assigned)
        .slice(0, 5),
      recentJobs: [...jobs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6),
      timelineJobs: [...jobs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
      weeklyBuckets: buckets,
      weeklyMax,
      weeklyPeakIndex: peakIndex,
      weeklyTotal: buckets.reduce((sum, b) => sum + b.count, 0),
    };
  }, [jobs, stats]);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const lastIndex = TAB_CONFIG.length - 1;
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;
    setSelectedTab(TAB_CONFIG[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  };

  if (loading && jobs.length === 0) return <DashboardLoading />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--sneat-body-bg)' }}>
        <Card className="w-full max-w-xl">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: 'var(--sneat-danger-soft)' }}>
              <AlertTriangle className="h-10 w-10" style={{ color: 'var(--sneat-danger)' }} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--sneat-text-strong)' }}>Unable to load KPI Dashboard</h1>
              <p style={{ color: 'var(--sneat-text-muted)' }}>{error}</p>
            </div>
            <Button onClick={refreshJobs} className="w-full">Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasNoMaintenanceData = !loading && metrics.total === 0 && jobs.length === 0;
  const peakDayLabel = metrics.weeklyBuckets[metrics.weeklyPeakIndex]?.label ?? '';

  return (
    <div className="sneat-dashboard">
      {/* Page header */}
      <div className="sneat-page-header">
        <div className="sneat-page-header__title">
          <h1>KPI Dashboard</h1>
          <p>Hotel maintenance overview, job progress, and technician performance.</p>
        </div>
        <div className="sneat-page-actions">
          <Link href="/dashboard/create-job" className="sneat-btn sneat-btn--primary">
            <Plus className="h-4 w-4" /> Create Job
          </Link>
          <Link href="/dashboard/jobs-report" className="sneat-btn sneat-btn--ghost">
            <FileText className="h-4 w-4" /> Reports
          </Link>
          <button
            type="button"
            onClick={() => refreshJobs()}
            disabled={loading}
            className="sneat-btn sneat-btn--neutral"
            aria-label="Refresh dashboard data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {hasNoMaintenanceData ? (
        <div className="sneat-card sneat-card--pad-lg" style={{ textAlign: 'center', alignItems: 'center', gap: '0.75rem' }}>
          <div className="sneat-stat-card__icon sneat-stat-card__icon--primary" style={{ width: '3rem', height: '3rem' }}>
            <Sparkles className="h-5 w-5" />
          </div>
          <h2>No maintenance data yet</h2>
          <p className="sneat-muted">Create the first maintenance job to start tracking hotel operations.</p>
          <Link href="/dashboard/create-job" className="sneat-btn sneat-btn--primary">
            <Plus className="h-4 w-4" /> Create Maintenance Job
          </Link>
        </div>
      ) : (
        <>
          {/* New unified KPI strip — swipeable on mobile, grid on desktop. */}
          <MobileKpiStrip
            total={metrics.total}
            open={metrics.open}
            inProgress={metrics.inProgress}
            completed={metrics.completed}
            overdue={metrics.overdue}
            waitingParts={metrics.statusCounts.waiting_spare_part || metrics.statusCounts.waiting_sparepart || 0}
            completionRate={metrics.completionRate}
            deltas={metrics.deltas}
          />

          {/* Top row: Welcome card + 4 stat cards */}
          <div className="sneat-top-row">
            <div className="sneat-welcome-card">
              <span className="sneat-welcome-card__eyebrow">Welcome back</span>
              <h2>Operations on track!</h2>
              <p className="sneat-welcome-card__lead">
                {metrics.completionRate}% of maintenance work is complete this period. Keep momentum on open and overdue jobs.
              </p>
              <span className="sneat-welcome-card__big">{metrics.completionRate}%</span>
              <span className="sneat-welcome-card__caption">Completion rate across {metrics.total} jobs</span>
              <Link href="/dashboard/jobs-report" className="sneat-btn sneat-btn--primary sneat-welcome-card__cta">
                View Report <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="sneat-welcome-card__art" aria-hidden="true">
                <Wrench className="h-10 w-10" />
              </div>
            </div>

            <div className="sneat-stat-grid sneat-stat-grid--4">
              <div className="sneat-stat-card">
                <div className="sneat-stat-card__top">
                  <span className="sneat-stat-card__icon sneat-stat-card__icon--primary"><ClipboardList className="h-5 w-5" /></span>
                  <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                </div>
                <span className="sneat-stat-card__label">Total Jobs</span>
                <strong className="sneat-stat-card__value">{metrics.total}</strong>
                <span className="sneat-stat-card__delta sneat-stat-card__delta--up">
                  <TrendingUp className="h-3.5 w-3.5" /> All maintenance jobs
                </span>
              </div>

              <div className="sneat-stat-card">
                <div className="sneat-stat-card__top">
                  <span className="sneat-stat-card__icon sneat-stat-card__icon--info"><Clock className="h-5 w-5" /></span>
                  <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                </div>
                <span className="sneat-stat-card__label">Open</span>
                <strong className="sneat-stat-card__value">{metrics.open}</strong>
                <span className="sneat-muted">Awaiting assignment</span>
              </div>

              <div className="sneat-stat-card">
                <div className="sneat-stat-card__top">
                  <span className="sneat-stat-card__icon sneat-stat-card__icon--warning"><Hammer className="h-5 w-5" /></span>
                  <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                </div>
                <span className="sneat-stat-card__label">In Progress</span>
                <strong className="sneat-stat-card__value">{metrics.inProgress}</strong>
                <span className="sneat-muted">Currently handled</span>
              </div>

              <div className="sneat-stat-card">
                <div className="sneat-stat-card__top">
                  <span className="sneat-stat-card__icon sneat-stat-card__icon--success"><CheckCircle2 className="h-5 w-5" /></span>
                  <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                </div>
                <span className="sneat-stat-card__label">Completed</span>
                <strong className="sneat-stat-card__value">{metrics.completed}</strong>
                <span className="sneat-stat-card__delta sneat-stat-card__delta--up">
                  <ArrowUpRight className="h-3.5 w-3.5" /> {metrics.verified} verified
                </span>
              </div>

              <div className="sneat-stat-card">
                <div className="sneat-stat-card__top">
                  <span className="sneat-stat-card__icon sneat-stat-card__icon--danger"><ShieldAlert className="h-5 w-5" /></span>
                  <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                </div>
                <span className="sneat-stat-card__label">Overdue</span>
                <strong className="sneat-stat-card__value">{metrics.overdue}</strong>
                <span className="sneat-muted">Critical or 3+ days old</span>
              </div>

              <div className="sneat-stat-card">
                <div className="sneat-stat-card__top">
                  <span className="sneat-stat-card__icon sneat-stat-card__icon--secondary"><Timer className="h-5 w-5" /></span>
                  <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                </div>
                <span className="sneat-stat-card__label">Waiting Parts</span>
                <strong className="sneat-stat-card__value">{metrics.statusCounts.waiting_spare_part || 0}</strong>
                <span className="sneat-muted">Blocked on inventory</span>
              </div>

              <div className="sneat-stat-card">
                <div className="sneat-stat-card__top">
                  <span className="sneat-stat-card__icon sneat-stat-card__icon--primary"><Users className="h-5 w-5" /></span>
                  <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                </div>
                <span className="sneat-stat-card__label">Active Techs</span>
                <strong className="sneat-stat-card__value">{metrics.technicianRows.length}</strong>
                <span className="sneat-muted">Top contributors</span>
              </div>

              <div className="sneat-stat-card">
                <div className="sneat-stat-card__top">
                  <span className="sneat-stat-card__icon sneat-stat-card__icon--info"><Activity className="h-5 w-5" /></span>
                  <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                </div>
                <span className="sneat-stat-card__label">Completion Rate</span>
                <strong className="sneat-stat-card__value">{metrics.completionRate}%</strong>
                <span className="sneat-muted">Completed + verified</span>
              </div>
            </div>
          </div>

          {/* Mid row: weekly chart + donut */}
          <div className="sneat-mid-grid">
            <div className="sneat-chart-card">
              <div className="sneat-card__head">
                <div>
                  <h2>Weekly Maintenance Activity</h2>
                  <p className="sneat-card__subtitle">Jobs created in the last 7 days &middot; peak on {peakDayLabel}</p>
                </div>
                <div className="sneat-chart-card__legend">
                  <span className="sneat-legend-pill"><span className="sneat-legend-pill__dot" /> Created</span>
                  <span className="sneat-legend-pill sneat-legend-pill--success"><span className="sneat-legend-pill__dot" /> Peak day</span>
                </div>
              </div>
              <div className="sneat-bars" role="img" aria-label="Weekly job creation chart">
                {metrics.weeklyBuckets.map((bucket, idx) => {
                  const heightPct = Math.max(8, Math.round((bucket.count / metrics.weeklyMax) * 100));
                  const isPeak = idx === metrics.weeklyPeakIndex && metrics.weeklyMax > 0;
                  return (
                    <div className="sneat-bars__item" key={`${bucket.label}-${idx}`}>
                      <span className={`sneat-bars__bar ${isPeak ? 'sneat-bars__bar--filled' : ''}`} style={{ height: `${heightPct}%` }} />
                      <span className="sneat-bars__label">{bucket.label}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <p className="sneat-muted">7-day total</p>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--sneat-text-strong)' }}>{metrics.weeklyTotal} jobs</strong>
                </div>
                <Link href="/dashboard/jobs" className="sneat-btn sneat-btn--ghost">
                  View Jobs <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="sneat-card sneat-card--pad-lg">
              <div className="sneat-card__head">
                <div>
                  <h2>Jobs by Priority</h2>
                  <p className="sneat-card__subtitle">Critical work is highlighted for escalation</p>
                </div>
                <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
                <div
                  className="sneat-donut"
                  style={{
                    ['--p' as any]: metrics.total > 0 ? Math.round(((metrics.priorityCounts.critical || 0) / metrics.total) * 100) : 0,
                  }}
                  aria-hidden="true"
                >
                  <div className="sneat-donut__inner">
                    <strong>{metrics.priorityCounts.critical || 0}</strong>
                    <span>Critical</span>
                  </div>
                </div>
              </div>
              <div className="sneat-divider" />
              <div className="sneat-list">
                {(['critical', 'high', 'medium', 'low'] as const).map((priority) => {
                  const count = metrics.priorityCounts[priority] || 0;
                  const percentage = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
                  return (
                    <div key={priority} className="sneat-list__row">
                      <span><PriorityBadge priority={priority} /></span>
                      <div>
                        <div className="sneat-list__title">{humanize(priority)} priority</div>
                        <div className="sneat-list__caption">{percentage}% of jobs</div>
                      </div>
                      <span className="sneat-list__value">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Status distribution + Recent transactions analog */}
          <div className="sneat-mid-grid">
            <div className="sneat-card sneat-card--pad-lg">
              <div className="sneat-card__head">
                <div>
                  <h2>Job Status Distribution</h2>
                  <p className="sneat-card__subtitle">Workflow bottlenecks at a glance</p>
                </div>
                <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
              </div>
              <div className="sneat-list">
                {STATUS_SUMMARY.map((status) => {
                  const normalized = normalizeStatus(status.value);
                  const count = metrics.statusCounts[normalized] || 0;
                  const percentage = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
                  return (
                    <button
                      type="button"
                      key={status.value}
                      onClick={() =>
                        setSelectedTab(
                          status.value === 'assigned' || status.value === 'verified' || status.value === 'waiting_vendor'
                            ? 'all'
                            : status.value,
                        )
                      }
                      className="sneat-list__row"
                      style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span className={`sneat-list__icon sneat-stat-card__icon--${status.tone}`}>
                        <Activity className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="sneat-list__title">{status.label}</div>
                        <div className="sneat-list__caption">{percentage}% of jobs</div>
                      </div>
                      <span className="sneat-list__value">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="sneat-card sneat-card--pad-lg">
                <SkeletonList rows={4} />
              </div>
            ) : (
              <RecentActivityFeed jobs={jobs} limit={10} />
            )}
          </div>

          {/* Technician performance board — sortable table on desktop, stacked
              cards on phones. Hidden when nobody has any work yet. */}
          {!loading && (
            <TechnicianKpiBoard jobs={jobs} />
          )}

          {/* Categories + Technicians + Activity timeline */}
          <div className="sneat-mid-grid">
            <div className="sneat-card sneat-card--pad-lg">
              <div className="sneat-card__head">
                <div>
                  <h2>Top Categories</h2>
                  <p className="sneat-card__subtitle">Where maintenance effort concentrates</p>
                </div>
                <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
              </div>
              <div className="sneat-list">
                {metrics.categoryRows.length > 0 ? (
                  metrics.categoryRows.map(([category, count]) => {
                    const percentage = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
                    return (
                      <div key={category} className="sneat-list__row">
                        <span className="sneat-list__icon sneat-stat-card__icon--primary">
                          <ClipboardList className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="sneat-list__title">{category}</div>
                          <div className="sneat-list__caption">{percentage}% of maintenance jobs</div>
                        </div>
                        <span className="sneat-list__value">{count}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="sneat-muted">No category data available yet.</p>
                )}
              </div>
              <div className="sneat-divider" />
              <div>
                <h3 style={{ fontSize: '0.9375rem', marginBottom: '0.5rem' }}>Technician Performance</h3>
                <div className="sneat-list">
                  {metrics.technicianRows.length > 0 ? (
                    metrics.technicianRows.map((row) => (
                      <div key={row.name} className="sneat-list__row">
                        <span className="sneat-tx-row__avatar">{getInitials(row.name)}</span>
                        <div>
                          <div className="sneat-list__title">{row.name}</div>
                          <div className="sneat-list__caption">{row.assigned} assigned &middot; {row.completed} done</div>
                        </div>
                        <span className={`sneat-chip sneat-chip--${row.rate >= 75 ? 'success' : row.rate >= 50 ? 'warning' : 'danger'}`}>
                          {row.rate}%
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="sneat-muted">No technician assignments available yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="sneat-card sneat-card--pad-lg">
              <div className="sneat-card__head">
                <div>
                  <h2>Activity Timeline</h2>
                  <p className="sneat-card__subtitle">Most recent maintenance updates</p>
                </div>
                <button type="button" className="sneat-card__menu" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
              </div>
              {metrics.timelineJobs.length === 0 ? (
                <p className="sneat-muted">No activity yet.</p>
              ) : (
                <div className="sneat-timeline">
                  {metrics.timelineJobs.map((job) => {
                    const tone = statusTone(job.status);
                    const title = job.topics?.[0]?.title || job.title || 'Maintenance Job';
                    return (
                      <div key={job.job_id || job.id} className={`sneat-timeline__item sneat-timeline__item--${tone}`}>
                        <div className="sneat-timeline__top">
                          <span className="sneat-timeline__title">#{job.job_id} &middot; {title}</span>
                          <span className="sneat-timeline__time">{relativeTime(job.created_at)}</span>
                        </div>
                        <p className="sneat-timeline__body">
                          {getRoomOrArea(job)} &middot; assigned to {getUserName(job.user)}
                        </p>
                        <div style={{ marginTop: '0.4rem', display: 'inline-flex', gap: '0.35rem' }}>
                          <StatusBadge status={job.status} />
                          <PriorityBadge priority={job.urgency || job.priority} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent jobs board with tabs (existing JobList) */}
          <div className="sneat-card sneat-card--pad-lg">
            <div className="sneat-card__head">
              <div>
                <h2>Maintenance Job Board</h2>
                <p className="sneat-card__subtitle">Filter by status and drill into the live job list</p>
              </div>
              <button
                type="button"
                onClick={() => exportJobs('csv')}
                disabled={loading || jobs.length === 0}
                className="sneat-btn sneat-btn--ghost"
                aria-label="Export maintenance jobs as CSV"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>

            <div className="sneat-tabs" role="tablist" aria-label="Maintenance job status filters">
              {TAB_CONFIG.map(({ value, label }, index) => (
                <button
                  key={value}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  role="tab"
                  aria-selected={selectedTab === value}
                  onClick={() => setSelectedTab(value)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={selectedTab === value ? 'is-active' : ''}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <SkeletonTable rows={6} columns={6} />
            ) : (
              <div className="sneat-board">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--sneat-text-muted)', fontSize: '0.8125rem' }}>
                  <BarChart3 className="h-4 w-4" /> Filtered maintenance job board
                </div>
                {TAB_CONFIG.map(({ value }) => (
                  <div key={value} hidden={selectedTab !== value}>
                    {selectedTab === value && (
                      <JobList
                        jobs={jobs}
                        filter={value as JobStatus}
                        properties={properties}
                        viewMode={viewMode}
                        selectedRoom={selectedRoom}
                        onRoomFilter={setSelectedRoom}
                        onRefresh={refreshJobs}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {hasMoreJobs && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setPage(pagination.page + 1)}
                  disabled={isLoadingMore}
                  className="sneat-btn sneat-btn--ghost"
                >
                  {isLoadingMore ? 'Loading more jobs...' : 'Load more maintenance jobs'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
