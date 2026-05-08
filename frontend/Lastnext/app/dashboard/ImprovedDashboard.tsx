'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useJobsDashboard } from '@/app/lib/hooks/useJobsDashboard';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import { RefreshCw, Download, Settings, Search, Filter, ClipboardList, Timer, CheckCircle2, AlertTriangle, Users, Calendar } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent, CardHeader } from '@/app/components/ui/card';
import { Tabs } from '@/app/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/app/components/ui/dropdown-menu';
import { useToast } from '@/app/lib/hooks/use-toast';
import JobList from '@/app/components/jobs/jobList';
import { JobStatus } from '@/app/lib/types';
import { KpiWidget, PageHeader, SectionCard, StatusBadge, WorkspaceCard } from '@/app/components/pcms-ui';

// Enhanced statistics card component
const StatCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  trend?: { value: number; isPositive: boolean };
}> = ({ title, value, icon, color, trend }) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {trend && (
            <div className="flex items-center space-x-1">
              <span className={`text-sm ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs text-gray-500">vs last week</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

// Enhanced search and filter component
const SearchAndFilters: React.FC<{
  search: string;
  onSearchChange: (value: string) => void;
  onFiltersChange: (filters: any) => void;
  properties: any[];
}> = ({ search, onSearchChange, onFiltersChange, properties }) => (
  <div className="space-y-4">
    {/* Search Bar */}
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
      <Input
        placeholder="Search jobs by title, description, or ID..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="pl-10 pr-4 py-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
      />
    </div>

    {/* Advanced Filters */}
    <div className="flex flex-wrap gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80 p-4">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Property</label>
              <select
                className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                onChange={(e) => onFiltersChange({ property: e.target.value || undefined })}
              >
                <option value="">All Properties</option>
                {properties.map((property) => (
                  <option key={property.property_id} value={property.property_id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">Date Range</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  placeholder="From"
                  onChange={(e) => onFiltersChange({ dateFrom: e.target.value || undefined })}
                />
                <Input
                  type="date"
                  placeholder="To"
                  onChange={(e) => onFiltersChange({ dateTo: e.target.value || undefined })}
                />
              </div>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onFiltersChange({})}
        className="text-gray-600 hover:text-gray-800"
      >
        Clear All
      </Button>
    </div>
  </div>
);

// Enhanced dashboard header with actions
const DashboardHeader: React.FC<{
  username: string;
  onRefresh: () => void;
  onExport: (format: 'csv' | 'excel' | 'pdf') => void;
  onClearCache: () => void;
  onToggleRealTime: () => void;
  isRealTimeEnabled: boolean;
}> = ({ username, onRefresh, onExport, onClearCache, onToggleRealTime, isRealTimeEnabled }) => (
  <Card>
    <CardHeader className="pb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Welcome back, {username}
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Manage your maintenance jobs and property operations
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="w-4 h-4" />
            <span>{new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</span>
          </div>
        </div>
      </div>
    </CardHeader>
    
    <CardContent>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          
          <Button
            variant={isRealTimeEnabled ? "default" : "outline"}
            size="sm"
            onClick={onToggleRealTime}
            className="flex items-center gap-2"
          >
            <div className={`w-2 h-2 rounded-full ${isRealTimeEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
            {isRealTimeEnabled ? 'Real-time ON' : 'Real-time OFF'}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport('csv')}>
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('excel')}>
                Export as Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onClearCache}>
                Clear Cache
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Main improved dashboard component
export default function ImprovedDashboard() {
  const { user, isAuthenticated, isLoading } = useSessionGuard();
  const { toast } = useToast();
  
  // Add room filtering state
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  
  const {
    // State
    jobs,
    properties,
    loading,
    error,
    stats,
    filters,
    viewMode,
    selectedTab,
    pagination,
    
    // Computed values
    filteredJobs,
    isLoadingMore,
    hasMoreJobs,
    
    // Actions
    refreshJobs,
    updateJobStatus,
    deleteJob,
    updateFilters,
    setViewMode,
    setSelectedTab,
    setPage,
    setPageSize,
    
    // Real-time
    enableRealTime,
    disableRealTime,
    
    // Cache and export
    clearCache,
    exportJobs,
    
    // Trends
    trends,
  } = useJobsDashboard();

  // Enable real-time updates on mount
  useEffect(() => {
    enableRealTime();
    return () => disableRealTime();
  }, [enableRealTime, disableRealTime]);

  // Handle search
  const handleSearch = (searchTerm: string) => {
    updateFilters({ search: searchTerm });
  };

  // Handle filter changes
  const handleFiltersChange = (newFilters: any) => {
    updateFilters(newFilters);
  };

  // Handle real-time toggle
  const handleRealTimeToggle = () => {
    if (stats.total > 0) {
      enableRealTime();
    } else {
      disableRealTime();
    }
  };

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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-950">Recent maintenance jobs</h2>
              <p className="text-sm text-slate-500">Board/table hybrid workflow with status filters and pagination.</p>
            </div>
            <div className="relative min-w-0 lg:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search job number, room, area, category..."
                value={filters.search || ''}
                onChange={(e) => handleSearch(e.target.value)}
                className="h-11 w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
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
  );}
