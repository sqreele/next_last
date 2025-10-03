"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { 
  FileText, 
  Download, 
  Building2, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  TrendingUp,
  Users,
  Settings,
  FileSpreadsheet
} from 'lucide-react';
import { useUser, useProperties } from '@/app/lib/stores/mainStore';
import { useSession } from '@/app/lib/session.client';
import { Job, TabValue, JobStatus, JobPriority, STATUS_COLORS } from '@/app/lib/types';
import { fetchAllJobsForProperty } from '@/app/lib/data.server';
import JobsPDFDocument from '@/app/components/document/JobsPDFGenerator';
import { enrichJobsWithPdfImages } from '@/app/lib/utils/pdfImageUtils';
import { generatePdfWithRetry, downloadPdf } from '@/app/lib/pdfUtils';
import { generatePdfBlob } from '@/app/lib/pdfRenderer';
import { format } from 'date-fns';
import { jobsToCSV, downloadCSV } from '@/app/lib/utils/csv-export';

interface JobsReportProps {
  jobs?: Job[];
  filter?: TabValue;
  onRefresh?: () => void;
}

interface ReportStatistics {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
  waitingSparepart: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  completionRate: number;
  averageResponseTime: number;
  jobsByMonth: Array<{ month: string; count: number }>;
  jobsByStatus: Array<{ status: string; count: number; color: string }>;
}

const PRIORITY_COLORS: Record<JobPriority, string> = {
  high: '#dc2626',
  medium: '#ea580c',
  low: '#16a34a'
};

