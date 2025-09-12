'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePreventiveMaintenance } from '@/app/lib/PreventiveContext';
import { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';
import { preventiveMaintenanceService } from '@/app/lib/PreventiveMaintenanceService';
import Image from 'next/image';

// Updated interface to match Django API response
interface FrequencyDistributionItem {
  frequency: string; // Changed to match Django API response
  count: number;     // Changed to match Django API response
}

// Helper function to get image URL
const getImageUrl = (image: any): string | null => {
  if (!image) return null;
  
  // First try to get direct URL property
  if (typeof image === 'object' && 'image_url' in image && image.image_url) {
    return image.image_url;
  }
  
  // If no direct URL but we have an ID, construct URL
  if (typeof image === 'object' && 'id' in image && image.id) {
    return `/api/images/${image.id}`;
  }
  
  // If image is just a string URL
  if (typeof image === 'string') {
    return image;
  }
  
  return null;
};

// Helper function to determine PM status
const determinePMStatus = (item: PreventiveMaintenance): string => {
  // If status is already set, return it
  if (item.status) {
    return item.status;
  }
  
  // Get current date
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Check if completed
  if (item.completed_date) {
    return 'completed';
  }
  
  // Check if scheduled date is in the past
  if (item.scheduled_date) {
    const scheduledDate = new Date(item.scheduled_date);
    if (scheduledDate < today) {
      return 'overdue';
    }
  }
  
  // Default to pending
  return 'pending';
};

// Updated helper function to safely format frequency name
const formatFrequencyName = (frequency: string | undefined | null): string => {
  if (!frequency || typeof frequency !== 'string') {
    return 'Unknown';
  }
  return frequency.charAt(0).toUpperCase() + frequency.slice(1);
};

export default function PreventiveMaintenanceDashboard() {
  // Use our store hook to access all maintenance data and actions
  const context = usePreventiveMaintenance();
  const { 
    maintenanceItems, 
    isLoading, 
    error,
    fetchMaintenanceItems
  } = context;

  // Pagination state for upcoming maintenance
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [upcomingPageSize, setUpcomingPageSize] = useState(10);
  const [upcomingItems, setUpcomingItems] = useState<PreventiveMaintenance[]>([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [upcomingLoading, setUpcomingLoading] = useState(false);

  // Debug: Log what's available in the context
  console.log('🔍 Dashboard context:', {
    hasFetchMaintenanceItems: typeof fetchMaintenanceItems === 'function',
    contextKeys: Object.keys(context),
    maintenanceItemsCount: maintenanceItems?.length || 0
  });

  // Function to fetch upcoming maintenance with pagination
  const fetchUpcomingMaintenance = useCallback(async (page: number = 1, pageSize: number = 10) => {
    setUpcomingLoading(true);
    try {
      console.log('🔍 Fetching upcoming maintenance with pagination:', { page, pageSize });
      
      const params = {
        status: 'pending',
        page: page,
        page_size: pageSize,
        ordering: 'scheduled_date'
      };

      const response = await preventiveMaintenanceService.getAllPreventiveMaintenance(params);
      
      if (response.success && response.data) {
        let items: PreventiveMaintenance[];
        let total: number;
        
        if (Array.isArray(response.data)) {
          items = response.data;
          total = response.data.length;
        } else {
          // Paginated response
          items = response.data.results || [];
          total = response.data.count || 0;
        }
        
        setUpcomingItems(items);
        setUpcomingTotal(total);
        console.log('✅ Upcoming maintenance fetched:', { items: items.length, total });
      } else {
        console.error('❌ Failed to fetch upcoming maintenance:', response.message);
        setUpcomingItems([]);
        setUpcomingTotal(0);
      }
    } catch (error) {
      console.error('❌ Error fetching upcoming maintenance:', error);
      setUpcomingItems([]);
      setUpcomingTotal(0);
    } finally {
      setUpcomingLoading(false);
    }
  }, []);

  // Transform maintenance items into statistics format for compatibility
  const statistics = useMemo(() => {
    if (!maintenanceItems || maintenanceItems.length === 0) {
      return {
        counts: { total: 0, pending: 0, overdue: 0, completed: 0 },
        frequency_distribution: [],
        upcoming: [],
        avg_completion_times: {}
      };
    }

    // Create mock statistics from maintenance items
    return {
      counts: {
        total: maintenanceItems.length,
        pending: maintenanceItems.filter((item: any) => !item.status || item.status === 'pending').length,
        overdue: maintenanceItems.filter((item: any) => item.status === 'overdue').length,
        completed: maintenanceItems.filter((item: any) => item.status === 'completed').length
      },
      frequency_distribution: [],
      upcoming: maintenanceItems.slice(0, 5), // Show first 5 items as upcoming
      avg_completion_times: {}
    };
  }, [maintenanceItems]);

  // Fetch maintenance data on component mount
  useEffect(() => {
    console.log('🔍 Dashboard: Fetching maintenance data...');
    console.log('🔍 fetchMaintenanceItems type:', typeof fetchMaintenanceItems);
    console.log('🔍 fetchMaintenanceItems value:', fetchMaintenanceItems);
    console.log('🔍 Full context object:', context);
    
    if (maintenanceItems.length === 0 && !isLoading) {
      if (typeof fetchMaintenanceItems === 'function') {
        console.log('🔍 Calling fetchMaintenanceItems...');
        fetchMaintenanceItems();
      } else {
        console.error('❌ fetchMaintenanceItems is not available:', fetchMaintenanceItems);
        console.log('🔍 Available context keys:', Object.keys(context));
        
        // Try to access the function directly from context
        if (context && typeof context.fetchMaintenanceItems === 'function') {
          console.log('🔍 Found fetchMaintenanceItems in context, calling it...');
          context.fetchMaintenanceItems();
        } else {
          console.error('❌ fetchMaintenanceItems not found in context either');
          // Try to manually fetch data using the service directly
          console.log('🔍 Attempting manual data fetch...');
          const manualFetch = async () => {
            try {
              const response = await preventiveMaintenanceService.getAllPreventiveMaintenance();
              if (response.success && response.data) {
                console.log('✅ Manual fetch successful:', response.data);
                // Note: This won't update the context, but will show data is available
              }
            } catch (error) {
              console.error('❌ Manual fetch failed:', error);
            }
          };
          manualFetch();
        }
      }
    }
  }, [maintenanceItems.length, isLoading, fetchMaintenanceItems, context]);

  // Debug effect to log data
  useEffect(() => {
    console.log('=== DASHBOARD DEBUG ===');
    console.log('Maintenance items count:', maintenanceItems?.length || 0);
    console.log('Is loading:', isLoading);
    console.log('Error:', error);
    console.log('Statistics object:', statistics);
    if (statistics) {
      console.log('Upcoming array:', statistics.upcoming);
      console.log('Upcoming length:', statistics.upcoming?.length);
      console.log('Avg completion times:', statistics.avg_completion_times);
    }
  }, [maintenanceItems, isLoading, error, statistics]);

  // Fetch upcoming maintenance with pagination
  useEffect(() => {
    fetchUpcomingMaintenance(upcomingPage, upcomingPageSize);
  }, [upcomingPage, upcomingPageSize, fetchUpcomingMaintenance]);

  // Pagination control functions
  const handlePageChange = (newPage: number) => {
    setUpcomingPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setUpcomingPageSize(newPageSize);
    setUpcomingPage(1); // Reset to first page when changing page size
  };

  const totalPages = Math.ceil(upcomingTotal / upcomingPageSize);

  // Format date
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get completion rate percentage
  const getCompletionRate = (): number => {
    if (!statistics?.counts?.total) return 0;
    return Math.round((statistics.counts.completed / statistics.counts.total) * 100);
  };

  // Status badge styling
  const getStatusBadge = (status: string): string => {
    switch (status) {
      case 'completed':
        return "bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium";
      case 'overdue':
        return "bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium";
      default:
        return "bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium";
    }
  };

  // Get maintenance title with fallback
  const getMaintenanceTitle = (item: PreventiveMaintenance): string => {
    return item.pmtitle || `Maintenance #${item.pm_id}`;
  };

  // Debug function to call service debug
  const handleDebugClick = async () => {
    try {
      await preventiveMaintenanceService.debugMaintenanceData();
    } catch (error) {
      console.error('Debug failed:', error);
    }
  };
  
  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center py-10">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-300 border-t-blue-600"></div>
          <p className="mt-2 text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <Link 
          href="/dashboard/preventive-maintenance/" 
          className="bg-gray-100 py-2 px-4 rounded-md text-gray-700 hover:bg-gray-200"
        >
          View All Maintenance Tasks
        </Link>
      </div>
    );
  }

  // If statistics is null, show a no data message
  if (!statistics || !statistics.counts) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center py-10">
          <p className="text-lg text-gray-500">No maintenance data available.</p>
          <Link 
            href="/dashboard/preventive-maintenance/create" 
            className="mt-4 inline-block bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Create Your First Maintenance Task
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Preventive Maintenance Dashboard</h1>
        <div className="flex space-x-3">
          <Link 
            href="/dashboard/preventive-maintenance" 
            className="bg-gray-100 py-2 px-4 rounded-md text-gray-700 hover:bg-gray-200"
          >
            View All Tasks
          </Link>
          <Link 
            href="/dashboard/preventive-maintenance/create" 
            className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Create New
          </Link>
        </div>
      </div>

      {/* Debug Section (remove in production) */}
      {process.env.NODE_ENV === 'development' && statistics && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-yellow-800">Debug Information</h3>
            <button 
              onClick={handleDebugClick}
              className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-300"
            >
              Run Debug
            </button>
          </div>
          <div className="text-xs text-yellow-700 space-y-1">
            <p><strong>Total tasks:</strong> {statistics.counts.total}</p>
            <p><strong>Frequency distribution count:</strong> {Object.keys(statistics.frequency_distribution || {}).length}</p>
            <p><strong>Upcoming tasks length:</strong> {statistics.upcoming?.length || 0}</p>
            <p><strong>Avg completion times keys:</strong> {Object.keys(statistics.avg_completion_times || {}).join(', ')}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-yellow-600 hover:text-yellow-800">Show raw data</summary>
              <div className="mt-2 space-y-2">
                <div>
                  <strong>Frequency Distribution:</strong>
                  <pre className="text-xs bg-yellow-100 p-2 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(statistics.frequency_distribution, null, 2)}
                  </pre>
                </div>
                <div>
                  <strong>Upcoming Tasks:</strong>
                  <pre className="text-xs bg-yellow-100 p-2 rounded mt-1 overflow-x-auto max-h-32">
                    {JSON.stringify(statistics.upcoming, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Main Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Tasks</p>
              <p className="text-3xl font-bold text-gray-900">{statistics.counts.total}</p>
            </div>
          </div>
        </div>
        
        {/* Pending */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pending</p>
              <p className="text-3xl font-bold text-gray-900">{statistics.counts.pending}</p>
            </div>
          </div>
        </div>
        
        {/* Overdue */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-red-100 text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Overdue</p>
              <p className="text-3xl font-bold text-red-600">{statistics.counts.overdue}</p>
            </div>
          </div>
        </div>
        
        {/* Completed */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Completed</p>
              <p className="text-3xl font-bold text-green-600">{statistics.counts.completed}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Completion Progress */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Completion Rate</h2>
        <div className="flex items-center mb-2">
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div 
              className="bg-green-600 h-4 rounded-full" 
              style={{ width: `${getCompletionRate()}%` }}
            ></div>
          </div>
          <span className="ml-4 text-xl font-bold">{getCompletionRate()}%</span>
        </div>
        <p className="text-sm text-gray-500">
          {statistics.counts.completed} of {statistics.counts.total} maintenance tasks completed
        </p>
      </div>
      
      {/* Frequency Distribution - Fixed to use frequency and count properties */}
      {statistics.frequency_distribution && Array.isArray(statistics.frequency_distribution) && statistics.frequency_distribution.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Maintenance Frequency Distribution</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statistics.frequency_distribution
              .filter((item: FrequencyDistributionItem) => item && typeof item === 'object' && item.frequency)
              .map((item: FrequencyDistributionItem, index: number) => (
              <div key={item.frequency || `freq-${index}`} className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-xl font-bold text-gray-900">{item.count || 0}</p>
                <p className="text-sm font-medium text-gray-500 capitalize">
                  {formatFrequencyName(item.frequency)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Average Completion Times - Using avg_completion_times data */}
      {statistics.avg_completion_times && Object.keys(statistics.avg_completion_times).length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Average Completion Times</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(statistics.avg_completion_times).map(([frequency, avgDays]) => (
              <div key={frequency} className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-xl font-bold text-gray-900">
                  {typeof avgDays === 'number' ? Math.round(avgDays) : 0} days
                </p>
                <p className="text-sm font-medium text-gray-500 capitalize">
                  {formatFrequencyName(frequency)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {typeof avgDays === 'number' && avgDays < 0 ? 'Early' : avgDays === 0 ? 'On Time' : 'Delayed'}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4">
            * Negative values indicate tasks completed early, positive values indicate delays
          </p>
        </div>
      )}
      
      {/* Enhanced Upcoming Maintenance Section */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-700">Upcoming Maintenance</h2>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                Total: {upcomingTotal} tasks
              </span>
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-500">Show:</label>
                <select
                  value={upcomingPageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-sm text-gray-500">per page</span>
              </div>
              {process.env.NODE_ENV === 'development' && (
                <button 
                  onClick={handleDebugClick}
                  className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200"
                >
                  Debug
                </button>
              )}
            </div>
          </div>
        </div>
        
        {upcomingLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-500">Loading upcoming maintenance...</p>
          </div>
        ) : upcomingItems && Array.isArray(upcomingItems) && upcomingItems.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scheduled Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Due Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Images
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {upcomingItems
                  .filter((item: PreventiveMaintenance) => item && typeof item === 'object')
                  .map((item: PreventiveMaintenance) => {
                  // Determine PM status
                  const status = item.status || determinePMStatus(item);
                  
                  // Get maintenance title
                  const title = getMaintenanceTitle(item);
                  
                  // Get image URLs - only use URL properties since before_image/after_image don't exist on type
                  const beforeImageUrl = item.before_image_url || null;
                  const afterImageUrl = item.after_image_url || null;
                  
                  return (
                    <tr key={item.pm_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-medium text-blue-600">{item.pm_id}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm truncate max-w-[200px]">
                          {title}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {formatDate(item.scheduled_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {formatDate(item.next_due_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={getStatusBadge(status)}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          {beforeImageUrl && (
                            <div className="h-10 w-10 rounded overflow-hidden border">
                              <Image 
                                src={beforeImageUrl} 
                                alt="Before" 
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                                quality={60}
                                unoptimized={beforeImageUrl.startsWith('http')}
                              />
                            </div>
                          )}
                          {afterImageUrl && (
                            <div className="h-10 w-10 rounded overflow-hidden border">
                              <Image 
                                src={afterImageUrl} 
                                alt="After" 
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                                quality={60}
                                unoptimized={afterImageUrl.startsWith('http')}
                              />
                            </div>
                          )}
                          {!beforeImageUrl && !afterImageUrl && (
                            <span className="text-xs text-gray-500">No images</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <Link 
                            href={`/preventive-maintenance/${item.pm_id}`}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </Link>
                          {status !== 'completed' && (
                            <Link 
                              href={`/preventive-maintenance/${item.pm_id}/edit?complete=true`}
                              className="text-green-600 hover:text-green-900"
                            >
                              Complete
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
            <div className="px-6 py-4 border-t bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-700">
                    Showing {((upcomingPage - 1) * upcomingPageSize) + 1} to {Math.min(upcomingPage * upcomingPageSize, upcomingTotal)} of {upcomingTotal} results
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(upcomingPage - 1)}
                    disabled={upcomingPage <= 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  {/* Page numbers */}
                  <div className="flex space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = Math.max(1, Math.min(totalPages - 4, upcomingPage - 2)) + i;
                      if (pageNum > totalPages) return null;
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-3 py-1 text-sm border rounded ${
                            pageNum === upcomingPage
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => handlePageChange(upcomingPage + 1)}
                    disabled={upcomingPage >= totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
            )}
          </>
        ) : (
          <div className="p-6 text-center">
            <div className="text-gray-400 mb-2">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 0V9a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V11a2 2 0 00-2-2v0" />
              </svg>
            </div>
            <p className="text-gray-500 mb-2">No upcoming maintenance tasks found</p>
            <p className="text-sm text-gray-400">This could mean:</p>
            <ul className="text-sm text-gray-400 mt-1 list-disc list-inside">
              <li>All tasks are completed</li>
              <li>No pending maintenance tasks exist</li>
              <li>Try adjusting your filters</li>
            </ul>
            <div className="mt-4 space-x-2">
              <Link 
                href="/dashboard/preventive-maintenance/create"
                className="inline-block bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
              >
                Create New Task
              </Link>
              <Link 
                href="/dashboard/preventive-maintenance"
                className="inline-block bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-200"
              >
                View All Tasks
              </Link>
            </div>
          </div>
        )}
      </div>
      
      {/* Quick Access */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link 
            href="/dashboard/preventive-maintenance/create"
            className="flex items-center p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-300"
          >
            <div className="p-2 rounded-full bg-blue-100 text-blue-600 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span>Create New Task</span>
          </Link>
          
          <Link 
            href="/dashboard/preventive-maintenance?status=overdue"
            className="flex items-center p-4 border rounded-lg hover:bg-red-50 hover:border-red-300"
          >
            <div className="p-2 rounded-full bg-red-100 text-red-600 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span>View Overdue Tasks</span>
          </Link>
          
          <Link 
            href="/dashboard/preventive-maintenance?status=pending"
            className="flex items-center p-4 border rounded-lg hover:bg-yellow-50 hover:border-yellow-300"
          >
            <div className="p-2 rounded-full bg-yellow-100 text-yellow-600 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span>View Pending Tasks</span>
          </Link>
        </div>
      </div>
    </div>
  );
}