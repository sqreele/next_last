// app/components/document/JobPDFTemplate.tsx
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { Job, TabValue, FILTER_TITLES } from '@/app/lib/types';
import { JobPDFConfig } from '@/app/components/jobs/JobPDFConfig';

// Register fonts with fallback
try {
  Font.register({
    family: 'Sarabun',
    fonts: [
      { src: '/fonts/Sarabun-Regular.ttf', fontWeight: 'normal', fontStyle: 'normal' },
      { src: '/fonts/Sarabun-Bold.ttf', fontWeight: 'bold', fontStyle: 'normal' },
      // Note: Sarabun-Italic.ttf is not available, so we'll use Regular for italic
      { src: '/fonts/Sarabun-Regular.ttf', fontWeight: 'normal', fontStyle: 'italic' },
      { src: '/fonts/Sarabun-Bold.ttf', fontWeight: 'bold', fontStyle: 'italic' },
    ],
  });
} catch (error) {
  console.warn('Failed to register Sarabun font, using fallback:', error);
  // Register fallback fonts
  try {
    Font.register({
      family: 'Helvetica',
      src: '', // Use built-in Helvetica
    });
  } catch (fallbackError) {
    console.error('Failed to register fallback font:', fallbackError);
  }
}

interface JobPDFTemplateProps {
  jobs: Job[];
  filter: TabValue;
  selectedProperty?: string | null;
  propertyName?: string;
  config: JobPDFConfig;
}

const createStyles = (config: JobPDFConfig) => StyleSheet.create({
  page: {
    padding: config.pageSize === 'A4' ? 20 : 25,
    backgroundColor: '#ffffff',
    fontFamily: 'Sarabun, Helvetica, Arial',
    fontSize: config.maxJobsPerPage <= 8 ? 10 : 9,
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderColor: config.customStyling ? '#1e40af' : '#374151',
    paddingBottom: 15,
    textAlign: 'center',
  },
  headerText: {
    fontSize: config.pageSize === 'A4' ? 24 : 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: config.customStyling ? '#1e40af' : '#111827',
  },
  subHeaderText: {
    fontSize: config.pageSize === 'A4' ? 14 : 16,
    marginBottom: 5,
    color: config.customStyling ? '#374151' : '#6b7280',
  },
  watermark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(-45deg)',
    fontSize: 48,
    color: '#f3f4f6',
    opacity: 0.3,
    zIndex: 1,
  },
  metadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    padding: 10,
    backgroundColor: config.customStyling ? '#f0f9ff' : '#f9fafb',
    borderRadius: 5,
  },
  metadataItem: {
    fontSize: 10,
    color: '#6b7280',
  },
  statistics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    padding: 15,
    backgroundColor: config.customStyling ? '#f0f9ff' : '#f1f5f9',
    borderRadius: 8,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: config.customStyling ? '#1e40af' : '#0f172a',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'center',
  },
  groupHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
    padding: 8,
    backgroundColor: config.customStyling ? '#dbeafe' : '#e5e7eb',
    color: config.customStyling ? '#1e40af' : '#374151',
    borderRadius: 4,
  },
  jobRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 12,
    paddingHorizontal: 8,
    minHeight: config.maxJobsPerPage <= 8 ? 120 : 100,
    maxHeight: config.maxJobsPerPage <= 8 ? 180 : 150,
    marginBottom: 8,
    break: false,
    backgroundColor: '#ffffff',
  },
  jobRowAlternate: {
    backgroundColor: config.customStyling ? '#f8fafc' : '#f9fafb',
  },
  imageColumn: {
    width: config.includeImages ? '20%' : '0%',
    marginRight: 12,
  },
  infoColumn: {
    width: config.includeImages ? '45%' : '65%',
    paddingRight: 10,
  },
  statusColumn: {
    width: config.includeImages ? '35%' : '35%',
  },
  jobImage: {
    width: '100%',
    height: config.maxJobsPerPage <= 8 ? 100 : 80,
    objectFit: 'cover',
    borderRadius: 4,
  },
  label: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 2,
    fontWeight: 'bold',
  },
  value: {
    fontSize: 9,
    marginBottom: 4,
    lineHeight: 1.3,
    color: '#111827',
  },
  statusBadge: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginBottom: 4,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  priorityBadge: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginBottom: 4,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 8,
    marginBottom: 3,
    lineHeight: 1.2,
    color: '#6b7280',
  },
  truncatedText: {
    fontSize: 9,
    marginBottom: 4,
    lineHeight: 1.3,
    maxLines: 3,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    fontSize: 8,
    color: '#9ca3af',
  },
  noDataMessage: {
    textAlign: 'center',
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 50,
    fontStyle: 'italic',
  },
});

