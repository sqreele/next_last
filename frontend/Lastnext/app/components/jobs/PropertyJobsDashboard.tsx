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

interface PropertyJobsDashboardProps {
  initialJobs?: Job[];
}

const PropertyJobsDashboard = ({ initialJobs = [] }: PropertyJobsDashboardProps) => {
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

  // Memoize the current property ID to reduce unnecessary re-renders
  const effectiveProperty = useMemo(() => {
    return selectedProperty || (userProperties.length > 0 ? userProperties[0].property_id : null);
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

  // Load jobs from store instead of API call
  const loadJobs = () => {
    console.log('loadJobs called:', {
      status,
      hasSession: !!session,
      hasUser: !!session?.user,
      storeJobsLength: jobs?.length || 0,
      initialJobsLength: initialJobs?.length || 0
    });
    
    if (status !== "authenticated" || !session?.user) {
      console.log('loadJobs: Not authenticated or no user, using initialJobs');
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
      // Use jobs already available in the store or fall back to initialJobs
      if (Array.isArray(jobs) && jobs.length > 0) {
        console.log(`loadJobs: Using ${jobs.length} jobs from store`);
        setAllJobs(jobs);
      } else if (Array.isArray(initialJobs) && initialJobs.length > 0) {
        console.log(`loadJobs: Using ${initialJobs.length} initialJobs`);
        setAllJobs(initialJobs);
      } else {
        console.log('loadJobs: No jobs available from store or initialJobs');
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
    console.log('PropertyJobsDashboard - Mount effect:', {
      initialJobsLength: initialJobs?.length || 0,
      storeJobsLength: jobs?.length || 0,
      sessionStatus: status,
      selectedProperty: effectiveProperty,
      userProperties: userProperties.map(p => ({ id: p.property_id, name: p.name }))
    });
    
    if (initialJobs && initialJobs.length > 0 && (!jobs || jobs.length === 0)) {
      console.log('Initial jobs:', initialJobs);
      console.log('Sample job data:', initialJobs[0]);
      console.log('Job topics:', initialJobs[0]?.topics);
      console.log('Job rooms:', initialJobs[0]?.rooms);
      setJobs(initialJobs);
      setAllJobs(initialJobs);
      setFilteredJobs(initialJobs);
    }
  }, [initialJobs, jobs, setJobs]);

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
      console.log('No jobs to filter - allJobs is empty');
      setFilteredJobs([]);
      return;
    }

    // If no property is selected, fall back to using all jobs so charts still render
    if (!effectiveProperty) {
      console.log('No property selected - using all jobs');
      setFilteredJobs(allJobs);
      return;
    }

    console.log(`Filtering ${allJobs.length} jobs for property: ${effectiveProperty}`);
    
    // Temporarily show all jobs to debug
    const debugMode = true; // Set to false to enable filtering
    
    if (debugMode) {
      console.log('DEBUG MODE: Showing all jobs without filtering');
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

    console.log(`Filtered to ${filtered.length} jobs`);
    setFilteredJobs(filtered);
  }, [allJobs, effectiveProperty, session?.user?.properties]);

  // Memoized job statistics
  const jobStats = useMemo(() => {
    const total = filteredJobs.length;
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
        value: statusCounts[status] || 0,
        color: STATUS_COLORS[status],
        percentage: total > 0 ? ((statusCounts[status] || 0) / total * 100).toFixed(1) : "0",
      })
    );
    
    // Filter out zero values for chart display
    const validStats = result.filter(stat => stat.value > 0);
    
    return validStats;
  }, [filteredJobs]);

  // Memoized job monthly data with optimization for large datasets
  const jobsByMonth = useMemo(() => {
    if (filteredJobs.length === 0) return [];

    // Use lodash for efficient grouping
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

  // Memoized jobs by user data
  const jobsByUser = useMemo(() => {
    if (filteredJobs.length === 0) return [];

    // Group jobs by user
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
      <Card className="w-full p-4">
        <CardContent className="text-center">
          <p className="text-gray-600 text-base">Loading charts...</p>
        </CardContent>
      </Card>
    );
  }

  // Authentication state
  if (status === "unauthenticated") {
    return (
      <Card className="w-full p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <CardContent className="text-center space-y-4">
          <p className="text-yellow-600 text-base">Please log in to view job statistics.</p>
          <Button asChild variant="outline" className="w-full h-12 text-base">
            <Link href="/auth/login">Log In</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="w-full p-4 bg-red-50 border border-yellow-200 rounded-md">
        <CardContent className="text-center space-y-4">
          <p className="text-red-600 text-base">{error}</p>
          <Button asChild variant="outline" className="w-full h-12 text-base">
            <Link href="/dashboard/myJobs">Go to My Jobs</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (filteredJobs.length === 0) {
    return (
      <Card className="w-full p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <CardContent className="text-center space-y-4">
          <p className="text-yellow-600 text-base">
            {allJobs.length ? "No jobs found for the selected property." : "No jobs available yet."}
          </p>
          <Button asChild variant="outline" className="w-full h-12 text-base">
            <Link href={allJobs.length ? "/dashboard/myJobs" : "/dashboard/createJob"}>
              {allJobs.length ? "View All Jobs" : "Create a Job"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Main dashboard view with optimized render performance
  return (
    <div className="space-y-4 px-2 sm:px-3 md:px-0">
      {/* PDF Export Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Chart Dashboard</h2>
          <p className="text-gray-600">
            {effectiveProperty ? `Viewing data for ${userProperties.find(p => p.property_id === effectiveProperty)?.name || `Property ${effectiveProperty}`}` : 'Select a property to view data'}
          </p>
        </div>
        <Button
          onClick={handleExportPDF}
          disabled={isGeneratingPDF || filteredJobs.length === 0}
          className="flex items-center gap-2 w-full sm:w-auto"
          variant="outline"
        >
          {isGeneratingPDF ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Generating...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Export PDF
            </>
          )}
        </Button>
      </div>

      <div className="space-y-4">
        {/* Jobs by Status Chart */}
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Jobs by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div id="pie-chart-container" className="w-full h-[300px] sm:h-[360px] flex items-center justify-center">
              <div className="w-full h-full">
                {jobStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={jobStats}
                        cx="50%"
                        cy="50%"
                        innerRadius={isMobile ? 60 : 80}
                        outerRadius={isMobile ? 100 : 140}
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
                        iconSize={isMobile ? 12 : 16}
                        wrapperStyle={{ fontSize: isMobile ? 12 : 14, paddingTop: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>No data available for chart</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Jobs by Month Chart - with limit to prevent rendering too many bars */}
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Jobs by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div id="bar-chart-container" className="h-[260px] sm:h-[320px] md:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jobsByMonth.slice(-12)}> {/* Limit to last 12 months */}
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: isMobile ? 9 : 10 }} interval={isMobile ? 'preserveStartEnd' : 0} angle={isMobile ? -45 : -30} textAnchor="end" height={isMobile ? 80 : 60} />
                  <YAxis tick={{ fontSize: isMobile ? 9 : 10 }} width={32} />
                  <Tooltip />
                  <Legend layout="horizontal" align="center" verticalAlign="bottom" iconSize={isMobile ? 10 : 12} wrapperStyle={{ fontSize: isMobile ? 10 : 12 }} />
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

        {/* Temporary Debug Info */}
        <Card className="w-full bg-yellow-50 border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg text-yellow-800">Data Analysis (Debug Mode Enabled)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-2">
              <div className="p-2 bg-orange-100 rounded mb-3 text-orange-800">
                <strong>⚠️ Debug Mode Active:</strong> Showing all jobs without property filtering to diagnose the issue.
              </div>
              <div>Session Status: <strong>{status}</strong></div>
              <div>Selected Property: <strong>{effectiveProperty || 'None'}</strong></div>
              <div>User Properties: <strong>{userProperties.length}</strong> - {userProperties.map(p => p.name).join(', ')}</div>
              <div>Initial Jobs Passed: <strong>{initialJobs.length}</strong></div>
              <div>All Jobs in State: <strong>{allJobs.length}</strong></div>
              <div>Total filtered jobs: <strong>{filteredJobs.length}</strong></div>
              <div>Jobs by status: <strong>{jobStats.length} categories</strong></div>
              <div>Jobs by month: <strong>{jobsByMonth.length} months</strong></div>
              <div>Jobs by user: <strong>{jobsByUser.length} users</strong></div>
              
              <details className="mt-4">
                <summary className="cursor-pointer text-yellow-700 hover:text-yellow-900">
                  Click to see detailed debug info
                </summary>
                <pre className="bg-white p-2 rounded overflow-x-auto mt-2 text-xs">
                  {JSON.stringify({
                    sessionUser: session?.user ? {
                      username: session.user.username,
                      hasAccessToken: !!session.user.accessToken,
                      properties: session.user.properties?.length || 0
                    } : null,
                    firstJob: allJobs.length > 0 ? {
                      id: allJobs[0]?.id,
                      property_id: allJobs[0]?.property_id,
                      properties: allJobs[0]?.properties,
                      rooms: allJobs[0]?.rooms?.length || 0,
                      status: allJobs[0]?.status,
                      created_at: allJobs[0]?.created_at
                    } : null,
                    filteringResult: {
                      totalJobs: allJobs.length,
                      afterFilter: filteredJobs.length,
                      selectedProperty: effectiveProperty
                    },
                    jobStatsSample: jobStats.slice(0, 3),
                    jobsByMonthSample: jobsByMonth.slice(0, 3)
                  }, null, 2)}
                </pre>
              </details>
            </div>
          </CardContent>
        </Card>



        {/* Jobs per User Chart */}
        {jobsByUser && jobsByUser.length > 0 && (
          <Card className="w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base sm:text-lg">Jobs per User</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] sm:h-[300px] md:h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={jobsByUser.slice(0, 10)}> {/* Limit to top 10 users */}
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="username" 
                      tick={{ fontSize: isMobile ? 9 : 10 }} 
                      angle={isMobile ? -60 : -45}
                      textAnchor="end"
                      height={isMobile ? 100 : 90}
                    />
                    <YAxis tick={{ fontSize: isMobile ? 9 : 10 }} width={32} />
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
                    <Legend layout="horizontal" align="center" verticalAlign="bottom" iconSize={isMobile ? 10 : 12} wrapperStyle={{ fontSize: isMobile ? 10 : 12 }} />
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
            <CardHeader className="pb-2">
              <CardTitle className="text-base sm:text-lg">Jobs per User - Detailed View</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-700">User</th>
                      <th className="text-center py-2 px-2 sm:px-3 font-medium text-gray-700">Total</th>
                      <th className="text-center py-2 px-2 sm:px-3 font-medium text-gray-700">Completed</th>
                      <th className="text-center py-2 px-2 sm:px-3 font-medium text-gray-700">Pending</th>
                      <th className="text-center py-2 px-2 sm:px-3 font-medium text-gray-700">In Progress</th>
                      <th className="text-center py-2 px-2 sm:px-3 font-medium text-gray-700">Waiting Parts</th>
                      <th className="text-center py-2 px-2 sm:px-3 font-medium text-gray-700">Cancelled</th>
                      <th className="text-center py-2 px-2 sm:px-3 font-medium text-gray-700">Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsByUser.map((userData, index) => (
                      <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-2 sm:px-3 font-medium text-gray-900">{userData.username}</td>
                        <td className="py-2 px-2 sm:px-3 text-center text-gray-700">{userData.total}</td>
                        <td className="py-2 px-2 sm:px-3 text-center text-green-600">{userData.completed}</td>
                        <td className="py-2 px-2 sm:px-3 text-center text-yellow-600">{userData.pending}</td>
                        <td className="py-2 px-2 sm:px-3 text-center text-blue-600">{userData.in_progress}</td>
                        <td className="py-2 px-2 sm:px-3 text-center text-purple-600">{userData.waiting_sparepart}</td>
                        <td className="py-2 px-2 sm:px-3 text-center text-red-600">{userData.cancelled}</td>
                        <td className="py-2 px-2 sm:px-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
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
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Summary Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
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
                  ? filteredJobs.filter((job) => job.status === item.status).length
                  : filteredJobs.length;
                const color = item.status ? STATUS_COLORS[item.status] : "#8884d8";
                const percentage = item.status
                  ? ((statValue / filteredJobs.length) * 100).toFixed(1)
                  : "100.0";

                return (
                  <div key={`stat-${index}`} className="p-3 sm:p-4 rounded-lg bg-gray-50 w-full flex flex-col">
                    <p className="text-xs sm:text-sm text-gray-500 mb-1">{item.name}</p>
                    <div className="flex items-baseline">
                      <p className="text-xl sm:text-2xl font-semibold" style={{ color }}>
                        {statValue}
                      </p>
                      <p className="text-xs sm:text-sm ml-2 text-gray-500">{item.status && `(${percentage}%)`}</p>
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