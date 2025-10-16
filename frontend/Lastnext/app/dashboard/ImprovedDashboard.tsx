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
    <div className="min-h-screen bg-white">
      {/* Instagram-style header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => refreshJobs()} 
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Instagram-style stories/stats section */}
        <div className="px-4 py-6 border-b border-gray-200">
          <div className="flex items-center gap-6 overflow-x-auto pb-2">
            <div className="flex flex-col items-center min-w-[80px]">
              <div className="w-16 h-16 bg-gradient-to-tr from-purple-500 to-pink-500 rounded-full p-0.5">
                <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{stats.total}</span>
                </div>
              </div>
              <span className="text-xs text-gray-500 mt-1">Total</span>
            </div>
            <div className="flex flex-col items-center min-w-[80px]">
              <div className="w-16 h-16 bg-gradient-to-tr from-yellow-400 to-orange-500 rounded-full p-0.5">
                <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{stats.pending}</span>
                </div>
              </div>
              <span className="text-xs text-gray-500 mt-1">Pending</span>
            </div>
            <div className="flex flex-col items-center min-w-[80px]">
              <div className="w-16 h-16 bg-gradient-to-tr from-blue-400 to-blue-600 rounded-full p-0.5">
                <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{stats.inProgress}</span>
                </div>
              </div>
              <span className="text-xs text-gray-500 mt-1">In Progress</span>
            </div>
            <div className="flex flex-col items-center min-w-[80px]">
              <div className="w-16 h-16 bg-gradient-to-tr from-orange-400 to-orange-600 rounded-full p-0.5">
                <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{stats.waitingSparepart}</span>
                </div>
              </div>
              <span className="text-xs text-gray-500 mt-1">Waiting Parts</span>
            </div>
            <div className="flex flex-col items-center min-w-[80px]">
              <div className="w-16 h-16 bg-gradient-to-tr from-green-400 to-green-600 rounded-full p-0.5">
                <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{stats.completed}</span>
                </div>
              </div>
              <span className="text-xs text-gray-500 mt-1">Completed</span>
            </div>
            <div className="flex flex-col items-center min-w-[80px]">
              <div className="w-16 h-16 bg-gradient-to-tr from-purple-400 to-purple-600 rounded-full p-0.5">
                <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{stats.preventiveMaintenance}</span>
                </div>
              </div>
              <span className="text-xs text-gray-500 mt-1">PM</span>
            </div>
          </div>
        </div>

        {/* Instagram-style search */}
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={filters.search || ''}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-lg text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 transition-all"
            />
          </div>
        </div>

        {/* Instagram-style tabs */}
        <div className="border-b border-gray-200">
          <div className="px-4">
            <Tabs
              defaultValue="all"
              className="w-full"
              value={selectedTab}
              onValueChange={setSelectedTab}
            >
              {/* Instagram-style horizontal scrolling tabs */}
              <div className="flex items-center justify-between py-3">
                <div className="flex-1 overflow-x-auto">
                  <div className="flex gap-8 min-w-max">
                    {tabConfig.map(({ value, label, icon }) => (
                      <button
                        key={value}
                        onClick={() => setSelectedTab(value)}
                        className={`flex items-center gap-2 pb-3 border-b-2 transition-colors whitespace-nowrap ${
                          selectedTab === value
                            ? 'border-gray-900 text-gray-900'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <span className="text-sm">{icon}</span>
                        <span className="text-sm font-medium">{label}</span>
                        <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                          {value === 'all' ? stats.total : 
                           value === 'in_progress' ? stats.inProgress :
                           value === 'waiting_sparepart' ? stats.waitingSparepart :
                           value === 'preventive_maintenance' ? stats.preventiveMaintenance :
                           stats[value as keyof typeof stats] || 0}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* View Mode Toggle - Instagram style */}
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-md transition-colors ${
                      viewMode === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-md transition-colors ${
                      viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Instagram-style content area */}
              {tabConfig.map(({ value }) => (
                <div key={value} className={selectedTab === value ? 'block' : 'hidden'}>
                  <div className="bg-white">
                    <JobList 
                      jobs={jobs}
                      filter={value as any}
                      properties={properties}
                      viewMode={viewMode}
                      selectedRoom={selectedRoom}
                      onRoomFilter={handleRoomFilter}
                      onRefresh={refreshJobs}
                    />
                    
                    {/* Instagram-style load more */}
                    {hasMoreJobs && (
                      <div className="px-4 py-6 text-center border-t border-gray-200">
                        <button
                          onClick={() => setPage(pagination.page + 1)}
                          disabled={isLoadingMore}
                          className="text-blue-500 text-sm font-medium hover:text-blue-700 disabled:text-gray-400 transition-colors"
                        >
                          {isLoadingMore ? 'Loading...' : 'Load more jobs'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
