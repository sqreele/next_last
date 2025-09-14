'use client';

import React, { useEffect, useState } from 'react';
import { useJobsDashboard } from '@/app/lib/hooks/useJobsDashboard';
import { useSessionGuard } from '@/app/lib/hooks/useSessionGuard';
import { Building, User, Calendar, RefreshCw, Download, Settings, Search, Filter } from 'lucide-react';
import { MobileTopBar } from '@/app/components/ui/mobile-nav';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/app/components/ui/dropdown-menu';
import { useToast } from '@/app/lib/hooks/use-toast';
import JobList from '@/app/components/jobs/jobList';
import { JobStatus } from '@/app/lib/types';

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
            Welcome back, {username}! 👋
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
              <DropdownMenuItem onClick={() => onExport('pdf')}>
                Export as PDF
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
    { value: "all", label: "All Jobs", icon: "📋", color: "bg-gray-100 text-gray-700" },
    { value: "pending", label: "Pending", icon: "⏳", color: "bg-yellow-100 text-yellow-700" },
    { value: "in_progress", label: "In Progress", icon: "🔧", color: "bg-blue-100 text-blue-700" },
    { value: "waiting_sparepart", label: "Waiting Parts", icon: "📦", color: "bg-orange-100 text-orange-700" },
    { value: "completed", label: "Completed", icon: "✅", color: "bg-green-100 text-green-700" },
    { value: "cancelled", label: "Cancelled", icon: "❌", color: "bg-red-100 text-red-700" },
    { value: "defect", label: "Defect", icon: "⚠️", color: "bg-red-100 text-red-700" },
    { value: "preventive_maintenance", label: "Maintenance", icon: "🔧", color: "bg-purple-100 text-purple-700" },
  ];

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <span className="text-3xl">⚠️</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">Dashboard Error</h1>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Mobile Top Bar */}
        <MobileTopBar />
        
        {/* Enhanced Dashboard Header */}
        <DashboardHeader
          username={user?.username || 'User'}
          onRefresh={() => refreshJobs()}
          onExport={exportJobs}
          onClearCache={clearCache}
          onToggleRealTime={handleRealTimeToggle}
          isRealTimeEnabled={stats.total > 0}
        />

        {/* Enhanced Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <StatCard
            title="Total Jobs"
            value={stats.total}
            icon={<Building className="w-6 h-6 text-blue-600" />}
            color="bg-blue-100"
            trend={trends.total}
          />
          <StatCard
            title="Pending"
            value={stats.pending}
            icon={<div className="w-6 h-6 bg-yellow-500 rounded-full animate-pulse" />}
            color="bg-yellow-100"
            trend={trends.pending}
          />
          <StatCard
            title="In Progress"
            value={stats.inProgress}
            icon={<div className="w-6 h-6 bg-orange-500 rounded-full" />}
            color="bg-orange-100"
            trend={trends.inProgress}
          />
          <StatCard
            title="Completed"
            value={stats.completed}
            icon={<div className="w-6 h-6 bg-green-500 rounded-full" />}
            color="bg-green-100"
            trend={trends.completed}
          />
        </div>

        {/* Search and Filters */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <SearchAndFilters
              search={filters.search || ''}
              onSearchChange={handleSearch}
              onFiltersChange={handleFiltersChange}
              properties={properties}
            />
          </CardContent>
        </Card>

        {/* Jobs Content with Enhanced Tabs */}
        <Card className="mt-6">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-gray-900">Maintenance Jobs</h2>
                <p className="text-sm text-gray-600">
                  {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} found
                  {loading && <span className="ml-2 text-blue-600">(Loading...)</span>}
                </p>
              </div>
              
              {/* View Mode Toggle */}
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-9 px-3"
                >
                  Grid
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-9 px-3"
                >
                  List
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Tabs
              defaultValue="all"
              className="w-full"
              value={selectedTab}
              onValueChange={setSelectedTab}
            >
              <div className="px-6 pt-4">
                {/* Desktop Tabs - Horizontal Scrollable */}
                <div className="hidden md:block overflow-x-auto">
                  <TabsList className="inline-flex h-12 items-center justify-center rounded-xl bg-gray-50 p-1 border border-gray-200">
                    {tabConfig.map(({ value, label, icon, color }) => (
                      <TabsTrigger 
                        key={value} 
                        value={value} 
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm hover:bg-gray-100 hover:text-gray-900 min-w-fit"
                      >
                        <span className="mr-2">{icon}</span>
                        {label}
                        <Badge variant="secondary" className="ml-2">
                          {value === 'all' ? stats.total : stats[value as keyof typeof stats] || 0}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </div>

              {/* Tab Content */}
              {tabConfig.map(({ value }) => (
                <TabsContent key={value} value={value} className="mt-0">
                  <JobList 
                    jobs={jobs}
                    filter={value as any}
                    properties={properties}
                    viewMode={viewMode}
                    selectedRoom={selectedRoom}
                    onRoomFilter={handleRoomFilter}
                    onRefresh={refreshJobs}
                  />
                  
                  {/* Load More Button */}
                  {hasMoreJobs && (
                    <div className="p-6 text-center">
                      <Button
                        variant="outline"
                        onClick={() => setPage(pagination.page + 1)}
                        disabled={isLoadingMore}
                        className="flex items-center gap-2"
                      >
                        {isLoadingMore ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          'Load More Jobs'
                        )}
                      </Button>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
