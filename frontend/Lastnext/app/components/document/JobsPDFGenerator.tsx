// ./app/components/document/JobsPDFGenerator.tsx
// Note: @react-pdf/renderer only supports JPG, JPEG, PNG, and GIF image formats
// WebP images are not supported and will show "No Image" placeholder
// Last updated: 2025-01-13 - Fixed undefined variable references and improved property filtering
// 
// Debug Mode: Set debugMode={true} to bypass property filtering and see all jobs
// This helps identify why strict filtering might be failing
//
// TEMPORARY FALLBACK: When strict filtering fails, all jobs are shown automatically
// This ensures PDF generation works while debugging the filtering logic
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { Job, TabValue, FILTER_TITLES } from '@/app/lib/types';



// ✅ Register Thai font (Sarabun) with fallback
const registerFonts = () => {
  try {
    // Try to register Sarabun font with all available weights and styles
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
    console.log('✅ Sarabun font registered successfully with italic fallback');
    return true;
  } catch (error) {
    console.warn('⚠️ Failed to register Sarabun font:', error);
    
    // Try alternative paths
    try {
      Font.register({
        family: 'Sarabun',
        fonts: [
          { src: './fonts/Sarabun-Regular.ttf', fontWeight: 'normal', fontStyle: 'normal' },
          { src: './fonts/Sarabun-Bold.ttf', fontWeight: 'bold', fontStyle: 'normal' },
          { src: './fonts/Sarabun-Regular.ttf', fontWeight: 'normal', fontStyle: 'italic' },
          { src: './fonts/Sarabun-Bold.ttf', fontWeight: 'bold', fontStyle: 'italic' },
        ],
      });
      console.log('✅ Sarabun font registered with alternative path and italic fallback');
      return true;
    } catch (altError) {
      console.warn('⚠️ Alternative path also failed:', altError);
    }
    
    // Register fallback fonts with italic support
    try {
      Font.register({
        family: 'Helvetica',
        src: '', // Use built-in Helvetica
      });
      console.log('✅ Fallback Helvetica font registered successfully');
      return false; // Indicate fallback was used
    } catch (fallbackError) {
      console.error('❌ Failed to register fallback font:', fallbackError);
      return false;
    }
  }
};

// Register fonts on component mount
const fontsRegistered = registerFonts();

interface JobsPDFDocumentProps {
  jobs: Job[];
  filter: TabValue;
  selectedProperty?: string | null;
  propertyName?: string;
  topics?: any[];
  onTopicChange?: (topicId: string) => void;
  includeDetails?: boolean;
  includeImages?: boolean;
  includeStatistics?: boolean;
  reportTitle?: string;
  debugMode?: boolean; // Add debug mode to bypass filtering when needed
}