const JobPDFTemplate: React.FC<JobPDFTemplateProps> = ({ 
  jobs, 
  filter, 
  selectedProperty, 
  propertyName, 
  config 
}) => {
  const styles = createStyles(config);
  
  // Process jobs based on configuration
  const processedJobs = processJobs(jobs, config);
  
  // Calculate statistics if requested
  const statistics = config.includeStatistics ? calculateStatistics(processedJobs) : null;
  
  // Group jobs if requested
  const groupedJobs = config.groupBy !== 'none' ? groupJobs(processedJobs, config.groupBy) : null;
  
  // Jobs per page based on configuration
  const jobsPerPage = config.maxJobsPerPage;
  
  if (processedJobs.length === 0) {
    return (
      <Document>
        <Page size={config.pageSize.toUpperCase() as any} orientation={config.orientation} style={styles.page}>
          {config.watermark && (
            <Text style={styles.watermark}>CONFIDENTIAL</Text>
          )}
          <View style={styles.header}>
            <Text style={styles.headerText}>{config.reportTitle}</Text>
            <Text style={styles.subHeaderText}>
              {propertyName ? `Property: ${propertyName}` : 'All Properties'}
            </Text>
          </View>
          <Text style={styles.noDataMessage}>No jobs found for the selected criteria.</Text>
        </Page>
      </Document>
    );
  }

  // Create pages based on grouping or regular pagination
  const pages = groupedJobs ? createGroupedPages(groupedJobs, jobsPerPage) : createRegularPages(processedJobs, jobsPerPage);

  return (
    <Document>
      {pages.map((pageData, pageIndex) => (
        <Page key={pageIndex} size={config.pageSize} orientation={config.orientation} style={styles.page}>
          {config.watermark && (
            <Text style={styles.watermark}>CONFIDENTIAL</Text>
          )}
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerText}>{config.reportTitle}</Text>
            <Text style={styles.subHeaderText}>
              {propertyName ? `Property: ${propertyName}` : 'All Properties'}
            </Text>
            <Text style={styles.subHeaderText}>
              Filter: {FILTER_TITLES[filter] || filter} | Generated: {new Date().toLocaleDateString()}
            </Text>
          </View>

          {/* Statistics Section - Only on first page */}
          {pageIndex === 0 && config.includeStatistics && statistics && (
            <>
              <View style={styles.metadata}>
                <Text style={styles.metadataItem}>Total Jobs: {statistics.total}</Text>
                <Text style={styles.metadataItem}>Filter: {FILTER_TITLES[filter] || filter}</Text>
                <Text style={styles.metadataItem}>Date: {new Date().toLocaleDateString()}</Text>
              </View>
              
              <View style={styles.statistics}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{statistics.completed}</Text>
                  <Text style={styles.statLabel}>Completed</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{statistics.inProgress}</Text>
                  <Text style={styles.statLabel}>In Progress</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{statistics.pending}</Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{statistics.highPriority}</Text>
                  <Text style={styles.statLabel}>High Priority</Text>
                </View>
              </View>
            </>
          )}

          {/* Content */}
          {renderPageContent(pageData, styles, config)}

          {/* Footer */}
          {config.includeFooter && (
            <View style={styles.footer} fixed>
              <Text>Generated by Facility Management System | {new Date().toLocaleDateString()}</Text>
            </View>
          )}

          {/* Page Numbers */}
          {config.includePageNumbers && (
            <Text 
              style={styles.pageNumber} 
              render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} 
              fixed 
            />
          )}
        </Page>
      ))}
    </Document>
  );
};

// Helper functions
function processJobs(jobs: Job[], config: JobPDFConfig): Job[] {
  let processedJobs = [...jobs];

  // Apply sorting
  processedJobs = sortJobs(processedJobs, config.sortBy, config.sortOrder);

  return processedJobs;
}