export default function JobsReport({ jobs = [], filter = 'all', onRefresh }: JobsReportProps) {
  const { data: session } = useSession();
  const { userProfile, selectedPropertyId: selectedProperty } = useUser();
  const { properties: userProperties } = useProperties();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCsv, setIsGeneratingCsv] = useState(false);
  const [reportJobs, setReportJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  // Get current property information
  const currentProperty = useMemo(() => {
    if (!selectedProperty) return null;
    return userProperties.find(p => p.property_id === selectedProperty) || null;
  }, [selectedProperty, userProperties]);

  // Filter jobs by selected property - memoized to prevent infinite loops
  const filteredJobs = useMemo(() => {
    if (!selectedProperty || !jobs.length) return jobs;
    
    return jobs.filter(job => {
      // Check direct property_id match
      if (job.property_id === selectedProperty) return true;
      
      // Check properties array
      if (job.properties && Array.isArray(job.properties)) {
        return job.properties.some(prop => {
          if (typeof prop === 'string' || typeof prop === 'number') {
            return String(prop) === String(selectedProperty);
          }
          if (typeof prop === 'object' && prop !== null) {
            return String(prop.property_id || prop.id) === String(selectedProperty);
          }
          return false;
        });
      }
      
      // Check profile_image.properties
      if (job.profile_image?.properties && Array.isArray(job.profile_image.properties)) {
        return job.profile_image.properties.some(prop => {
          if (typeof prop === 'string' || typeof prop === 'number') {
            return String(prop) === String(selectedProperty);
          }
          if (typeof prop === 'object' && prop !== null) {
            return String(prop.property_id || prop.id) === String(selectedProperty);
          }
          return false;
        });
      }
      
      // Check rooms.properties
      if (job.rooms && Array.isArray(job.rooms)) {
        return job.rooms.some(room => {
          if (room.properties && Array.isArray(room.properties)) {
            return room.properties.some(prop => String(prop) === String(selectedProperty));
          }
          return false;
        });
      }
      
      return false;
    });
  }, [jobs, selectedProperty]);

  // Calculate comprehensive statistics
  const statistics: ReportStatistics = useMemo(() => {
    const total = reportJobs.length;
    const completed = reportJobs.filter(job => job.status === 'completed').length;
    const inProgress = reportJobs.filter(job => job.status === 'in_progress').length;
    const pending = reportJobs.filter(job => job.status === 'pending').length;
    const cancelled = reportJobs.filter(job => job.status === 'cancelled').length;
    const waitingSparepart = reportJobs.filter(job => job.status === 'waiting_sparepart').length;
    const highPriority = reportJobs.filter(job => job.priority === 'high').length;
    const mediumPriority = reportJobs.filter(job => job.priority === 'medium').length;
    const lowPriority = reportJobs.filter(job => job.priority === 'low').length;
    
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    // Calculate average response time
    const completedJobDates = reportJobs
      .filter(job => job.status === 'completed' && job.completed_at)
      .map(job => new Date(job.completed_at!).getTime() - new Date(job.created_at).getTime());
    
    const averageResponseTime = completedJobDates.length > 0 
      ? Math.round(completedJobDates.reduce((sum, time) => sum + time, 0) / completedJobDates.length / (1000 * 60 * 60 * 24))
      : 0;

    // Group jobs by month
    const jobsByMonth = reportJobs.reduce((acc, job) => {
      const month = format(new Date(job.created_at), 'MMM yyyy');
      const existing = acc.find(item => item.month === month);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ month, count: 1 });
      }
      return acc;
    }, [] as Array<{ month: string; count: number }>);

    // Jobs by status
    const jobsByStatus = [
      { status: 'Completed', count: completed, color: STATUS_COLORS.completed },
      { status: 'In Progress', count: inProgress, color: STATUS_COLORS.in_progress },
      { status: 'Pending', count: pending, color: STATUS_COLORS.pending },
      { status: 'Cancelled', count: cancelled, color: STATUS_COLORS.cancelled },
      { status: 'Waiting Parts', count: waitingSparepart, color: STATUS_COLORS.waiting_sparepart }
    ];

    return {
      total,
      completed,
      inProgress,
      pending,
      cancelled,
      waitingSparepart,
      highPriority,
      mediumPriority,
      lowPriority,
      completionRate,
      averageResponseTime,
      jobsByMonth,
      jobsByStatus
    };
  }, [reportJobs]);

  // Load jobs for the selected property if not provided
  useEffect(() => {
    if (selectedProperty && jobs.length === 0) {
      const loadPropertyJobs = async () => {
        setLoading(true);
        try {
          console.log('🔍 JobsReport: Loading property jobs for:', selectedProperty);
          console.log('🔍 JobsReport: Session available:', !!session);
          console.log('🔍 JobsReport: Session user:', session?.user);
          console.log('🔍 JobsReport: Access token available:', !!session?.user?.accessToken);
          
          // Try to get access token from session, or use a fallback
          let accessToken = session?.user?.accessToken;
          
          // If no access token in session, try to get it from the session endpoint
          if (!accessToken) {
            console.log('🔍 JobsReport: No access token in session, trying to fetch from session endpoint...');
            try {
              const sessionResponse = await fetch('/api/auth/session-compat');
              if (sessionResponse.ok) {
                const sessionData = await sessionResponse.json();
                accessToken = sessionData?.user?.accessToken;
                console.log('🔍 JobsReport: Access token from session endpoint:', !!accessToken);
              }
            } catch (sessionError) {
              console.error('❌ JobsReport: Error fetching session:', sessionError);
            }
          }
          
          if (!accessToken) {
            console.error('❌ JobsReport: No access token available');
            throw new Error('No access token available');
          }
          
          const propertyJobs = await fetchAllJobsForProperty(selectedProperty, accessToken);
          console.log(`✅ JobsReport: Loaded ${propertyJobs.length} jobs for property ${selectedProperty}`);
          setReportJobs(propertyJobs);
        } catch (error) {
          console.error('Error loading property jobs:', error);
        } finally {
          setLoading(false);
        }
      };
      
      loadPropertyJobs();
    } else if (jobs.length > 0) {
      setReportJobs(jobs);
    }
  }, [selectedProperty, jobs.length, session?.user?.accessToken]);

  // Generate PDF report
  const handleGeneratePDF = async () => {
    if (!reportJobs.length) {
      alert('No jobs available to generate a report.');
      return;
    }

    try {
      setIsGenerating(true);
      const propertyName = currentProperty?.name || `Property ${selectedProperty}`;
      
      const blob = await generatePdfWithRetry(async () => {
        const jobsWithImages = await enrichJobsWithPdfImages(reportJobs);
        const pdfDocument = (
          <JobsPDFDocument
            jobs={jobsWithImages}
            filter={filter}
            selectedProperty={selectedProperty}
            propertyName={propertyName}
            includeImages={true}
            includeDetails={true}
            includeStatistics={true}
            reportTitle={`${propertyName} - Jobs Report`}
          />
        );
        return await generatePdfBlob(pdfDocument);
      });

      const date = format(new Date(), 'yyyy-MM-dd');
      const filename = `${propertyName?.replace(/\s+/g, '-')}-jobs-report-${date}.pdf`;
      await downloadPdf(blob, filename);
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      alert(`Failed to generate PDF: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate CSV export
  const handleGenerateCSV = async () => {
    if (!reportJobs.length) {
      alert('No jobs available to export.');
      return;
    }

    try {
      setIsGeneratingCsv(true);
      const propertyName = currentProperty?.name || `Property ${selectedProperty}`;

      const csvContent = jobsToCSV(reportJobs, userProperties, {
        includeImages: false,
        includeUserDetails: true,
        includeRoomDetails: true,
        includePropertyDetails: true,
        dateFormat: 'readable'
      });

      const date = format(new Date(), 'yyyy-MM-dd');
      const filename = `${propertyName.replace(/\s+/g, '-')}-jobs-report-${date}.csv`;

      downloadCSV(csvContent, filename);
    } catch (error: any) {
      console.error('Error generating CSV:', error);
      alert(`Failed to generate CSV: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingCsv(false);
    }
  };

  // Check if session is still loading
  if (!session) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Loading Session...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading your session...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Check if user is authenticated
  if (!session?.user?.accessToken) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Authentication Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Please log in to view the jobs report.</p>
            <p className="text-sm mt-2">You need to be authenticated to access this feature.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!selectedProperty) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Property Jobs Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Please select a property to view the jobs report.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Loading Jobs Report...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading jobs for {currentProperty?.name}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {currentProperty?.name} - Jobs Report
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Property ID: {selectedProperty} | Filter: {filter}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={handleGenerateCSV} 
                disabled={isGeneratingCsv || reportJobs.length === 0}
                variant="outline"
                className="flex items-center gap-2"
              >
                {isGeneratingCsv ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" />
                    Export CSV
                  </>
                )}
              </Button>
              <Button 
                onClick={handleGeneratePDF} 
                disabled={isGenerating || reportJobs.length === 0}
                className="flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Key Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{statistics.total}</p>
                <p className="text-sm text-gray-500">Total Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{statistics.completionRate}%</p>
                <p className="text-sm text-gray-500">Completion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{statistics.averageResponseTime}d</p>
                <p className="text-sm text-gray-500">Avg Response Time</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{statistics.highPriority}</p>
                <p className="text-sm text-gray-500">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Jobs by Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {statistics.jobsByStatus.map((status) => (
              <div key={status.status} className="text-center">
                <div 
                  className="w-4 h-4 rounded-full mx-auto mb-2"
                  style={{ backgroundColor: status.color }}
                />
                <p className="text-2xl font-bold">{status.count}</p>
                <p className="text-sm text-gray-500">{status.status}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Priority Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Jobs by Priority
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <Badge variant="destructive" className="mb-2">High</Badge>
              <p className="text-2xl font-bold">{statistics.highPriority}</p>
            </div>
            <div className="text-center">
              <Badge variant="secondary" className="mb-2">Medium</Badge>
              <p className="text-2xl font-bold">{statistics.mediumPriority}</p>
            </div>
            <div className="text-center">
              <Badge variant="default" className="mb-2">Low</Badge>
              <p className="text-2xl font-bold">{statistics.lowPriority}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Trend */}
      {statistics.jobsByMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Jobs by Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {statistics.jobsByMonth.slice(-6).map((month) => (
                <div key={month.month} className="text-center">
                  <p className="text-lg font-bold">{month.count}</p>
                  <p className="text-sm text-gray-500">{month.month}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Report Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• Generated on: {format(new Date(), 'PPP')}</p>
            <p>• Property: {currentProperty?.name}</p>
            <p>• Total jobs analyzed: {statistics.total}</p>
            <p>• Completion rate: {statistics.completionRate}%</p>
            <p>• Average response time: {statistics.averageResponseTime} days</p>
            <p>• High priority jobs requiring attention: {statistics.highPriority}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
