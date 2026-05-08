'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useJobsDashboard } from '@/app/lib/hooks/useJobsDashboard';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  Plus,
  RefreshCw,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import JobList from '@/app/components/jobs/jobList';
import { Job, JobStatus } from '@/app/lib/types';
import {
  EmptyState,
  KpiWidget,
  PageHeader,
  PriorityBadge,
  SectionCard,
  SkeletonCard,
  StatusBadge,
  WorkspaceCard,
  humanize,
  normalizePriority,
  normalizeStatus,
} from '@/app/components/pcms-ui';

const STATUS_SUMMARY = [
  { value: 'pending', label: 'Open' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_sparepart', label: 'Waiting Spare Part' },
  { value: 'waiting_vendor', label: 'Waiting Vendor' },
  { value: 'completed', label: 'Completed' },
  { value: 'verified', label: 'Verified' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'defect', label: 'Defect' },
];

const TAB_CONFIG = [
  { value: 'all', label: 'All Maintenance Jobs' },
  { value: 'pending', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_sparepart', label: 'Waiting Spare Part' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'defect', label: 'Defect' },
  { value: 'preventive_maintenance', label: 'Preventive Maintenance' },
];

function getUserName(user: Job['user']) {
  if (!user) return 'Unassigned';
  if (typeof user === 'string' || typeof user === 'number') return `Technician ${user}`;
  return user.username || user.email || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Assigned technician';
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

function isOverdue(job: Job) {
  if (job.completed_at || job.status === 'completed' || job.status === 'cancelled') return false;
  const createdAt = new Date(job.created_at).getTime();
  if (Number.isNaN(createdAt)) return false;
  const ageInDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
  return ageInDays >= 3 || normalizePriority(job.urgency || job.priority) === 'critical';
}

function DashboardLoading() {
  return (
    <div className="pcms-dashboard" aria-busy="true" aria-live="polite">
      <div className="pcms-page-header">
        <div>
          <p className="pcms-eyebrow">Property Care Maintenance System</p>
          <h1>KPI Dashboard</h1>
          <p className="pcms-page-description">Loading dashboard...</p>
        </div>
      </div>
      <SectionCard title="KPI Summary" description="Loading dashboard metrics and maintenance job totals.">
        <div className="pcms-kpi-grid">
          {Array.from({ length: 7 }).map((_, index) => <SkeletonCard key={index} />)}
        </div>
      </SectionCard>
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

  const dashboardMetrics = useMemo(() => {
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

    const priorityCounts = jobs.reduce<Record<string, number>>((acc, job) => {
      const priority = normalizePriority(job.urgency || job.priority);
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, { low: 0, medium: 0, high: 0, critical: 0 });

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

    return {
      total,
      open: countByStatus.open || 0,
      inProgress: countByStatus.in_progress || 0,
      completed,
      verified,
      overdue,
      completionRate,
      statusCounts: countByStatus,
      priorityCounts,
      categoryRows: Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6),
      technicianRows: Object.entries(technicianMap)
        .map(([name, values]) => ({
          name,
          assigned: values.assigned,
          completed: values.completed,
          rate: values.assigned > 0 ? Math.round((values.completed / values.assigned) * 100) : 0,
        }))
        .sort((a, b) => b.assigned - a.assigned)
        .slice(0, 6),
      recentJobs: [...jobs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8),
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
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-xl">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-10 w-10 text-red-600" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">Unable to load KPI Dashboard</h1>
              <p className="text-gray-600">{error}</p>
            </div>
            <Button onClick={refreshJobs} className="w-full">Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasNoMaintenanceData = !loading && dashboardMetrics.total === 0 && jobs.length === 0;

  return (
    <div className="pcms-dashboard">
      <PageHeader
        title="KPI Dashboard"
        description="Hotel maintenance overview, job progress, and technician performance."
        actions={
          <div className="pcms-dashboard-actions">
            <Link href="/dashboard/create-job" className="pcms-action-button inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Create Maintenance Job
            </Link>
            <Link href="/dashboard/jobs-report" className="pcms-secondary-button inline-flex items-center gap-2">
              <FileText className="h-4 w-4" /> View Reports
            </Link>
            <button onClick={() => refreshJobs()} className="pcms-secondary-button inline-flex items-center gap-2" aria-label="Refresh dashboard data">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        }
      />

      {hasNoMaintenanceData ? (
        <EmptyState
          title="No maintenance data yet."
          description="Create the first maintenance job to start tracking hotel operations, progress, and technician performance."
          action={<Link href="/dashboard/create-job" className="pcms-action-button inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Create Maintenance Job</Link>}
        />
      ) : (
        <>
          <SectionCard title="KPI Summary" description="Executive maintenance snapshot for GM, Owner, and Chief Engineer review.">
            <div className="pcms-kpi-grid">
              <KpiWidget label="Total Jobs" value={dashboardMetrics.total} tone="blue" detail="All visible maintenance jobs" />
              <KpiWidget label="Open Jobs" value={dashboardMetrics.open} tone="violet" detail="Awaiting assignment or review" />
              <KpiWidget label="In Progress" value={dashboardMetrics.inProgress} tone="orange" detail="Currently being handled" />
              <KpiWidget label="Completed" value={dashboardMetrics.completed} tone="green" detail="Finished by technicians" />
              <KpiWidget label="Verified" value={dashboardMetrics.verified} tone="teal" detail="Confirmed by supervisor" />
              <KpiWidget label="Overdue" value={dashboardMetrics.overdue} tone="red" detail="Critical or older than 3 days" />
              <KpiWidget label="Completion Rate" value={`${dashboardMetrics.completionRate}%`} tone="blue" detail="Completed plus verified jobs" />
            </div>
          </SectionCard>

          <div className="pcms-dashboard-grid pcms-dashboard-grid--operations">
            <SectionCard title="Jobs by Status" description="Strong workflow colors make bottlenecks easy to scan.">
              <div className="pcms-status-summary-grid">
                {STATUS_SUMMARY.map((status) => {
                  const normalized = normalizeStatus(status.value);
                  const count = dashboardMetrics.statusCounts[normalized] || 0;
                  const percentage = dashboardMetrics.total > 0 ? Math.round((count / dashboardMetrics.total) * 100) : 0;
                  return (
                    <button
                      key={status.value}
                      type="button"
                      onClick={() => setSelectedTab(status.value === 'assigned' || status.value === 'verified' || status.value === 'waiting_vendor' ? 'all' : status.value)}
                      className={`pcms-status-summary-card pcms-status-summary-card--${normalized}`}
                    >
                      <span className="pcms-status-summary-card__label">{status.label}</span>
                      <strong>{count}</strong>
                      <span className="pcms-status-summary-card__meta">{percentage}% of jobs</span>
                      <span className="pcms-status-summary-card__bar"><span style={{ width: `${percentage}%` }} /></span>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Jobs by Priority" description="Critical maintenance work is highlighted for fast escalation.">
              <div className="pcms-priority-summary">
                {(['critical', 'high', 'medium', 'low'] as const).map((priority) => {
                  const count = dashboardMetrics.priorityCounts[priority] || 0;
                  const percentage = dashboardMetrics.total > 0 ? Math.round((count / dashboardMetrics.total) * 100) : 0;
                  return (
                    <div key={priority} className={`pcms-priority-row pcms-priority-row--${priority}`}>
                      <div className="pcms-priority-row__main">
                        <PriorityBadge priority={priority} />
                        <span>{priority === 'critical' ? 'Immediate escalation' : `${humanize(priority)} priority jobs`}</span>
                      </div>
                      <div className="pcms-priority-row__numbers">
                        <strong>{count}</strong>
                        <span>{percentage}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <div className="pcms-dashboard-grid pcms-dashboard-grid--insights">
            <SectionCard title="Jobs by Category" description="Top maintenance categories from current hotel job data.">
              <div className="pcms-category-list">
                {dashboardMetrics.categoryRows.length > 0 ? dashboardMetrics.categoryRows.map(([category, count]) => {
                  const percentage = dashboardMetrics.total > 0 ? Math.round((count / dashboardMetrics.total) * 100) : 0;
                  return (
                    <div key={category} className="pcms-category-row">
                      <div>
                        <strong>{category}</strong>
                        <span>{percentage}% of maintenance jobs</span>
                      </div>
                      <b>{count}</b>
                    </div>
                  );
                }) : <p className="pcms-muted-copy">No category data available yet.</p>}
              </div>
            </SectionCard>

            <SectionCard title="Technician Performance" description="Assigned jobs, completions, and completion rate by technician.">
              <div className="pcms-tech-list">
                {dashboardMetrics.technicianRows.length > 0 ? dashboardMetrics.technicianRows.map((row) => (
                  <div key={row.name} className="pcms-tech-row">
                    <div className="pcms-tech-row__name"><UserRound className="h-4 w-4" /><span>{row.name}</span></div>
                    <div className="pcms-tech-row__stats">
                      <span><b>{row.assigned}</b> Assigned</span>
                      <span><b>{row.completed}</b> Completed</span>
                      <span><b>{row.rate}%</b> Rate</span>
                    </div>
                  </div>
                )) : <p className="pcms-muted-copy">No technician assignments available yet.</p>}
              </div>
            </SectionCard>
          </div>

          <WorkspaceCard className="pcms-recent-jobs-card">
            <div className="pcms-recent-jobs-card__header">
              <div>
                <h2>Recent Maintenance Jobs</h2>
                <p>Clean job list for daily engineering standups and owner visibility.</p>
              </div>
              <button onClick={() => exportJobs('csv')} className="pcms-secondary-button inline-flex items-center gap-2" aria-label="Export maintenance jobs as CSV">
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>

            <div className="pcms-dashboard-tabs" role="tablist" aria-label="Maintenance job status filters">
              {TAB_CONFIG.map(({ value, label }, index) => (
                <button
                  key={value}
                  ref={(element) => { tabRefs.current[index] = element; }}
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

            <div className="pcms-recent-table" aria-label="Recent maintenance jobs overview">
              <div className="pcms-recent-table__head">
                <span>Job</span><span>Room / Area</span><span>Status</span><span>Priority</span><span>Technician</span><span>Created</span>
              </div>
              {dashboardMetrics.recentJobs.map((job) => (
                <Link key={job.job_id || job.id} href={`/dashboard/jobs/${job.job_id}`} className="pcms-recent-table__row">
                  <span className="pcms-recent-table__job"><b>#{job.job_id}</b><em>{job.topics?.[0]?.title || job.title || 'Maintenance Job'}</em></span>
                  <span>{getRoomOrArea(job)}</span>
                  <span><StatusBadge status={job.status} /></span>
                  <span><PriorityBadge priority={job.urgency || job.priority} /></span>
                  <span>{getUserName(job.user)}</span>
                  <span>{formatDate(job.created_at)}</span>
                </Link>
              ))}
            </div>

            <div className="pcms-recent-mobile-list">
              {dashboardMetrics.recentJobs.map((job) => (
                <Link key={job.job_id || job.id} href={`/dashboard/jobs/${job.job_id}`} className="pcms-recent-mobile-card">
                  <div className="pcms-recent-mobile-card__top">
                    <span>#{job.job_id}</span>
                    <StatusBadge status={job.status} />
                  </div>
                  <h3>{job.topics?.[0]?.title || job.title || 'Maintenance Job'}</h3>
                  <div className="pcms-recent-mobile-card__meta">
                    <span><ClipboardList className="h-3.5 w-3.5" /> {getRoomOrArea(job)}</span>
                    <span><Users className="h-3.5 w-3.5" /> {getUserName(job.user)}</span>
                    <span><CalendarDays className="h-3.5 w-3.5" /> {formatDate(job.created_at)}</span>
                  </div>
                  <div className="pcms-recent-mobile-card__footer"><PriorityBadge priority={job.urgency || job.priority} /><ArrowRight className="h-4 w-4" /></div>
                </Link>
              ))}
            </div>

            <div className="pcms-job-board-wrap">
              <div className="pcms-job-board-wrap__title">
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

            {hasMoreJobs && (
              <div className="pcms-load-more-row">
                <button onClick={() => setPage(pagination.page + 1)} disabled={isLoadingMore} className="pcms-secondary-button">
                  {isLoadingMore ? 'Loading maintenance jobs...' : 'Load more maintenance jobs'}
                </button>
              </div>
            )}
          </WorkspaceCard>
        </>
      )}
    </div>
  );
}
