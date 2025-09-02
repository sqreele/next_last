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
type Session = any;
import { Button } from "@/app/components/ui/button";
import Link from "next/link";
import { Download } from "lucide-react";
import { generatePdfWithRetry, downloadPdf } from "@/app/lib/pdfUtils";
import { generatePdfBlob } from "@/app/lib/pdfRenderer";
import ChartDashboardPDF from "@/app/components/document/ChartDashboardPDF";

interface PropertyJobsDashboardProps {
  initialJobs?: Job[];
}

const PropertyJobsDashboard = ({ initialJobs = [] }: PropertyJobsDashboardProps) => {
  const { selectedPropertyId: selectedProperty } = useUser();
  const { properties: userProperties } = useProperties();
  const { data: session, status, refresh } = useSession();
  const { jobs, setJobs } = useJobs();

  // Since we don't have jobCreationCount in the new store, we'll use jobs length as a proxy
  const jobCreationCount = jobs.length;
  const [allJobs, setAllJobs] = useState<Job[]>(initialJobs);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>(initialJobs);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

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
    if (status !== "authenticated" || !session?.user) return;

    setIsLoading(true);
    setError(null);

    try {
      // Use jobs already available in the store
      if (Array.isArray(jobs)) {
        setAllJobs(jobs);
      } else {
        setAllJobs([]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load jobs";
      setError(errorMessage);
      setAllJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Populate store with initial jobs when component mounts
  useEffect(() => {
    if (initialJobs && initialJobs.length > 0 && (!jobs || jobs.length === 0)) {
      console.log('🔍 Populating store with initial jobs:', initialJobs.length);
      setJobs(initialJobs);
      setAllJobs(initialJobs);
      setFilteredJobs(initialJobs);
    }
  }, [initialJobs, jobs, setJobs]);

  // PDF Export function
  const handleExportPDF = async () => {
    if (!filteredJobs.length) {
      alert('No data available to export.');
      return;
    }

    try {
      setIsGeneratingPDF(true);
      
      // Get current property name
      const currentProperty = userProperties.find(p => p.property_id === effectiveProperty);
      const propertyName = currentProperty?.name || `Property ${effectiveProperty}`;
      
      // Create PDF document
      const pdfDocument = (
        <ChartDashboardPDF
          jobs={filteredJobs}
          selectedProperty={effectiveProperty}
          propertyName={propertyName}
          jobStats={jobStats}
          jobsByMonth={jobsByMonth}
          jobsByUser={jobsByUser}
        />
      );
      
      // Debug: Log the jobStats data being passed to PDF
      console.log('PDF jobStats data:', jobStats);
      console.log('STATUS_COLORS:', STATUS_COLORS);
      
      // Generate PDF blob
      const blob = await generatePdfWithRetry(async () => {
        return await generatePdfBlob(pdfDocument);
      });
      
      // Download PDF
      const date = new Date().toISOString().split('T')[0];
      const filename = `${propertyName.replace(/\s+/g, '-')}-chart-dashboard-${date}.pdf`;
      await downloadPdf(blob, filename);
      
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      alert(`Failed to generate PDF: ${error.message || 'Unknown error'}`);
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
    if (!allJobs.length || !effectiveProperty) {
      setFilteredJobs([]);
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

  // Memoized job statistics
  const jobStats = useMemo(() => {
    const total = filteredJobs.length;
    if (total === 0) return [];
    
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
    
    // Debug: Log the generated jobStats
    console.log('Generated jobStats:', result);
    console.log('STATUS_COLORS used:', STATUS_COLORS);
    
    return result;
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

  // Helper function to extract user display name
  const getUserDisplayName = (user: any): string => {
    console.log('🔍 getUserDisplayName called with:', user, 'type:', typeof user);
    
    if (!user) {
      console.log('❌ No user provided');
      return 'Unknown User';
    }
    
    // If it's an object with username field
    if (typeof user === 'object' && user && 'username' in user) {
      console.log('✅ Found username in object:', user.username);
      return user.username;
    }
    
    // If it's a string or number, try to match with session user
    if (typeof user === 'string' || typeof user === 'number') {
      const userStr = String(user);
      console.log('🔢 Processing string/number user:', userStr);
      
      // Try to match with session data
      if (session?.user) {
        const sessionUserId = String(session.user.id || '').trim();
        const sessionUsername = session.user.username || 'You';
        console.log('🔍 Comparing with session user ID:', sessionUserId, 'username:', sessionUsername);
        
        // Exact match
        if (userStr === sessionUserId) {
          console.log('✅ Exact match found, returning:', sessionUsername);
          return sessionUsername;
        }
        
        // Case-insensitive match
        if (userStr.toLowerCase() === sessionUserId.toLowerCase()) {
          console.log('✅ Case-insensitive match found, returning:', sessionUsername);
          return sessionUsername;
        }
        
        // Google OAuth ID matching
        if (userStr.includes('google-oauth2_') && sessionUserId.includes('google-oauth2_')) {
          const userNumeric = userStr.replace('google-oauth2_', '');
          const sessionNumeric = sessionUserId.replace('google-oauth2_', '');
          if (userNumeric === sessionNumeric) {
            console.log('✅ Google OAuth match found, returning:', sessionUsername);
            return sessionUsername;
          }
        }
        
        // Try to match numeric IDs (common case where job user is numeric ID)
        const userNumeric = parseInt(userStr);
        const sessionNumeric = parseInt(sessionUserId);
        if (!isNaN(userNumeric) && !isNaN(sessionNumeric) && userNumeric === sessionNumeric) {
          console.log('✅ Numeric ID match found, returning:', sessionUsername);
          return sessionUsername;
        }
        
        // Try to match with first_name and last_name if available
        if (session.user.first_name || session.user.last_name) {
          const fullName = `${session.user.first_name || ''} ${session.user.last_name || ''}`.trim();
          if (fullName) {
            console.log('✅ Using full name from session:', fullName);
            return fullName;
          }
        }
        
        console.log('❌ No match found with session user');
        
        // If we have session data but no match, try to use session username as fallback
        // This handles cases where the job user ID doesn't match session ID format
        if (session.user.username) {
          console.log('🔄 Using session username as fallback:', session.user.username);
          return session.user.username;
        }
      } else {
        console.log('❌ No session user available');
      }
      
      // If it's a numeric ID, try to show it as "User #123" instead of "User 123"
      if (!isNaN(Number(userStr))) {
        console.log('🔄 Returning numeric fallback:', `User #${userStr}`);
        return `User #${userStr}`;
      }
      
      console.log('🔄 Returning fallback:', `User ${userStr}`);
      return `User ${userStr}`;
    }
    
    if (typeof user === 'object') {
      console.log('📦 Processing object user:', user);
      // Try different possible fields for username
      const username = user.username || user.name || user.email || user.id;
      if (username) {
        console.log('✅ Found username field:', username);
        return String(username);
      }
      
      // If it's an object but no recognizable field, try to stringify it safely
      try {
        // Check if it has any enumerable properties
        const keys = Object.keys(user);
        console.log('🔑 Object keys:', keys);
        if (keys.length > 0) {
          // Try to get the first string value
          for (const key of keys) {
            const value = user[key];
            if (typeof value === 'string' && value.trim()) {
              console.log('✅ Found string value:', value, 'for key:', key);
              return value;
            }
          }
        }
      } catch (error) {
        console.warn('Error processing user object:', error);
      }
      
      console.log('❌ No usable field found in object');
      return 'Unknown User';
    }
    
    console.log('❌ Unhandled user type:', typeof user);
    return 'Unknown User';
  };

  // Memoized jobs by user data
  const jobsByUser = useMemo(() => {
    if (filteredJobs.length === 0) return [];

    // Debug: Log user data structure
    if (filteredJobs.length > 0) {
      console.log('=== USER DATA DEBUG ===');
      console.log('Sample job user data:', filteredJobs[0].user);
      console.log('User type:', typeof filteredJobs[0].user);
      console.log('User keys:', typeof filteredJobs[0].user === 'object' ? Object.keys(filteredJobs[0].user) : 'N/A');
      console.log('User values:', typeof filteredJobs[0].user === 'object' ? Object.values(filteredJobs[0].user) : 'N/A');
      console.log('User JSON:', JSON.stringify(filteredJobs[0].user, null, 2));
      console.log('Extracted username:', getUserDisplayName(filteredJobs[0].user));
      
      // Show session data for comparison
      if (session?.user) {
        console.log('Session user data:', session.user);
        console.log('Session user ID:', session.user.id);
        console.log('Session username:', session.user.username);
      }
      console.log('=== END USER DATA DEBUG ===');
    }

    // Group jobs by user
    const grouped = _.groupBy(filteredJobs, (job) => {
      console.log('🔄 Processing job:', job.id, 'user:', job.user);
      const displayName = getUserDisplayName(job.user);
      console.log('📝 Generated display name:', displayName);
      
      // Additional check for "[object Object]" string
      if (displayName === '[object Object]' || displayName === 'User [object Object]') {
        console.warn('⚠️ Detected [object Object] in user name, job user:', job.user);
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
    
    // Debug: Log the final result
    console.log('📊 Final jobs by user result:', sortedResult);
    console.log('📊 Grouped data keys:', Object.keys(grouped));
    console.log('📊 Grouped data:', grouped);
    
    return sortedResult;
  }, [filteredJobs]);

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
    <div className="space-y-4 px-2">
      {/* PDF Export Button */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Chart Dashboard</h2>
          <p className="text-gray-600">
            {effectiveProperty ? `Viewing data for ${userProperties.find(p => p.property_id === effectiveProperty)?.name || `Property ${effectiveProperty}`}` : 'Select a property to view data'}
          </p>
        </div>
        <Button
          onClick={handleExportPDF}
          disabled={isGeneratingPDF || filteredJobs.length === 0}
          className="flex items-center gap-2"
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
            <CardTitle className="text-lg">Jobs by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={jobStats}
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={5}
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
                  <Legend layout="horizontal" align="center" verticalAlign="bottom" iconSize={12} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Jobs by Month Chart - with limit to prevent rendering too many bars */}
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Jobs by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jobsByMonth.slice(-12)}> {/* Limit to last 12 months */}
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend layout="horizontal" align="center" verticalAlign="bottom" iconSize={12} />
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
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Jobs per User</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={jobsByUser.slice(0, 10)}> {/* Limit to top 10 users */}
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="username" 
                      tick={{ fontSize: 12 }} 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
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
                    <Legend layout="horizontal" align="center" verticalAlign="bottom" iconSize={12} />
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
              <CardTitle className="text-lg">Jobs per User - Detailed View</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-700">User</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Total</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Completed</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Pending</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">In Progress</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Waiting Parts</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Cancelled</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsByUser.map((userData, index) => (
                      <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-900">{userData.username}</td>
                        <td className="py-2 px-3 text-center text-gray-700">{userData.total}</td>
                        <td className="py-2 px-3 text-center text-green-600">{userData.completed}</td>
                        <td className="py-2 px-3 text-center text-yellow-600">{userData.pending}</td>
                        <td className="py-2 px-3 text-center text-blue-600">{userData.in_progress}</td>
                        <td className="py-2 px-3 text-center text-purple-600">{userData.waiting_sparepart}</td>
                        <td className="py-2 px-3 text-center text-red-600">{userData.cancelled}</td>
                        <td className="py-2 px-3 text-center">
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
            <CardTitle className="text-lg">Summary Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
                  <div key={`stat-${index}`} className="p-4 rounded-lg bg-gray-50 w-full flex flex-col">
                    <p className="text-sm text-gray-500 mb-1">{item.name}</p>
                    <div className="flex items-baseline">
                      <p className="text-2xl font-semibold" style={{ color }}>
                        {statValue}
                      </p>
                      <p className="text-sm ml-2 text-gray-500">{item.status && `(${percentage}%)`}</p>
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