const styles = StyleSheet.create({
  page: {
    padding: 15,
    backgroundColor: '#ffffff',
    fontFamily: fontsRegistered ? 'Sarabun' : 'Helvetica, Arial',
  },
  header: {
    marginBottom: 15,
    borderBottomWidth: 2,
    borderColor: '#1e40af',
    paddingBottom: 10,
  },
  headerText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#1e40af',
    textAlign: 'center',
  },
  subHeaderText: {
    fontSize: 10,
    marginBottom: 3,
    color: '#374151',
    textAlign: 'center',
  },
  metadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 6,
    backgroundColor: '#f9fafb',
    borderRadius: 3,
  },
  metadataItem: {
    fontSize: 7,
    color: '#6b7280',
  },
  statistics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#f0f9ff',
    borderRadius: 4,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 3,
  },
  statLabel: {
    fontSize: 7,
    color: '#6b7280',
    textAlign: 'center',
  },
  jobRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 10,
    paddingHorizontal: 6,
    paddingLeft: '0%',
    minHeight: 90,
    maxHeight: 130,
    marginBottom: 8,
    break: false,
    backgroundColor: '#ffffff',
  },
  jobRowAlternate: {
    backgroundColor: '#f9fafb',
  },
  headerRow: {
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 2,
    borderBottomColor: '#1e40af',
    fontWeight: 'bold',
  },
  imageColumn: {
    width: '15%',
    marginRight: 40,
    marginLeft: 0,
    order: 1,
  },
  infoColumn: {
    width: '60%',
    paddingLeft: 20,
    paddingRight: 8,
    order: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLeftColumn: {
    width: '48%',
  },
  infoRightColumn: {
    width: '48%',
  },
  statusColumn: {
    width: '25%',
    order: 3,
  },
  jobImage: {
    width: 120,
    height: 75,
    objectFit: 'cover',
    borderRadius: 3,
  },
  label: {
    fontSize: 7,
    color: '#6b7280',
    marginBottom: 1,
    fontWeight: 'bold',
    marginTop: 4,
  },
  value: {
    fontSize: 7,
    marginBottom: 4,
    lineHeight: 1.1,
    color: '#111827',
  },
  smallText: {
    fontSize: 6,
    lineHeight: 1.0,
  },
  statusBadge: {
    fontSize: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginBottom: 2,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  priorityBadge: {
    fontSize: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginBottom: 2,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 6,
    marginBottom: 2,
    lineHeight: 1.0,
    color: '#6b7280',
  },
  truncatedText: {
    fontSize: 7,
    marginBottom: 2,
    lineHeight: 1.1,
    maxLines: 3,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1e40af',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingBottom: 5,
  },
  footer: {
    position: 'absolute',
    bottom: 15,
    left: 15,
    right: 15,
    textAlign: 'center',
    fontSize: 6,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 15,
    right: 15,
    fontSize: 6,
    color: '#9ca3af',
  },
  noDataMessage: {
    textAlign: 'center',
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 40,
    fontStyle: 'italic',
  },
});