function sortJobs(jobs: Job[], sortBy: string, sortOrder: 'asc' | 'desc'): Job[] {
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

function groupJobs(jobs: Job[], groupBy: string): Record<string, Job[]> {
  const groups: Record<string, Job[]> = {};

  jobs.forEach(job => {
    let key = 'Unknown';
    
    switch (groupBy) {
      case 'status':
        key = job.status || 'unknown';
        break;
      case 'priority':
        key = job.priority || 'normal';
        break;
      case 'assigned_to':
        key = getUserDisplayName(job.user);
        break;
      case 'location':
        key = job.rooms?.[0]?.name || 'Unknown';
        break;
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(job);
  });

  return groups;
}

function createGroupedPages(groupedJobs: Record<string, Job[]>, jobsPerPage: number): any[] {
  const pages: any[] = [];
  
  Object.entries(groupedJobs).forEach(([groupName, groupJobs]) => {
    const groupPages = createRegularPages(groupJobs, jobsPerPage);
    groupPages.forEach(page => {
      pages.push({ type: 'group', groupName, jobs: page.jobs });
    });
  });

  return pages;
}

function createRegularPages(jobs: Job[], jobsPerPage: number): any[] {
  const pages = [];
  
  for (let i = 0; i < jobs.length; i += jobsPerPage) {
    pages.push({
      type: 'regular',
      jobs: jobs.slice(i, i + jobsPerPage)
    });
  }

  return pages;
}

function renderPageContent(pageData: any, styles: any, config: JobPDFConfig) {
  if (pageData.type === 'group') {
    return (
      <>
        <Text style={styles.groupHeader}>
          {config.groupBy === 'status' ? 'Status: ' : 
           config.groupBy === 'priority' ? 'Priority: ' :
           config.groupBy === 'assigned_to' ? 'Assigned To: ' :
           config.groupBy === 'location' ? 'Location: ' : ''}
          {pageData.groupName}
        </Text>
        {renderJobsList(pageData.jobs, styles, config)}
      </>
    );
  }

  return renderJobsList(pageData.jobs, styles, config);
}

function renderJobsList(jobs: Job[], styles: any, config: JobPDFConfig) {
  return jobs.map((job, jobIndex) => (
    <View 
      key={job.job_id} 
      style={[
        styles.jobRow, 
        jobIndex % 2 === 0 ? {} : styles.jobRowAlternate
      ]} 
      wrap={false}
    >
      {/* Image Column */}
      {config.includeImages && (
        <View style={styles.imageColumn}>
          {job.images && job.images.length > 0 ? (
            <Image
              src={resolveImageUrl(job.images[0].image_url)}
              style={styles.jobImage}
              cache={false}
            />
          ) : (
            <View style={[styles.jobImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ fontSize: 8, color: '#9ca3af' }}>No Image</Text>
            </View>
          )}
        </View>
      )}

      {/* Information Column */}
      <View style={styles.infoColumn}>
        <Text style={styles.label}>Job ID:</Text>
        <Text style={styles.value}>{job.job_id}</Text>
        
        <Text style={styles.label}>Description:</Text>
        <Text style={styles.value}>{truncateText(job.description || 'No description')}</Text>
        
        {config.includeDetails && job.remarks && (
          <>
            <Text style={styles.label}>Remarks:</Text>
            <Text style={styles.value}>{truncateText(job.remarks, 80)}</Text>
          </>
        )}
        
        <Text style={styles.label}>Assigned To:</Text>
        <Text style={styles.value}>{getUserDisplayName(job.user)}</Text>
      </View>

      {/* Status Column */}
      <View style={styles.statusColumn}>
        <Text style={styles.label}>Status:</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) + '20', color: getStatusColor(job.status) }]}>
          <Text style={[styles.statusBadge, { backgroundColor: 'transparent', color: getStatusColor(job.status) }]}>
            {job.status?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
          </Text>
        </View>
        
        <Text style={styles.label}>Priority:</Text>
        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(job.priority) + '20', color: getPriorityColor(job.priority) }]}>
          <Text style={[styles.priorityBadge, { backgroundColor: 'transparent', color: getPriorityColor(job.priority) }]}>
            {job.priority?.toUpperCase() || 'NORMAL'}
          </Text>
        </View>
        
        <Text style={styles.label}>Created:</Text>
        <Text style={styles.dateText}>{formatDate(job.created_at)}</Text>
        
        {job.completed_at && (
          <>
            <Text style={styles.label}>Completed:</Text>
            <Text style={styles.dateText}>{formatDate(job.completed_at)}</Text>
          </>
        )}
        
        {config.includeDetails && job.rooms && job.rooms.length > 0 && (
          <>
            <Text style={styles.label}>Location:</Text>
            <Text style={styles.value}>
              {job.rooms.map(room => room.name).join(', ')}
            </Text>
          </>
        )}
      </View>
    </View>
  ));
}

function calculateStatistics(jobs: Job[]): any {
  const stats = {
    total: jobs.length,
    completed: jobs.filter(job => job.status === 'completed').length,
    inProgress: jobs.filter(job => job.status === 'in_progress').length,
    pending: jobs.filter(job => job.status === 'pending').length,
    cancelled: jobs.filter(job => job.status === 'cancelled').length,
    waitingSparepart: jobs.filter(job => job.status === 'waiting_sparepart').length,
    highPriority: jobs.filter(job => job.priority === 'high').length,
  };

  return stats;
}

function getUserDisplayName(user: any): string {
  if (!user) return 'Unassigned';
  if (typeof user === 'string') return user;
  if (typeof user === 'object') {
    return user.name || user.username || user.displayName || user.email || String(user.id) || 'User';
  }
  return 'User';
}

function truncateText(text: string, maxLength: number = 120): string {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getPriorityColor(priority: string): string {
  switch (priority?.toLowerCase()) {
    case 'high': return '#dc2626';
    case 'medium': return '#ea580c';
    case 'low': return '#16a34a';
    default: return '#6b7280';
  }
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'completed': return '#16a34a';
    case 'in_progress': return '#2563eb';
    case 'pending': return '#ea580c';
    case 'cancelled': return '#dc2626';
    case 'waiting_sparepart': return '#7c3aed';
    default: return '#6b7280';
  }
}

function resolveImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }
  return `${process.env.NEXT_PUBLIC_MEDIA_URL || 'http://localhost:8000'}${imageUrl}`;
}

export default JobPDFTemplate;
