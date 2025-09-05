/**
 * CSV Export utilities for jobs data
 */

import { Job, Property } from '@/app/lib/types';

export interface CSVExportOptions {
  filename?: string;
  includeImages?: boolean;
  includeUserDetails?: boolean;
  includeRoomDetails?: boolean;
  includePropertyDetails?: boolean;
  dateFormat?: 'iso' | 'local' | 'readable';
}

/**
 * Convert a job object to CSV row data
 */
export function jobToCSVRow(
  job: Job, 
  properties: Property[] = [],
  options: CSVExportOptions = {}
): string[] {
  const {
    includeImages = false,
    includeUserDetails = true,
    includeRoomDetails = true,
    includePropertyDetails = true,
    dateFormat = 'readable'
  } = options;

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    switch (dateFormat) {
      case 'iso':
        return date.toISOString();
      case 'local':
        return date.toLocaleString();
      case 'readable':
      default:
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
    }
  };

  const getUserDisplayName = (user: any): string => {
    if (!user) return 'Unassigned';
    
    if (typeof user === 'object' && user) {
      if (user.full_name && user.full_name.trim()) {
        return user.full_name.trim();
      }
      if (user.first_name && user.last_name) {
        return `${user.first_name} ${user.last_name}`.trim();
      }
      if (user.name) return user.name;
      if (user.username) {
        let cleanUsername = user.username;
        if (cleanUsername.includes('auth0_') || cleanUsername.includes('google-oauth2_')) {
          cleanUsername = cleanUsername.replace(/^(auth0_|google-oauth2_)/, '');
        }
        return cleanUsername;
      }
      if (user.email) return user.email.split('@')[0];
      if (user.id) return `User ${user.id}`;
    }
    
    if (typeof user === 'string') {
      if (/^\d+$/.test(user)) return `User ${user}`;
      return user;
    }
    
    return 'Unknown User';
  };

  const getUserPosition = (user: any): string => {
    if (!user || typeof user !== 'object') return 'Staff';
    return user.positions || user.role || 'Staff';
  };

  const getUserEmail = (user: any): string => {
    if (!user || typeof user !== 'object') return '';
    return user.email || '';
  };

  const getPropertyName = (propertyId: any): string => {
    if (!propertyId) return 'N/A';
    
    // Handle different property ID formats
    let id: string;
    if (typeof propertyId === 'object' && propertyId !== null) {
      id = String(propertyId.property_id || propertyId.id || '');
    } else {
      id = String(propertyId);
    }
    
    if (!id) return 'N/A';
    
    const property = properties.find(p => 
      p.property_id === id || p.id === id
    );
    return property?.name || id;
  };

  const getRoomInfo = (rooms: any[] | undefined): string => {
    if (!rooms || rooms.length === 0) return 'N/A';
    return rooms.map(room => 
      `${room.name || 'Unknown'} (${room.room_type || 'Unknown Type'})`
    ).join('; ');
  };

  const getImageUrls = (job: Job): string => {
    const urls: string[] = [];
    
    if (job.images && job.images.length > 0) {
      urls.push(...job.images.map(img => img.image_url).filter(Boolean));
    }
    
    if (job.image_urls && job.image_urls.length > 0) {
      urls.push(...job.image_urls.filter(Boolean));
    }
    
    return urls.join('; ');
  };

  const getTopics = (topics: any[] | undefined): string => {
    if (!topics || topics.length === 0) return 'N/A';
    return topics.map(topic => topic.title || topic.name || 'Unknown').join('; ');
  };

  // Base job information
  const row: string[] = [
    job.job_id || '',
    job.id?.toString() || '',
    job.priority || 'Medium',
    job.status || 'pending',
    job.description || '',
    job.remarks || '',
    formatDate(job.created_at),
    formatDate(job.updated_at),
    formatDate(job.completed_at),
    job.is_defective ? 'Yes' : 'No',
    job.is_preventivemaintenance ? 'Yes' : 'No',
  ];

  // User information
  if (includeUserDetails) {
    row.push(
      getUserDisplayName(job.user),
      getUserPosition(job.user),
      getUserEmail(job.user)
    );
  }

  // Property information
  if (includePropertyDetails) {
    row.push(
      getPropertyName(job.property_id),
      job.properties?.map(prop => getPropertyName(prop)).join('; ') || 'N/A'
    );
  }

  // Room information
  if (includeRoomDetails) {
    row.push(getRoomInfo(job.rooms));
  }

  // Topics
  row.push(getTopics(job.topics));

  // Images
  if (includeImages) {
    row.push(getImageUrls(job));
  }

  return row;
}

