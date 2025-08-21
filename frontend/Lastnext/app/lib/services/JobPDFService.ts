// app/lib/services/JobPDFService.ts
import React from 'react';
import { Job, TabValue, FILTER_TITLES } from '@/app/lib/types';
import { JobPDFConfig } from '@/app/components/jobs/JobPDFConfig';
import { generatePdfBlob } from '@/app/lib/pdfRenderer';
import { downloadPdf, generatePdfWithRetry } from '@/app/lib/pdfUtils';
import JobPDFTemplate from '@/app/components/document/JobPDFTemplate';

export interface JobPDFOptions {
  jobs: Job[];
  filter: TabValue;
  selectedProperty?: string | null;
  propertyName?: string;
  config: JobPDFConfig;
}

export interface JobStatistics {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
  waitingSparepart: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byAssignedTo: Record<string, number>;
  byLocation: Record<string, number>;
  averageCompletionTime: number;
  overdueJobs: number;
}

export class JobPDFService {
  /**
   * Generate PDF with advanced configuration
   */
  static async generatePDF(options: JobPDFOptions): Promise<Blob> {
    const { jobs, filter, selectedProperty, propertyName, config } = options;
    
    // Process jobs based on configuration
    const processedJobs = this.processJobs(jobs, config);
    
    // Generate statistics if requested
    const statistics = config.includeStatistics ? this.calculateStatistics(processedJobs) : null;
    
    // Create PDF document
    const pdfDocument = React.createElement(JobPDFTemplate, {
      jobs: processedJobs,
      filter: filter,
      selectedProperty: selectedProperty,
      propertyName: propertyName,
      config: config
    });
    
    return await generatePdfBlob(pdfDocument);
  }

  /**
   * Process jobs based on configuration (sorting, grouping, filtering)
   */
  private static processJobs(jobs: Job[], config: JobPDFConfig): Job[] {
    let processedJobs = [...jobs];

    // Apply sorting
    processedJobs = this.sortJobs(processedJobs, config.sortBy, config.sortOrder);

    // Apply grouping (for now, just sort by group, actual grouping is handled in PDF generation)
    if (config.groupBy !== 'none') {
      processedJobs = this.groupJobs(processedJobs, config.groupBy);
    }

    return processedJobs;
  }

  /**
   * Sort jobs based on configuration
   */
  private static sortJobs(jobs: Job[], sortBy: string, sortOrder: 'asc' | 'desc'): Job[] {
    return jobs.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'created_date':
          comparison = new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
          break;
        case 'updated_date':
          comparison = new Date(a.updated_at || '').getTime() - new Date(b.updated_at || '').getTime();
          break;
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          comparison = (priorityOrder[a.priority as keyof typeof priorityOrder] || 0) - 
                      (priorityOrder[b.priority as keyof typeof priorityOrder] || 0);
          break;
        case 'status':
          const statusOrder = { 
            pending: 1, 
            in_progress: 2, 
            waiting_sparepart: 3, 
            completed: 4, 
            cancelled: 5 
          };
          comparison = (statusOrder[a.status as keyof typeof statusOrder] || 0) - 
                      (statusOrder[b.status as keyof typeof statusOrder] || 0);
          break;
        case 'title':
          comparison = (a.description || '').localeCompare(b.description || '');
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Group jobs for better organization in PDF
   */
  private static groupJobs(jobs: Job[], groupBy: string): Job[] {
    // For now, just sort by the grouping criteria
    // The actual grouping display is handled in the PDF component
    switch (groupBy) {
      case 'status':
        return this.sortJobs(jobs, 'status', 'asc');
      case 'priority':
        return this.sortJobs(jobs, 'priority', 'asc');
      case 'assigned_to':
        return jobs.sort((a, b) => {
          const userA = this.getUserDisplayName(a.user);
          const userB = this.getUserDisplayName(b.user);
          return userA.localeCompare(userB);
        });
      case 'location':
        return jobs.sort((a, b) => {
          const locationA = a.rooms?.[0]?.name || '';
          const locationB = b.rooms?.[0]?.name || '';
          return locationA.localeCompare(locationB);
        });
      default:
        return jobs;
    }
  }

  /**
   * Calculate comprehensive job statistics
   */
  private static calculateStatistics(jobs: Job[]): JobStatistics {
    const stats: JobStatistics = {
      total: jobs.length,
      completed: 0,
      inProgress: 0,
      pending: 0,
      cancelled: 0,
      waitingSparepart: 0,
      highPriority: 0,
      mediumPriority: 0,
      lowPriority: 0,
      byStatus: {},
      byPriority: {},
      byAssignedTo: {},
      byLocation: {},
      averageCompletionTime: 0,
      overdueJobs: 0,
    };

    let totalCompletionTime = 0;
    let completedJobsWithTime = 0;

    jobs.forEach(job => {
      // Count by status
      const status = job.status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // Count by priority
      const priority = job.priority || 'normal';
      stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

      // Count by assigned to
      const assignedTo = this.getUserDisplayName(job.user);
      stats.byAssignedTo[assignedTo] = (stats.byAssignedTo[assignedTo] || 0) + 1;

      // Count by location
      const location = job.rooms?.[0]?.name || 'Unknown';
      stats.byLocation[location] = (stats.byLocation[location] || 0) + 1;

      // Update main counters
      switch (status) {
        case 'completed':
          stats.completed++;
          if (job.created_at && job.completed_at) {
            const created = new Date(job.created_at);
            const completed = new Date(job.completed_at);
            totalCompletionTime += completed.getTime() - created.getTime();
            completedJobsWithTime++;
          }
          break;
        case 'in_progress':
          stats.inProgress++;
          break;
        case 'pending':
          stats.pending++;
          break;
        case 'cancelled':
          stats.cancelled++;
          break;
        case 'waiting_sparepart':
          stats.waitingSparepart++;
          break;
      }

      // Update priority counters
      switch (priority) {
        case 'high':
          stats.highPriority++;
          break;
        case 'medium':
          stats.mediumPriority++;
          break;
        case 'low':
          stats.lowPriority++;
          break;
      }

      // Check for overdue jobs (approximate using created_at when no due date field exists)
      // Treat jobs older than 30 days and not completed as overdue
      const createdDate = job.created_at ? new Date(job.created_at) : null;
      if (createdDate && status !== 'completed') {
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - createdDate.getTime() > thirtyDaysMs) {
          stats.overdueJobs++;
        }
      }
    });

    // Calculate average completion time
    if (completedJobsWithTime > 0) {
      stats.averageCompletionTime = totalCompletionTime / completedJobsWithTime;
    }

    return stats;
  }

