'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useJobsDashboard } from '@/app/lib/hooks/useJobsDashboard';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import { RefreshCw, Download, Timer, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import JobList from '@/app/components/jobs/jobList';
import { JobStatus } from '@/app/lib/types';
import { KpiWidget, PageHeader, SectionCard, StatusBadge, WorkspaceCard } from '@/app/components/pcms-ui';

// Main improved dashboard component
export default function ImprovedDashboard() {
  useSessionGuard();
  
  // Add room filtering state
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  
  const {
    // State
    jobs,
    properties,
    error,
    stats,
    viewMode,
    selectedTab,
    pagination,
    
    // Computed values
    isLoadingMore,
    hasMoreJobs,
    
    // Actions
    refreshJobs,
    setSelectedTab,
    setPage,
    
    // Real-time
    enableRealTime,
    disableRealTime,
    
    // Export
    exportJobs,
  } = useJobsDashboard();

  // Enable real-time updates on mount
  useEffect(() => {
    enableRealTime();
    return () => disableRealTime();
  }, [enableRealTime, disableRealTime]);

  // Handle room filter changes
  const handleRoomFilter = (roomId: string | null) => {
    setSelectedRoom(roomId);
  };

  // Tab configuration
  const tabConfig = [
    { value: "all", label: "All Maintenance Jobs" },
    { value: "pending", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "waiting_sparepart", label: "Waiting Spare Part" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "defect", label: "Defect" },
    { value: "preventive_maintenance", label: "Preventive Maintenance" },
  ];

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    const lastIndex = tabConfig.length - 1;
    let nextIndex = index;

    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;

    setSelectedTab(tabConfig[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-10 w-10 text-red-600" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">Unable to load KPI Dashboard</h1>
              <p className="text-gray-600">{error}</p>
            </div>
            <Button onClick={refreshJobs} className="w-full">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI Dashboard"
        description="Monitor hotel maintenance jobs, room issues, technician workload, and management reporting from one operations workspace."
        actions={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => refreshJobs()} className="pcms-secondary-button inline-flex items-center gap-2" aria-label="Refresh dashboard data">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button onClick={() => exportJobs('csv')} className="pcms-action-button inline-flex items-center gap-2" aria-label="Export maintenance jobs as CSV">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiWidget label="Total Maintenance Jobs" value={stats.total} tone="blue" detail="All active property care records" />
        <KpiWidget label="Open Jobs" value={stats.pending} tone="violet" detail="Needs Chief Engineer review" />
        <KpiWidget label="In Progress" value={stats.inProgress} tone="orange" detail="Technicians currently assigned" />
        <KpiWidget label="Completed" value={stats.completed} tone="green" detail="Ready for verification or report" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <SectionCard title="Jobs by status" description="Color-coded workflow states for fast scanning.">
          <div className="grid gap-3 sm:grid-cols-2">
            {tabConfig.slice(1, 7).map(({ value, label }) => (
              <button key={value} onClick={() => setSelectedTab(value)} className="flex min-h-[56px] items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40">
                <span className="font-semibold text-slate-700">{label}</span>
                <StatusBadge status={value} />
              </button>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Technician performance" description="Operational snapshot for Chief Engineer, GM, and Owner review.">
          <div className="grid gap-3">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><span className="flex items-center gap-2 font-semibold text-slate-700"><Users className="h-4 w-4 text-blue-600" /> Assigned technicians</span><strong>{stats.inProgress + stats.completed}</strong></div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><span className="flex items-center gap-2 font-semibold text-slate-700"><Timer className="h-4 w-4 text-orange-600" /> Waiting spare part</span><strong>{stats.waitingSparepart}</strong></div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><span className="flex items-center gap-2 font-semibold text-slate-700"><CheckCircle2 className="h-4 w-4 text-green-600" /> Preventive maintenance</span><strong>{stats.preventiveMaintenance}</strong></div>
          </div>
        </SectionCard>
      </div>

      <WorkspaceCard>
        <div className="border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-slate-950">Recent maintenance jobs</h2>
            <p className="text-sm text-slate-500">Board/table hybrid workflow with status filters and pagination.</p>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Maintenance job status filters">
            {tabConfig.map(({ value, label }, index) => (
              <button
                key={value}
                ref={(element) => { tabRefs.current[index] = element; }}
                role="tab"
                aria-selected={selectedTab === value}
                onClick={() => setSelectedTab(value)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`min-h-[40px] whitespace-nowrap rounded-full border px-4 text-sm font-bold transition ${selectedTab === value ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tabConfig.map(({ value }) => (
          <div key={value} hidden={selectedTab !== value}>
            {selectedTab === value && (
              <JobList
                jobs={jobs}
                filter={value as JobStatus}
                properties={properties}
                viewMode={viewMode}
                selectedRoom={selectedRoom}
                onRoomFilter={handleRoomFilter}
                onRefresh={refreshJobs}
              />
            )}
          </div>
        ))}
        {hasMoreJobs && (
          <div className="border-t border-slate-200 p-4 text-center">
            <button onClick={() => setPage(pagination.page + 1)} disabled={isLoadingMore} className="pcms-secondary-button">
              {isLoadingMore ? 'Loading maintenance jobs...' : 'Load more maintenance jobs'}
            </button>
          </div>
        )}
      </WorkspaceCard>
    </div>
  );
}