/**
 * Get CSV headers for jobs export
 */
export function getJobsCSVHeaders(options: CSVExportOptions = {}): string[] {
  const {
    includeImages = false,
    includeUserDetails = true,
    includeRoomDetails = true,
    includePropertyDetails = true
  } = options;

  const headers = [
    'Job ID',
    'Internal ID',
    'Priority',
    'Status',
    'Description',
    'Remarks',
    'Created Date',
    'Updated Date',
    'Completed Date',
    'Is Defective',
    'Is Preventive Maintenance',
  ];

  if (includeUserDetails) {
    headers.push('Assigned User', 'User Position', 'User Email');
  }

  if (includePropertyDetails) {
    headers.push('Primary Property', 'All Properties');
  }

  if (includeRoomDetails) {
    headers.push('Rooms');
  }

  headers.push('Topics');

  if (includeImages) {
    headers.push('Image URLs');
  }

  return headers;
}

/**
 * Convert jobs array to CSV string
 */
export function jobsToCSV(
  jobs: Job[],
  properties: Property[] = [],
  options: CSVExportOptions = {}
): string {
  const headers = getJobsCSVHeaders(options);
  const rows = jobs.map(job => jobToCSVRow(job, properties, options));
  
  // Escape CSV values
  const escapeCSVValue = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csvContent = [
    headers.map(escapeCSVValue).join(','),
    ...rows.map(row => row.map(escapeCSVValue).join(','))
  ].join('\n');

  return csvContent;
}

/**
 * Download CSV file
 */
export function downloadCSV(
  csvContent: string,
  filename: string = 'jobs-export.csv'
): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Export jobs to CSV with advanced options
 */
export function exportJobsToCSV(
  jobs: Job[],
  properties: Property[] = [],
  options: CSVExportOptions = {}
): void {
  const {
    filename = `jobs-export-${new Date().toISOString().split('T')[0]}.csv`
  } = options;

  const csvContent = jobsToCSV(jobs, properties, options);
  downloadCSV(csvContent, filename);
}

/**
 * Export filtered jobs with current filters
 */
export function exportFilteredJobsToCSV(
  jobs: Job[],
  properties: Property[] = [],
  filters: any = {},
  options: CSVExportOptions = {}
): void {
  // Apply filters
  let filteredJobs = [...jobs];

  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    filteredJobs = filteredJobs.filter(job =>
      job.job_id?.toLowerCase().includes(searchTerm) ||
      job.description?.toLowerCase().includes(searchTerm) ||
      job.remarks?.toLowerCase().includes(searchTerm)
    );
  }

  if (filters.status) {
    filteredJobs = filteredJobs.filter(job => job.status === filters.status);
  }

  if (filters.property) {
    filteredJobs = filteredJobs.filter(job =>
      job.property_id === filters.property ||
      job.properties?.includes(filters.property)
    );
  }

  if (filters.dateFrom) {
    const fromDate = new Date(filters.dateFrom);
    filteredJobs = filteredJobs.filter(job => {
      const jobDate = new Date(job.created_at);
      return jobDate >= fromDate;
    });
  }

  if (filters.dateTo) {
    const toDate = new Date(filters.dateTo);
    toDate.setHours(23, 59, 59, 999); // End of day
    filteredJobs = filteredJobs.filter(job => {
      const jobDate = new Date(job.created_at);
      return jobDate <= toDate;
    });
  }

  // Generate filename with filter info
  const filterSuffix = filters.status ? `-${filters.status}` : '';
  const dateSuffix = filters.dateFrom ? `-${filters.dateFrom}` : '';
  const filename = `jobs-export${filterSuffix}${dateSuffix}-${new Date().toISOString().split('T')[0]}.csv`;

  exportJobsToCSV(filteredJobs, properties, { ...options, filename });
}