  /**
   * Get user display name
   */
  private static getUserDisplayName(user: any): string {
    if (!user) return 'Unassigned';
    if (typeof user === 'string') return user;
    if (typeof user === 'object') {
      return user.name || user.username || user.displayName || user.email || String(user.id) || 'User';
    }
    return 'User';
  }

  /**
   * Generate and download PDF with retry logic
   */
  static async generateAndDownloadPDF(options: JobPDFOptions, filename?: string): Promise<void> {
    try {
      const blob = await generatePdfWithRetry(async () => {
        return await this.generatePDF(options);
      });

      const finalFilename = filename || this.generateFilename(options);
      await downloadPdf(blob, finalFilename);
    } catch (error) {
      console.error('PDF generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate filename based on configuration
   */
  private static generateFilename(options: JobPDFOptions): string {
    const { filter, propertyName, config } = options;
    const date = new Date().toISOString().split('T')[0];
    const filterName = FILTER_TITLES[filter] || filter;
    const property = propertyName ? `-${propertyName.replace(/\s+/g, '-')}` : '';
    
    return `jobs-${filterName}${property}-${date}.pdf`;
  }

  /**
   * Get available export formats
   */
  static getExportFormats() {
    return [
      { value: 'pdf', label: 'PDF Document', icon: '📄' },
      { value: 'csv', label: 'CSV Spreadsheet', icon: '📊' },
      { value: 'excel', label: 'Excel Spreadsheet', icon: '📈' },
      { value: 'json', label: 'JSON Data', icon: '🔧' },
    ];
  }

  /**
   * Export jobs to CSV format
   */
  static exportToCSV(jobs: Job[], filename?: string): void {
    const headers = [
      'Job ID',
      'Title',
      'Description',
      'Status',
      'Priority',
      'Assigned To',
      'Location',
      'Created Date',
      'Completed Date',
      'Remarks'
    ];

    const csvContent = [
      headers.join(','),
      ...jobs.map(job => [
        job.job_id,
        `"${(job.description || '').slice(0, 80).replace(/"/g, '""')}"`,
        `"${(job.description || '').replace(/"/g, '""')}"`,
        job.status || '',
        job.priority || '',
        `"${this.getUserDisplayName(job.user).replace(/"/g, '""')}"`,
        `"${(job.rooms?.[0]?.name || '').replace(/"/g, '""')}"`,
        job.created_at || '',
        job.completed_at || '',
        `"${(job.remarks || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || `jobs-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /**
   * Export jobs to JSON format
   */
  static exportToJSON(jobs: Job[], filename?: string): void {
    const jsonContent = JSON.stringify(jobs, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || `jobs-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
