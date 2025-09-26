"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import _ from "lodash";
import { Job, JobStatus, STATUS_COLORS } from "@/app/lib/types";
import { useUser, useProperties, useJobs } from "@/app/lib/stores/mainStore";
import { useSession } from "@/app/lib/session.client";
import { appSignOut } from "@/app/lib/logout";
import { useDetailedUsers, DetailedUser } from "@/app/lib/hooks/useDetailedUsers";
type Session = any;
import { Button } from "@/app/components/ui/button";
import Link from "next/link";
import { Download } from "lucide-react";
import { generatePdfWithRetry, downloadPdf } from "@/app/lib/pdfUtils";
import { generatePdfBlob } from "@/app/lib/pdfRenderer";
import ChartDashboardPDF from "@/app/components/document/ChartDashboardPDF";
import html2canvas from "html2canvas";
import { jobsApi } from "@/app/lib/api/jobsApi";

interface PropertyJobsDashboardProps {
  initialJobs?: Job[];
}

const PropertyJobsDashboard = ({ initialJobs = [] }: PropertyJobsDashboardProps) => {
  // ✅ PERFORMANCE OPTIMIZATION: Memoize component props to prevent unnecessary re-renders
  const { selectedPropertyId: selectedProperty } = useUser();
  const { properties: userProperties } = useProperties();
  const { data: session, status, refresh } = useSession();
  const { jobs, setJobs } = useJobs();
  const { users: detailedUsers, loading: usersLoading } = useDetailedUsers();

  // Basic mobile breakpoint detection for responsive chart tuning
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const updateIsMobile = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => window.removeEventListener('resize', updateIsMobile);
  }, []);

  // Since we don't have jobCreationCount in the new store, we'll use jobs length as a proxy
  const jobCreationCount = jobs.length;
  const [allJobs, setAllJobs] = useState<Job[]>(initialJobs);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>(initialJobs);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [chartImages, setChartImages] = useState<{
    pieChart?: string;
    barChart?: string;
  }>({});

  // Backend stats (server authoritative counts)
  const [backendStats, setBackendStats] = useState<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    waitingSparepart: number;
    defect: number;
    preventiveMaintenance: number;
  } | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // ✅ PERFORMANCE OPTIMIZATION: Memoize the current property ID to reduce unnecessary re-renders
  const effectiveProperty = useMemo(() => {
    return selectedProperty || (userProperties.length > 0 ? String(userProperties[0].property_id || userProperties[0].id) : null);
  }, [selectedProperty, userProperties]);

  // Simplified session refresh
  const refreshSession = async () => {
    try {
      await refresh();
      return true;
    } catch (err) {
      setError("Session expired. Please log in again.");
      appSignOut({ redirect: true });
      return false;
    }
  };

  // Load jobs for dashboard: prefer initialJobs (server-fetched full set) over store
  const loadJobs = () => {
    if (status !== "authenticated" || !session?.user) {
      // Use initialJobs if available even when not authenticated
      if (initialJobs && initialJobs.length > 0) {
        setAllJobs(initialJobs);
        setFilteredJobs(initialJobs);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Prefer initialJobs if provided (they may contain the full dataset for dashboard)
      if (Array.isArray(initialJobs) && initialJobs.length > 0) {
        setAllJobs(initialJobs);
        setFilteredJobs(initialJobs);
        // Optionally sync store if store has fewer items than server-provided list
        if (!Array.isArray(jobs) || jobs.length < initialJobs.length) {
          setJobs(initialJobs);
        }
      } else if (Array.isArray(jobs) && jobs.length > 0) {
        setAllJobs(jobs);
      } else {
        setAllJobs([]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load jobs";
      console.error('loadJobs error:', err);
      setError(errorMessage);
      setAllJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Populate store with initial jobs when component mounts
  useEffect(() => {
    if (initialJobs && initialJobs.length > 0 && (!jobs || jobs.length === 0)) {
      setJobs(initialJobs);
      setAllJobs(initialJobs);
      setFilteredJobs(initialJobs);
    }
  }, [initialJobs, jobs, setJobs]);

  // Fetch backend job stats to ensure totals are not limited by pagination
  useEffect(() => {
    const token = session?.user?.accessToken;
    if (!token) {
      setBackendStats(null);
      return;
    }

    const fetchStats = async () => {
      try {
        setIsStatsLoading(true);
        const stats = await jobsApi.getJobStats(
          token,
          effectiveProperty ? { property_id: effectiveProperty } : undefined
        );
        setBackendStats(stats);
      } catch (e) {
        // Non-fatal: fall back to client-computed counts
        setBackendStats(null);
      } finally {
        setIsStatsLoading(false);
      }
    };

    fetchStats();
  }, [session?.user?.accessToken, effectiveProperty, jobCreationCount]);

  // Function to capture chart as image
  const captureChartAsImage = async (chartId: string): Promise<string | null> => {
    try {
      const chartElement = document.getElementById(chartId);
      if (!chartElement) {
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      const canvas = await html2canvas(chartElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: chartElement.offsetWidth,
        height: chartElement.offsetHeight,
        scrollX: 0,
        scrollY: 0,
        windowWidth: chartElement.offsetWidth,
        windowHeight: chartElement.offsetHeight,
        foreignObjectRendering: false,
        removeContainer: true,
        imageTimeout: 10000,
      });
      return canvas.toDataURL('image/png', 0.9);
    } catch (error) {
      return null;
    }
  };

  // PDF Export function
  const handleExportPDF = async () => {
    if (!filteredJobs.length) {
      alert('No data available to export.');
      return;
    }

    try {
      setIsGeneratingPDF(true);
      
      // Capture charts as images
      const [pieChartImage, barChartImage] = await Promise.all([
        captureChartAsImage('pie-chart-container'),
        captureChartAsImage('bar-chart-container')
      ]);

      // If chart images are too small or empty, don't use them
      const usePieChartImage = pieChartImage && pieChartImage.length > 1000;
      const useBarChartImage = barChartImage && barChartImage.length > 1000;
      
      // Get current property name
      const currentProperty = userProperties.find(p => p.property_id === effectiveProperty);
      const propertyName = currentProperty?.name || `Property ${effectiveProperty}`;
      
      // Create PDF document with chart images
      const pdfDocument = (
        <ChartDashboardPDF
          jobs={filteredJobs}
          selectedProperty={effectiveProperty}
          propertyName={propertyName}
          jobStats={jobStats}
          jobsByMonth={jobsByMonth}
          jobsByUser={jobsByUser}
          chartImages={{
            pieChart: usePieChartImage ? pieChartImage : null,
            barChart: useBarChartImage ? barChartImage : null,
            topicChart: null,
            roomChart: null
          }}
          jobsByTopic={[]}
          jobsByRoom={[]}
        />
      );
      
      // Check if we have valid chart data
      const validJobStats = jobStats.filter(stat => {
        const percentage = parseFloat(stat.percentage);
        return percentage > 0 && stat.value > 0;
      });
      
      // Generate PDF blob
      const blob = await generatePdfWithRetry(async () => {
        return await generatePdfBlob(pdfDocument);
      });
      
      // Download PDF
      const date = new Date().toISOString().split('T')[0];
      const filename = `${propertyName.replace(/\s+/g, '-')}-chart-dashboard-${date}.pdf`;
      await downloadPdf(blob, filename);
      
    } catch (error: any) {
      alert(`Failed to generate PDF: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Load jobs when necessary
  useEffect(() => {
    loadJobs();
  }, [status, jobCreationCount]);

  // Filter jobs by property with optimized logic
  useEffect(() => {
    const user = session?.user;
    if (!allJobs.length) {
      setFilteredJobs([]);
      return;
    }

    // If no property is selected, fall back to using all jobs so charts still render
    if (!effectiveProperty) {
      setFilteredJobs(allJobs);
      return;
    }

    // Optimized filtering with less logging
    const filtered = allJobs.filter((job) => {
      // Direct property_id match
      if (job.property_id && String(job.property_id) === effectiveProperty) {
        return true;
      }
      
      // Room property match with special case handling
      if (job.rooms && job.rooms.length > 0) {
        for (const room of job.rooms) {
          if (!room?.properties?.length) continue;
          
          for (const prop of room.properties) {
            // Special case for property ID "1"
            if (prop === 1 || String(prop) === "1") return true;
            
            // Object property representation
            if (typeof prop === "object" && prop !== null && "property_id" in prop) {
              if (String((prop as { property_id: string | number }).property_id) === effectiveProperty) return true;
            }
            
            // Direct property representation
            if (String(prop) === effectiveProperty) return true;
          }
        }
      }
      
      // Job properties array match
      if (job.properties && job.properties.length) {
        for (const prop of job.properties) {
          // Special case for property ID "1"
          if (prop === 1 || String(prop) === "1") return true;
          
          // Object property representation
          if (typeof prop === "object" && prop !== null && "property_id" in prop) {
            if (String((prop as { property_id: string | number }).property_id) === effectiveProperty) return true;
          }
          
          // Direct property representation
          if (String(prop) === effectiveProperty) return true;
        }
      }
      
      return false;
    });

    setFilteredJobs(filtered);
  }, [allJobs, effectiveProperty, session?.user?.properties]);

  // ✅ PERFORMANCE OPTIMIZATION: Memoized job statistics to prevent recalculation on every render
  const jobStats = useMemo(() => {
    const total = backendStats?.total ?? filteredJobs.length;
    if (total === 0) {
      return [];
    }
    
    // Use a simple accumulator approach for performance
    const statusCounts = {} as Record<JobStatus, number>;
    
    for (const job of filteredJobs) {
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
    }

    const result = (["pending", "in_progress", "completed", "waiting_sparepart", "cancelled"] as JobStatus[]).map(
      (status) => ({
        name: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " "),
        value: backendStats
          ? (status === "pending"
              ? backendStats.pending
              : status === "in_progress"
              ? backendStats.inProgress
              : status === "completed"
              ? backendStats.completed
              : status === "waiting_sparepart"
              ? backendStats.waitingSparepart
              : backendStats.cancelled) || 0
          : statusCounts[status] || 0,
        color: STATUS_COLORS[status],
        percentage: total > 0
          ? ((backendStats
              ? (status === "pending"
                  ? backendStats.pending
                  : status === "in_progress"
                  ? backendStats.inProgress
                  : status === "completed"
                  ? backendStats.completed
                  : status === "waiting_sparepart"
                  ? backendStats.waitingSparepart
                  : backendStats.cancelled)
              : (statusCounts[status] || 0)) / total * 100).toFixed(1)
          : "0",
      })
    );
    
    // Filter out zero values for chart display
    const validStats = result.filter(stat => stat.value > 0);
    
    return validStats;
  }, [filteredJobs]);

  // ✅ PERFORMANCE OPTIMIZATION: Memoized job monthly data with optimization for large datasets
  const jobsByMonth = useMemo(() => {
    if (filteredJobs.length === 0) return [];

    // Use lodash for efficient grouping - better performance than native reduce
    const grouped = _.groupBy(filteredJobs, (job) => {
      const date = job.created_at ? new Date(job.created_at) : new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    });

    // Process grouped data
    const result = Object.entries(grouped).map(([month, monthJobs]) => {
      const [year, monthNum] = month.split("-");
      const date = new Date(parseInt(year), parseInt(monthNum) - 1);
      const formattedMonth = date.toLocaleDateString("en-US", { month: "short" });

      // Count statuses in a single pass
      const counts = {
        completed: 0,
        pending: 0,
        waiting_sparepart: 0,
        in_progress: 0,
        cancelled: 0
      };
      
      for (const job of monthJobs) {
        if (counts.hasOwnProperty(job.status)) {
          counts[job.status as keyof typeof counts]++;
        }
      }

      return {
        month: `${formattedMonth} ${year}`,
        total: monthJobs.length,
        ...counts
      };
    });

    // Sort chronologically
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return result.sort((a, b) => {
      const [aMonth, aYear] = a.month.split(" ");
      const [bMonth, bYear] = b.month.split(" ");

      if (aYear !== bYear) return parseInt(aYear) - parseInt(bYear);
      return months.indexOf(aMonth) - months.indexOf(bMonth);
    });
  }, [filteredJobs]);

  // Helper function to extract user display name with detailed user data
  const getUserDisplayName = (user: any): string => {
    if (!user) {
      return 'Unknown User';
    }
    
    // If it's an object with username field, try to find detailed user info
    if (typeof user === 'object' && user && 'username' in user) {
      // Try to find in detailed users first
      const detailedUser = detailedUsers.find(u => u.username === user.username);
      if (detailedUser) {
        // Use full name if available, otherwise clean up the username
        if (detailedUser.full_name && detailedUser.full_name.trim()) {
          return detailedUser.full_name;
        }
        // Clean up Auth0 usernames for better display
        let cleanUsername = detailedUser.username;
        if (cleanUsername.includes('auth0_') || cleanUsername.includes('google-oauth2_')) {
          cleanUsername = cleanUsername.replace(/^(auth0_|google-oauth2_)/, '');
        }
        return cleanUsername;
      }
      // Clean up Auth0 usernames for better display
      let cleanUsername = user.username;
      if (cleanUsername.includes('auth0_') || cleanUsername.includes('google-oauth2_')) {
        cleanUsername = cleanUsername.replace(/^(auth0_|google-oauth2_)/, '');
      }
      return cleanUsername;
    }
    
    // If it's a string or number, try to match with detailed users
    if (typeof user === 'string' || typeof user === 'number') {
      const userStr = String(user);
      
      // Try to match with detailed users by ID
      const detailedUser = detailedUsers.find(u => 
        u.id.toString() === userStr || 
        u.username === userStr ||
        u.email === userStr
      );
      
      if (detailedUser) {
        // Use full name if available, otherwise clean up the username
        if (detailedUser.full_name && detailedUser.full_name.trim()) {
          return detailedUser.full_name;
        }
        // Clean up Auth0 usernames for better display
        let cleanUsername = detailedUser.username;
        if (cleanUsername.includes('auth0_') || cleanUsername.includes('google-oauth2_')) {
          cleanUsername = cleanUsername.replace(/^(auth0_|google-oauth2_)/, '');
        }
        return cleanUsername;
      }
      
      // Try to match with session data as fallback
      if (session?.user) {
        const sessionUserId = String(session.user.id || '').trim();
        const sessionUsername = session.user.username || 'You';
        
        // Exact match
        if (userStr === sessionUserId) {
          return sessionUsername;
        }
        
        // Case-insensitive match
        if (userStr.toLowerCase() === sessionUserId.toLowerCase()) {
          return sessionUsername;
        }
        
        // Google OAuth ID matching
        if (userStr.includes('google-oauth2_') && sessionUserId.includes('google-oauth2_')) {
          const userNumeric = userStr.replace('google-oauth2_', '');
          const sessionNumeric = sessionUserId.replace('google-oauth2_', '');
          if (userNumeric === sessionNumeric) {
            return sessionUsername;
          }
        }
        
        // Try to match numeric IDs (common case where job user is numeric ID)
        const userNumeric = parseInt(userStr);
        const sessionNumeric = parseInt(sessionUserId);
        if (!isNaN(userNumeric) && !isNaN(sessionNumeric) && userNumeric === sessionNumeric) {
          return sessionUsername;
        }
        
        // Try to match with first_name and last_name if available
        if (session.user.first_name || session.user.last_name) {
          const fullName = `${session.user.first_name || ''} ${session.user.last_name || ''}`.trim();
          if (fullName) {
            return fullName;
          }
        }
        
        // If we have session data but no match, try to use session username as fallback
        if (session.user.username) {
          return session.user.username;
        }
      }
      
      // If it's a numeric ID, try to show it as "User #123" instead of "User 123"
      if (!isNaN(Number(userStr))) {
        return `User #${userStr}`;
      }
      
      return `User ${userStr}`;
    }
    
    if (typeof user === 'object') {
      // Try different possible fields for username
      const username = user.username || user.name || user.email || user.id;
      if (username) {
        // Try to find in detailed users
        const detailedUser = detailedUsers.find(u => 
          u.username === username || 
          u.email === username ||
          u.id.toString() === username
        );
        if (detailedUser) {
          // Use full name if available, otherwise clean up the username
          if (detailedUser.full_name && detailedUser.full_name.trim()) {
            return detailedUser.full_name;
          }
          // Clean up Auth0 usernames for better display
          let cleanUsername = detailedUser.username;
          if (cleanUsername.includes('auth0_') || cleanUsername.includes('google-oauth2_')) {
            cleanUsername = cleanUsername.replace(/^(auth0_|google-oauth2_)/, '');
          }
          return cleanUsername;
        }
        return String(username);
      }
      
      // If it's an object but no recognizable field, try to stringify it safely
      try {
        // Check if it has any enumerable properties
        const keys = Object.keys(user);
        if (keys.length > 0) {
          // Try to get the first string value
          for (const key of keys) {
            const value = user[key];
            if (typeof value === 'string' && value.trim()) {
              return value;
            }
          }
        }
      } catch (error) {
      }
      
      return 'Unknown User';
    }
    
    return 'Unknown User';
  };

  // ✅ PERFORMANCE OPTIMIZATION: Memoized jobs by user data to prevent expensive recalculations
  const jobsByUser = useMemo(() => {
    if (filteredJobs.length === 0) return [];

    // Group jobs by user using efficient lodash grouping
    const grouped = _.groupBy(filteredJobs, (job) => {
      const displayName = getUserDisplayName(job.user);
      
      // Additional check for "[object Object]" string
      if (displayName === '[object Object]' || displayName === 'User [object Object]') {
        return 'Unknown User';
      }
      return displayName;
    });

    // Process grouped data
    const result = Object.entries(grouped).map(([username, userJobs]) => {
      // Count statuses in a single pass
      const counts = {
        completed: 0,
        pending: 0,
        waiting_sparepart: 0,
        in_progress: 0,
        cancelled: 0
      };
      
      for (const job of userJobs) {
        if (counts.hasOwnProperty(job.status)) {
          counts[job.status as keyof typeof counts]++;
        }
      }

      const total = userJobs.length;
      const completionRate = total > 0 ? ((counts.completed / total) * 100).toFixed(1) : '0.0';

      return {
        username,
        total,
        ...counts,
        completionRate
      };
    });

    // Sort by total jobs (descending)
    const sortedResult = result.sort((a, b) => b.total - a.total);
    
    return sortedResult;
  }, [filteredJobs, detailedUsers, session?.user]);


  // Loading state
  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="text-center p-6 sm:p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-sm sm:text-base">Loading charts...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authentication state
  if (status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md bg-yellow-50 border border-yellow-200">
          <CardContent className="text-center space-y-4 p-6 sm:p-8">
            <p className="text-yellow-600 text-sm sm:text-base">Please log in to view job statistics.</p>
            <Button asChild variant="outline" className="w-full h-10 sm:h-12 text-sm sm:text-base">
              <Link href="/auth/login">Log In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md bg-red-50 border border-red-200">
          <CardContent className="text-center space-y-4 p-6 sm:p-8">
            <p className="text-red-600 text-sm sm:text-base">{error}</p>
            <Button asChild variant="outline" className="w-full h-10 sm:h-12 text-sm sm:text-base">
              <Link href="/dashboard/myJobs">Go to My Jobs</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No data state
  if (filteredJobs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md bg-yellow-50 border border-yellow-200">
          <CardContent className="text-center space-y-4 p-6 sm:p-8">
            <p className="text-yellow-600 text-sm sm:text-base">
              {allJobs.length ? "No jobs found for the selected property." : "No jobs available yet."}
            </p>
            <Button asChild variant="outline" className="w-full h-10 sm:h-12 text-sm sm:text-base">
              <Link href={allJobs.length ? "/dashboard/myJobs" : "/dashboard/createJob"}>
                {allJobs.length ? "View All Jobs" : "Create a Job"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main dashboard view with optimized render performance
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Section - Mobile Responsive */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Chart Dashboard</h2>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {effectiveProperty ? `Viewing data for ${userProperties.find(p => p.property_id === effectiveProperty)?.name || `Property ${effectiveProperty}`}` : 'Select a property to view data'}
          </p>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {backendStats
              ? `Showing ${filteredJobs.length} of ${backendStats.total}${isStatsLoading ? ' (updating...)' : ''}`
              : `Showing ${filteredJobs.length}`}
          </p>
        </div>
        <Button
          onClick={handleExportPDF}
          disabled={isGeneratingPDF || filteredJobs.length === 0}
          className="flex items-center gap-2 w-full sm:w-auto"
          variant="outline"
          size="sm"
        >
          {isGeneratingPDF ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="hidden sm:inline">Generating...</span>
              <span className="sm:hidden">Generating</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">Export</span>
            </>
          )}
        </Button>
      </div>

      <div className="space-y-4">
        {/* Jobs by Status Chart */}
        <Card className="w-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg sm:text-xl">Jobs by Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div id="pie-chart-container" className="w-full h-[280px] sm:h-[320px] lg:h-[360px] flex items-center justify-center">
              <div className="w-full h-full">
                {jobStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={jobStats}
                        cx="50%"
                        cy="50%"
                        innerRadius={isMobile ? 50 : 70}
                        outerRadius={isMobile ? 90 : 120}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {jobStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string, props: any) => [
                          `${value} (${props.payload.percentage}%)`,
                          name,
                        ]}
                      />
                      <Legend
                        layout="horizontal"
                        align="center"
                        verticalAlign="bottom"
                        iconSize={isMobile ? 10 : 14}
                        wrapperStyle={{ 
                          fontSize: isMobile ? 10 : 12, 
                          paddingTop: isMobile ? 4 : 8,
                          lineHeight: isMobile ? '12px' : '16px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p className="text-sm sm:text-base">No data available for chart</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Jobs by Month Chart - with limit to prevent rendering too many bars */}
        <Card className="w-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg sm:text-xl">Jobs by Month</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div id="bar-chart-container" className="h-[240px] sm:h-[280px] lg:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jobsByMonth.slice(-12)}> {/* Limit to last 12 months */}
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: isMobile ? 8 : 10 }} 
                    interval={isMobile ? 'preserveStartEnd' : 0} 
                    angle={isMobile ? -60 : -45} 
                    textAnchor="end" 
                    height={isMobile ? 90 : 70} 
                  />
                  <YAxis tick={{ fontSize: isMobile ? 8 : 10 }} width={isMobile ? 28 : 32} />
                  <Tooltip />
                  <Legend 
                    layout="horizontal" 
                    align="center" 
                    verticalAlign="bottom" 
                    iconSize={isMobile ? 8 : 10} 
                    wrapperStyle={{ 
                      fontSize: isMobile ? 8 : 10,
                      paddingTop: isMobile ? 4 : 8
                    }} 
                  />
                  <Bar dataKey="total" fill="#8884d8" name="Total Jobs" />
                  <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} />
                  <Bar dataKey="pending" stackId="a" fill={STATUS_COLORS.pending} />
                  <Bar dataKey="waiting_sparepart" stackId="a" fill={STATUS_COLORS.waiting_sparepart} name="Waiting" />
                  <Bar dataKey="in_progress" stackId="a" fill={STATUS_COLORS.in_progress} />
                  <Bar dataKey="cancelled" stackId="a" fill={STATUS_COLORS.cancelled} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Jobs per User Chart */}
        {jobsByUser && jobsByUser.length > 0 && (
          <Card className="w-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg sm:text-xl">Jobs per User</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[220px] sm:h-[260px] lg:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={jobsByUser.slice(0, 8)}> {/* Limit to top 8 users for mobile */}
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="username" 
                      tick={{ fontSize: isMobile ? 7 : 9 }} 
                      angle={isMobile ? -75 : -60}
                      textAnchor="end"
                      height={isMobile ? 110 : 100}
                      interval={isMobile ? 'preserveStartEnd' : 0}
                    />
                    <YAxis tick={{ fontSize: isMobile ? 8 : 9 }} width={isMobile ? 28 : 32} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        value,
                        name === 'total' ? 'Total Jobs' : 
                        name === 'completed' ? 'Completed' :
                        name === 'pending' ? 'Pending' :
                        name === 'in_progress' ? 'In Progress' :
                        name === 'waiting_sparepart' ? 'Waiting Parts' :
                        name === 'cancelled' ? 'Cancelled' : name
                      ]}
                    />
                    <Legend 
                      layout="horizontal" 
                      align="center" 
                      verticalAlign="bottom" 
                      iconSize={isMobile ? 8 : 10} 
                      wrapperStyle={{ 
                        fontSize: isMobile ? 8 : 10,
                        paddingTop: isMobile ? 4 : 8
                      }} 
                    />
                    <Bar dataKey="total" fill="#8884d8" name="Total Jobs" />
                    <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} />
                    <Bar dataKey="pending" stackId="a" fill={STATUS_COLORS.pending} />
                    <Bar dataKey="waiting_sparepart" stackId="a" fill={STATUS_COLORS.waiting_sparepart} name="Waiting" />
                    <Bar dataKey="in_progress" stackId="a" fill={STATUS_COLORS.in_progress} />
                    <Bar dataKey="cancelled" stackId="a" fill={STATUS_COLORS.cancelled} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Jobs per User Table */}
        {jobsByUser && jobsByUser.length > 0 && (
          <Card className="w-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg sm:text-xl">Jobs per User - Detailed View</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-700">User</th>
                      <th className="text-center py-2 px-1 sm:px-2 font-medium text-gray-700">Total</th>
                      <th className="text-center py-2 px-1 sm:px-2 font-medium text-gray-700">Done</th>
                      <th className="text-center py-2 px-1 sm:px-2 font-medium text-gray-700">Pending</th>
                      <th className="text-center py-2 px-1 sm:px-2 font-medium text-gray-700">Progress</th>
                      <th className="text-center py-2 px-1 sm:px-2 font-medium text-gray-700">Waiting</th>
                      <th className="text-center py-2 px-1 sm:px-2 font-medium text-gray-700">Cancel</th>
                      <th className="text-center py-2 px-1 sm:px-2 font-medium text-gray-700">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsByUser.map((userData, index) => (
                      <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-2 sm:px-3 font-medium text-gray-900 truncate max-w-[100px] sm:max-w-none">
                          {userData.username}
                        </td>
                        <td className="py-2 px-1 sm:px-2 text-center text-gray-700 font-medium">{userData.total}</td>
                        <td className="py-2 px-1 sm:px-2 text-center text-green-600">{userData.completed}</td>
                        <td className="py-2 px-1 sm:px-2 text-center text-yellow-600">{userData.pending}</td>
                        <td className="py-2 px-1 sm:px-2 text-center text-blue-600">{userData.in_progress}</td>
                        <td className="py-2 px-1 sm:px-2 text-center text-purple-600">{userData.waiting_sparepart}</td>
                        <td className="py-2 px-1 sm:px-2 text-center text-red-600">{userData.cancelled}</td>
                        <td className="py-2 px-1 sm:px-2 text-center">
                          <span className={`px-1 sm:px-2 py-1 rounded-full text-xs font-medium ${
                            parseFloat(userData.completionRate) >= 80 ? 'bg-green-100 text-green-800' :
                            parseFloat(userData.completionRate) >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {userData.completionRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Statistics - Memoized and optimized */}
        <Card className="w-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg sm:text-xl">Summary Statistics</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              {[
                { name: "Total Jobs", status: null },
                ...(["pending", "in_progress", "completed", "waiting_sparepart", "cancelled"] as JobStatus[]).map(
                  (status) => ({
                    name: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " "),
                    status,
                  })
                ),
              ].map((item, index) => {
                const statValue = item.status
                  ? (backendStats
                      ? (item.status === "pending"
                          ? backendStats.pending
                          : item.status === "in_progress"
                          ? backendStats.inProgress
                          : item.status === "completed"
                          ? backendStats.completed
                          : item.status === "waiting_sparepart"
                          ? backendStats.waitingSparepart
                          : backendStats.cancelled)
                      : filteredJobs.filter((job) => job.status === item.status).length)
                  : (backendStats?.total ?? filteredJobs.length);
                const color = item.status ? STATUS_COLORS[item.status] : "#8884d8";
                const percentage = item.status
                  ? ((statValue / (backendStats?.total ?? filteredJobs.length)) * 100).toFixed(1)
                  : (backendStats ? ((backendStats.total > 0 ? 100 : 0).toFixed(1)) : "100.0");

                return (
                  <div key={`stat-${index}`} className="p-3 sm:p-4 rounded-lg bg-gray-50 w-full flex flex-col">
                    <p className="text-xs sm:text-sm text-gray-500 mb-1 truncate">{item.name}</p>
                    <div className="flex flex-col sm:flex-row sm:items-baseline">
                      <p className="text-lg sm:text-xl lg:text-2xl font-semibold" style={{ color }}>
                        {statValue}
                      </p>
                      {item.status && (
                        <p className="text-xs text-gray-500 mt-1 sm:mt-0 sm:ml-2">
                          ({percentage}%)
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PropertyJobsDashboard;