const JobsPDFDocument: React.FC<JobsPDFDocumentProps> = ({ 
  jobs, 
  filter, 
  selectedProperty, 
  propertyName, 
  topics, 
  onTopicChange,
  includeDetails = true,
  includeImages = true,
  includeStatistics = true,
  reportTitle = 'Jobs Report',
  debugMode = false
}) => {
  // Debug logging
  console.log('JobsPDFDocument Props:', {
    jobsCount: jobs?.length || 0,
    filter,
    selectedProperty,
    propertyName,
    includeDetails,
    includeImages,
    includeStatistics,
    reportTitle
  });
  // Enhanced property filtering that considers user's profile property selection
  let filteredJobs = jobs.filter((job) => {
    if (!selectedProperty) {
      console.log('No property filter, including job:', job.job_id);
      return true;
    }

    // Debug mode: bypass filtering to see all jobs
    if (debugMode) {
      console.log(`Debug mode: including job ${job.job_id} without filtering`);
      return true;
    }

    console.log(`Filtering job ${job.job_id} for property:`, selectedProperty);
    console.log('Job property data:', {
      property_id: job.property_id,
      properties: job.properties,
      profile_image_properties: job.profile_image?.properties,
      rooms_properties: job.rooms?.map(r => r.properties),
      full_job_data: job // Log full job data for debugging
    });

    // Check direct property_id match (case-insensitive)
    if (String(job.property_id).toLowerCase() === String(selectedProperty).toLowerCase()) {
      console.log(`Job ${job.job_id} matches direct property_id`);
      return true;
    }
    
    // Check properties array with more flexible matching
    if (job.properties && Array.isArray(job.properties)) {
      const hasMatch = job.properties.some(prop => {
        const propValue = typeof prop === 'string' || typeof prop === 'number' 
          ? String(prop) 
          : (prop?.property_id || prop?.id || String(prop));
        
        console.log(`Checking property: ${propValue} vs selected: ${selectedProperty}`);
        
        // Try exact match first
        if (String(propValue).toLowerCase() === String(selectedProperty).toLowerCase()) {
          return true;
        }
        
        // Try partial match (in case property ID is embedded in a longer string)
        if (String(propValue).toLowerCase().includes(String(selectedProperty).toLowerCase())) {
          console.log(`Partial match found: ${propValue} contains ${selectedProperty}`);
          return true;
        }
        
        return false;
      });
      if (hasMatch) {
        console.log(`Job ${job.job_id} matches properties array`);
        return true;
      }
    }
    
    // Check profile_image.properties (if available)
    if (job.profile_image?.properties && Array.isArray(job.profile_image.properties)) {
      const hasMatch = job.profile_image.properties.some(prop => {
        const propValue = typeof prop === 'string' || typeof prop === 'number' 
          ? String(prop) 
          : (prop?.property_id || prop?.id || String(prop));
        
        console.log(`Checking profile_image property: ${propValue} vs selected: ${selectedProperty}`);
        
        if (String(propValue).toLowerCase() === String(selectedProperty).toLowerCase()) {
          return true;
        }
        
        if (String(propValue).toLowerCase().includes(String(selectedProperty).toLowerCase())) {
          console.log(`Partial match found in profile_image: ${propValue} contains ${selectedProperty}`);
          return true;
        }
        
        return false;
      });
      if (hasMatch) {
        console.log(`Job ${job.job_id} matches profile_image properties`);
        return true;
      }
    }
    
    // Check rooms.properties (if available)
    if (job.rooms && Array.isArray(job.rooms)) {
      const hasMatch = job.rooms.some(room => {
        console.log(`Checking room ${room.room_id || 'unknown'}:`, {
          room_id: room.room_id,
          room_name: room.name,
          properties: room.properties,
          full_room_data: room
        });
        if (room.properties && Array.isArray(room.properties)) {
          return room.properties.some(prop => {
            const propValue = typeof prop === 'string' || typeof prop === 'number' 
              ? String(prop) 
              : (prop?.property_id || prop?.id || String(prop));
            console.log(`Room property: ${propValue} vs selected: ${selectedProperty}`);
            
            if (String(propValue).toLowerCase() === String(selectedProperty).toLowerCase()) {
              return true;
            }
            
            if (String(propValue).toLowerCase().includes(String(selectedProperty).toLowerCase())) {
              console.log(`Partial match found in room: ${propValue} contains ${selectedProperty}`);
              return true;
            }
            
            return false;
          });
        }
        return false;
      });
      if (hasMatch) {
        console.log(`Job ${job.job_id} matches rooms properties`);
        return true;
      }
    }
    
    // Additional checks for nested property references
    // Check if the job has any other property-related fields
    const allPropertyFields = [
      job.property_id,
      ...(job.properties || []),
      ...(job.profile_image?.properties || []),
      ...(job.rooms?.flatMap(r => r.properties || []) || [])
    ].filter(Boolean);
    
    console.log(`All property fields for job ${job.job_id}:`, allPropertyFields);
    
    // Check if any of these fields contain the selected property
    const hasAnyMatch = allPropertyFields.some(field => {
      const fieldStr = String(field).toLowerCase();
      const selectedStr = String(selectedProperty).toLowerCase();
      
      if (fieldStr === selectedStr || fieldStr.includes(selectedStr)) {
        console.log(`Found match in field: ${field} for property: ${selectedProperty}`);
        return true;
      }
      return false;
    });
    
    if (hasAnyMatch) {
      console.log(`Job ${job.job_id} matches through comprehensive property check`);
      return true;
    }
    
    console.log(`Job ${job.job_id} does not match any property criteria`);
    return false;
  });

  console.log('Filtering results:', {
    totalJobs: jobs.length,
    selectedProperty,
    filteredJobsCount: filteredJobs.length,
    filteredJobIds: filteredJobs.map(j => j.job_id)
  });

  // If no jobs found with strict filtering, try to show all jobs for debugging
  // This helps identify why the filtering is too strict
  if (filteredJobs.length === 0 && selectedProperty) {
    console.warn('⚠️ No jobs found with strict property filtering. This might indicate:');
    console.warn('1. Property ID format mismatch');
    console.warn('2. Property data structure is different than expected');
    console.warn('3. Property relationships are stored differently');
    console.warn('4. Property data might be in a different format or location');
    console.warn('Showing first few jobs for debugging:');
    
    jobs.slice(0, 3).forEach((job, index) => {
      console.log(`=== Job ${index + 1} (${job.job_id}) ===`);
      console.log('Full job object:', job);
      console.log('Property ID:', job.property_id);
      console.log('Properties array:', job.properties);
      console.log('Profile image properties:', job.profile_image?.properties);
      console.log('Rooms:', job.rooms);
      console.log('Rooms properties:', job.rooms?.map(r => r.properties));
      console.log('=== End Job ===');
    });
    
    // Also log the selected property for comparison
    console.log('🔍 Selected Property to match:', selectedProperty);
    console.log('🔍 Selected Property type:', typeof selectedProperty);
    console.log('🔍 Selected Property length:', String(selectedProperty).length);
    
    // TEMPORARY FALLBACK: Show all jobs when filtering fails
    // This allows PDF generation to work while we debug the filtering issue
    console.warn('🔄 TEMPORARY FALLBACK: Using all jobs for PDF generation');
    console.warn('This ensures PDF generation works while we fix the filtering logic');
    console.warn('Remove this fallback once filtering is working correctly');
    console.warn('To remove: Delete lines 490-492 and change "let filteredJobs" back to "const filteredJobs"');
    
    // Override filteredJobs to show all jobs temporarily
    filteredJobs = [...jobs];
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';

    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high': return '#dc2626';
      case 'medium': return '#ea580c';
      case 'low': return '#16a34a';
      default: return '#6b7280';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': return '#16a34a';
      case 'in_progress': return '#2563eb';
      case 'pending': return '#ea580c';
      case 'cancelled': return '#dc2626';
      case 'waiting_sparepart': return '#7c3aed';
      default: return '#6b7280';
    }
  };

  const getUserDisplayName = (user: any): string => {
    if (!user) return 'Unassigned';
    
    // Handle case where user is stringified object "[object Object]"
    if (typeof user === 'string' && user === '[object Object]') {
      return 'Unknown User';
    }
    
    // Handle user as an object with various possible properties
    if (typeof user === 'object' && user) {
      // Priority 1: Check for full_name property (most important for display)
      if ('full_name' in user && user.full_name && user.full_name.trim()) {
        return user.full_name.trim();
      }
      // Priority 2: Check for first_name and last_name combination
      if ('first_name' in user && 'last_name' in user) {
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        if (firstName || lastName) {
          return `${firstName} ${lastName}`.trim();
        }
      }
      // Priority 3: Check for name property
      if ('name' in user && user.name) {
        return user.name;
      }
      // Priority 4: Check for username property (clean Auth0 usernames)
      if ('username' in user && user.username) {
        let cleanUsername = user.username;
        // Clean up Auth0 usernames for better display
        if (cleanUsername.includes('auth0_') || cleanUsername.includes('google-oauth2_')) {
          cleanUsername = cleanUsername.replace(/^(auth0_|google-oauth2_)/, '');
        }
        return cleanUsername;
      }
      // Priority 5: Check for email property
      if ('email' in user && user.email) {
        return user.email.split('@')[0]; // Return part before @ as display name
      }
      // Priority 6: Check for id property (last resort)
      if ('id' in user && user.id) {
        return `User ${user.id}`;
      }
      return 'Unknown User';
    }
    
    // Handle user as string or number - if it's a string, it might be a username
    if (typeof user === 'string') {
      // If it's a string that looks like an ID (numeric), show as User ID
      if (/^\d+$/.test(user)) {
        return `User ${user}`;
      }
      // Otherwise, treat it as a username
      return user;
    }
    
    return 'Unknown User';
  };

  // Helper function to get property information for display
  const getPropertyDisplayInfo = (): { name: string; id: string | null } => {
    if (!selectedProperty) {
      return { name: 'All Properties', id: null };
    }
    
    if (propertyName) {
      return { name: propertyName, id: selectedProperty };
    }
    
    // Try to find property name from jobs if available
    const jobWithProperty = jobs.find(job => {
      if (job.property_id === selectedProperty) return true;
      if (job.properties?.some(prop => String(prop) === String(selectedProperty))) return true;
      if (job.profile_image?.properties?.some(prop => String(prop) === String(selectedProperty))) return true;
      if (job.rooms?.some(room => room.properties?.some(prop => String(prop) === String(selectedProperty)))) return true;
      return false;
    });
    
    if (jobWithProperty) {
      return { name: `Property ${selectedProperty}`, id: selectedProperty };
    }
    
    return { name: `Property ${selectedProperty}`, id: selectedProperty };
  };

  const truncateText = (text: string, maxLength: number = 120): string => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  // Calculate comprehensive statistics
  const totalJobs = filteredJobs.length;
  const completedJobs = filteredJobs.filter(job => job.status === 'completed').length;
  const inProgressJobs = filteredJobs.filter(job => job.status === 'in_progress').length;
  const pendingJobs = filteredJobs.filter(job => job.status === 'pending').length;
  const cancelledJobs = filteredJobs.filter(job => job.status === 'cancelled').length;
  const waitingSparepartJobs = filteredJobs.filter(job => job.status === 'waiting_sparepart').length;
  const highPriorityJobs = filteredJobs.filter(job => job.priority === 'high').length;
  const mediumPriorityJobs = filteredJobs.filter(job => job.priority === 'medium').length;
  const lowPriorityJobs = filteredJobs.filter(job => job.priority === 'low').length;
  
  // Calculate completion rate
  const completionRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;
  
  // Calculate average response time (if completed jobs exist)
  const completedJobDates = filteredJobs
    .filter(job => job.status === 'completed' && job.completed_at)
    .map(job => new Date(job.completed_at!).getTime() - new Date(job.created_at).getTime());
  
  const averageResponseTime = completedJobDates.length > 0 
    ? Math.round(completedJobDates.reduce((sum, time) => sum + time, 0) / completedJobDates.length / (1000 * 60 * 60 * 24)) // Convert to days
    : 0;

  // Group jobs by status for better organization
  const jobsByStatus = {
    completed: filteredJobs.filter(job => job.status === 'completed'),
    in_progress: filteredJobs.filter(job => job.status === 'in_progress'),
    pending: filteredJobs.filter(job => job.status === 'pending'),
    cancelled: filteredJobs.filter(job => job.status === 'cancelled'),
    waiting_sparepart: filteredJobs.filter(job => job.status === 'waiting_sparepart'),
  };

  // Jobs per page for better pagination
  const jobsPerPage = 6;
  const pageGroups = [];
  for (let i = 0; i < filteredJobs.length; i += jobsPerPage) {
    pageGroups.push(filteredJobs.slice(i, i + jobsPerPage));
  }

  if (filteredJobs.length === 0) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.headerText}>{reportTitle}</Text>
            <Text style={styles.subHeaderText}>
              {getPropertyDisplayInfo().name}
              {getPropertyDisplayInfo().id && ` (ID: ${getPropertyDisplayInfo().id})`}
            </Text>
          </View>
          <Text style={styles.noDataMessage}>No jobs found for the selected criteria.</Text>
        </Page>
      </Document>
    );
  }

  // Add error boundary for PDF generation
  try {
    return (
      <Document>
        {pageGroups.map((jobGroup, pageIndex) => (
          <Page key={pageIndex} size="A4" style={styles.page}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerText}>{reportTitle}</Text>
              <Text style={styles.subHeaderText}>
                {getPropertyDisplayInfo().name}
                {getPropertyDisplayInfo().id && ` (ID: ${getPropertyDisplayInfo().id})`}
              </Text>
              <Text style={styles.subHeaderText}>
                Filter: {FILTER_TITLES[filter] || filter} | Generated: {new Date().toLocaleDateString()}
              </Text>
            </View>

            {/* Statistics Section - Only on first page */}
            {pageIndex === 0 && includeStatistics && (
              <>
                <View style={styles.metadata}>
                  <Text style={styles.metadataItem}>Total Jobs: {totalJobs}</Text>
                  <Text style={styles.metadataItem}>Filter: {FILTER_TITLES[filter] || filter}</Text>
                  <Text style={styles.metadataItem}>Date: {new Date().toLocaleDateString()}</Text>
                </View>
                
                <View style={styles.statistics}>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{totalJobs}</Text>
                    <Text style={styles.statLabel}>Total Jobs</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{completedJobs}</Text>
                    <Text style={styles.statLabel}>Completed</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{inProgressJobs}</Text>
                    <Text style={styles.statLabel}>In Progress</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{pendingJobs}</Text>
                    <Text style={styles.statLabel}>Pending</Text>
                  </View>
                </View>
                
                <View style={styles.statistics}>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{completionRate}%</Text>
                    <Text style={styles.statLabel}>Completion Rate</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{highPriorityJobs}</Text>
                    <Text style={styles.statLabel}>High Priority</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{waitingSparepartJobs}</Text>
                    <Text style={styles.statLabel}>Waiting Parts</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{averageResponseTime}d</Text>
                    <Text style={styles.statLabel}>Avg Response</Text>
                  </View>
                </View>
              </>
            )}

            {/* Jobs List */}
            
            
            {jobGroup.map((job, jobIndex) => {
              // Debug logging for image data
              if (includeImages) {
                console.log(`Job ${job.job_id} image data:`, {
                  hasImages: !!job.images,
                  imagesLength: job.images?.length || 0,
                  hasImageUrls: !!job.image_urls,
                  imageUrlsLength: job.image_urls?.length || 0,
                  firstImage: job.images?.[0],
                  firstImageUrl: job.image_urls?.[0]
                });
              }
              
              return (
              <View 
                key={job.job_id} 
                style={[
                  styles.jobRow, 
                  jobIndex % 2 === 0 ? {} : styles.jobRowAlternate
                ]} 
                wrap={false}
              >
                {/* Image Column */}
                <View style={styles.imageColumn}>
                  {includeImages && ((job.images && job.images.length > 0) || (job.image_urls && job.image_urls.length > 0)) ? (
                    (() => {
                    try {
                      // Get image URL from either images array or image_urls array
                      let imageUrl: string;
                      let imageSource = 'none';
                      
                      console.log('PDF Debug - Available image sources:', {
                        hasImages: !!job.images,
                        imagesLength: job.images?.length || 0,
                        hasImageUrls: !!job.image_urls,
                        imageUrlsLength: job.image_urls?.length || 0,
                        firstImage: job.images?.[0],
                        firstImageUrl: job.image_urls?.[0]
                      });
                    
                    if (job.images && job.images.length > 0) {
                      // Use JobImage object structure
                      imageUrl = job.images[0].image_url;
                      imageSource = 'job.images[0].image_url';
                      console.log('PDF Debug - Using image from job.images:', imageUrl);
                    } else if (job.image_urls && job.image_urls.length > 0) {
                      // Use direct string array
                      imageUrl = job.image_urls[0];
                      imageSource = 'job.image_urls[0]';
                      console.log('PDF Debug - Using image from job.image_urls:', imageUrl);
                    } else {
                      console.log('PDF Debug - No images found in either source');
                      return (
                        <View style={[styles.jobImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 8, color: '#9ca3af' }}>No Image</Text>
                        </View>
                      );
                    }
                    
                    // For PDF generation, we need absolute URLs
                    // Since the image URLs have already been processed by fixJobImageUrls,
                    // they should already have the /media/ prefix
                    if (imageUrl && !imageUrl.startsWith('http')) {
                      // Try to use the environment variable first, then fallback to localhost
                      const baseUrl = process.env.NEXT_PUBLIC_MEDIA_URL || 'http://localhost:8000';
                      
                      console.log('PDF Environment Variables:', {
                        NEXT_PUBLIC_MEDIA_URL: process.env.NEXT_PUBLIC_MEDIA_URL,
                        NODE_ENV: process.env.NODE_ENV,
                        baseUrl: baseUrl
                      });
                      console.log('PDF Image URL (relative):', imageUrl);
                      
                      // The image URL should already have /media/ prefix from fixJobImageUrls
                      // Just add the base URL to make it absolute
                      imageUrl = `${baseUrl}${imageUrl}`;
                    }
                    
                    // For PDF generation, convert WebP to JPEG if needed
                    // @react-pdf/renderer only supports JPG, JPEG, PNG, and GIF
                    if (imageUrl && imageUrl.toLowerCase().endsWith('.webp')) {
                      // If the image is WebP and no JPEG path is available, try to construct a JPEG URL
                      console.log('PDF Debug - WebP image detected, attempting to use JPEG version');
                      const jpegUrl = imageUrl.replace(/\.webp$/i, '.jpg');
                      console.log('PDF Debug - Attempting JPEG URL:', jpegUrl);
                      imageUrl = jpegUrl;
                    }
                    
                    // Additional check: if we still have WebP after conversion attempts, show placeholder
                    if (imageUrl && imageUrl.toLowerCase().includes('.webp')) {
                      console.log('PDF Debug - WebP still detected after conversion attempts, showing placeholder');
                      return (
                        <View style={[styles.jobImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 8, color: '#9ca3af', textAlign: 'center' }}>
                            WebP Image
                          </Text>
                          <Text style={{ fontSize: 6, color: '#9ca3af', textAlign: 'center' }}>
                            (Convert to JPEG)
                          </Text>
                        </View>
                      );
                    }
                    
                    // Final fallback: if we have a supported format, try to use it
                    const finalImageExtension = imageUrl.split('.').pop()?.toLowerCase();
                    if (finalImageExtension && ['jpg', 'jpeg', 'png', 'gif'].includes(finalImageExtension)) {
                      console.log('PDF Debug - Using supported image format:', finalImageExtension);
                    } else {
                      console.log('PDF Debug - Unsupported format, showing placeholder');
                      return (
                        <View style={[styles.jobImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 8, color: '#9ca3af', textAlign: 'center' }}>
                            No Image
                          </Text>
                          <Text style={{ fontSize: 6, color: '#9ca3af', textAlign: 'center' }}>
                            (Format not supported)
                          </Text>
                        </View>
                      );
                    }
                    

                    
                    console.log('PDF Debug - Final image processing:', {
                      originalUrl: job.images?.[0]?.image_url || job.image_urls?.[0],
                      processedUrl: imageUrl,
                      finalUrl: imageUrl,
                      imageSource: imageSource,

                      isWebP: imageUrl.toLowerCase().includes('.webp'),
                      convertedToJpeg: imageUrl.toLowerCase().includes('.jpg') || imageUrl.toLowerCase().includes('.jpeg'),
                      finalExtension: imageUrl.split('.').pop()?.toLowerCase()
                    });
                    
                    // Try to load the image, but if it fails, show a placeholder
                    console.log('PDF Debug - Attempting to load image:', imageUrl);
                    
                    // TEST: Try a simple test image first to verify PDF generation works
                    if (process.env.NODE_ENV === 'development') {
                      console.log('PDF Debug - Development mode, attempting to load test image');
                    }
                    
                    // Safety check: ensure imageUrl is defined
                    if (typeof imageUrl === 'undefined') {
                      console.log('PDF Debug - imageUrl is undefined, showing placeholder');
                      return (
                        <View style={[styles.jobImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 8, color: '#ef4444', textAlign: 'center' }}>
                            Image Error
                          </Text>
                          <Text style={{ fontSize: 6, color: '#9ca3af', textAlign: 'center' }}>
                            (Undefined URL)
                          </Text>
                        </View>
                      );
                    }
                    
                    // Try to load the image with better error handling
                    console.log('PDF Debug - Final image URL to load:', imageUrl);
                    
                    // Check if the URL looks valid
                    if (!imageUrl || imageUrl === 'undefined' || imageUrl === 'null') {
                      console.log('PDF Debug - Invalid image URL, showing placeholder');
                      return (
                        <View style={[styles.jobImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 8, color: '#9ca3af', textAlign: 'center' }}>
                            No Image
                          </Text>
                          <Text style={{ fontSize: 6, color: '#9ca3af', textAlign: 'center' }}>
                            (Invalid URL)
                          </Text>
                        </View>
                      );
                    }
                    
                    // Additional validation: check if URL has proper format
                    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/media/')) {
                      console.log('PDF Debug - Malformed image URL:', imageUrl);
                      return (
                        <View style={[styles.jobImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 8, color: '#9ca3af', textAlign: 'center' }}>
                            No Image
                          </Text>
                          <Text style={{ fontSize: 6, color: '#9ca3af', textAlign: 'center' }}>
                            (Malformed URL)
                          </Text>
                        </View>
                      );
                    }
                    
                    // Final attempt to load the image
                    console.log('PDF Debug - Attempting to load image with URL:', imageUrl);
                    
                    return (
                      <Image
                        src={imageUrl}
                        style={styles.jobImage}
                        cache={false}
                      />
                    );
                    } catch (imageError) {
                      console.error('PDF Image processing error:', imageError);
                      return (
                        <View style={[styles.jobImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 8, color: '#ef4444', textAlign: 'center' }}>
                            Image Error
                          </Text>
                          <Text style={{ fontSize: 6, color: '#9ca3af', textAlign: 'center' }}>
                            Failed to load
                          </Text>
                        </View>
                      );
                    }
                  })()
                ) : (
                  <View style={[styles.jobImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 8, color: '#9ca3af' }}>No Image</Text>
                  </View>
                )}
              </View>

              {/* Information Column - Two Column Layout */}
              <View style={styles.infoColumn}>
                {/* Left Column */}
                <View style={styles.infoLeftColumn}>
                  <Text style={styles.label}>Job ID:</Text>
                  <Text style={styles.value}>#{job.job_id}</Text>
                  
                  <Text style={styles.label}>Topics:</Text>
                  <Text style={styles.value}>
                    {job.topics && job.topics.length > 0 
                      ? job.topics.map(topic => topic.title).join(', ')
                      : 'N/A'
                    }
                  </Text>
                  
                  <Text style={styles.label}>Description:</Text>
                  <Text style={styles.value}>{truncateText(job.description, 120)}</Text>
                </View>
                
                {/* Right Column */}
                <View style={styles.infoRightColumn}>
                  <Text style={styles.label}>Location:</Text>
                  <Text style={styles.value}>
                    {job.rooms && job.rooms.length > 0 
                      ? job.rooms.map(room => room.name || room.room_id).join(', ')
                      : 'N/A'
                    }
                  </Text>
                  
                  <Text style={styles.label}>Staff:</Text>
                  <Text style={styles.value}>{getUserDisplayName(job.user)}</Text>
                  
                  <Text style={styles.label}>Remarks:</Text>
                  <Text style={styles.value}>
                    {job.remarks ? truncateText(job.remarks, 80) : 'N/A'}
                  </Text>
                </View>
              </View>

              {/* Status Column */}
              <View style={styles.statusColumn}>
                <Text style={styles.label}>Status:</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) + '20', color: getStatusColor(job.status), marginBottom: 4 }]}>
                  <Text style={[styles.statusBadge, { backgroundColor: 'transparent', color: getStatusColor(job.status) }]}>
                    {job.status.replace('_', ' ')}
                  </Text>
                </View>
                
                <Text style={styles.label}>Priority:</Text>
                <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(job.priority) + '20', color: getPriorityColor(job.priority), marginBottom: 4 }]}>
                  <Text style={[styles.priorityBadge, { backgroundColor: 'transparent', color: getPriorityColor(job.priority) }]}>
                    {job.priority}
                  </Text>
                </View>
                
                <Text style={styles.label}>Created:</Text>
                <Text style={styles.dateText}>{formatDate(job.created_at)}</Text>
                
                <Text style={styles.label}>Updated:</Text>
                <Text style={styles.dateText}>{formatDate(job.updated_at)}</Text>
              </View>
            </View>
          );
        })}

          {/* Footer */}
          <View style={styles.footer} fixed>
            <Text>Generated by Facility Management System | {new Date().toLocaleDateString()}</Text>
          </View>

          {/* Page Number */}
          <Text 
            style={styles.pageNumber} 
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} 
            fixed 
          />
        </Page>
      ))}
    </Document>
  );
  } catch (error) {
    console.error('PDF Generation Error:', error);
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.headerText}>PDF Generation Error</Text>
            <Text style={styles.subHeaderText}>An error occurred while generating the PDF</Text>
          </View>
          <Text style={styles.noDataMessage}>
            Error: {error instanceof Error ? error.message : 'Unknown error occurred'}
          </Text>
        </Page>
      </Document>
    );
  }
};

export default JobsPDFDocument;
