"use client";

import React, { useState, useCallback, useMemo, MouseEvent, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { UpdateStatusModal } from "./UpdateStatusModal";
import { Job, JobStatus, Property } from "@/app/lib/types";
import { LazyImage } from "@/app/components/jobs/LazyImage";
import { OptimizedImage, OptimizedThumbnail } from "@/app/components/ui/OptimizedImage";
import Image from 'next/image';
import { 
  Clock, Calendar, User, MapPin, MessageSquare, CheckCircle2, 
  AlertCircle, ClipboardList, StickyNote, AlertTriangle, 
  ChevronDown, ChevronUp 
} from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/lib/stores/mainStore";
import { MissingImage } from "@/app/components/jobs/MissingImage";
import { createImageUrl } from "@/app/lib/utils/image-utils";
import { formatDate, formatDateTime } from "@/app/lib/utils/date-utils";
import { useSession } from "@/app/lib/session.client";

interface JobCardProps {
  job: Job;
  properties?: Property[];
  viewMode?: 'grid' | 'list';
}

export function JobCard({ job, properties = [], viewMode = 'grid' }: JobCardProps) {
  // This component handles tracking prevention issues with Google profile images
  // When browsers block Google profile images, it gracefully falls back to a user icon
  
  // Safety check for job object
  if (!job) {
    console.error('JobCard: job prop is undefined or null');
    return (
      <div className="w-full p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">Error: Job data is missing</p>
      </div>
    );
  }
  
  const router = useRouter();
  const { selectedPropertyId: selectedProperty } = useUser();
  const { data: session } = useSession();
  const [selectedImage, setSelectedImage] = useState<number>(0);
  const [failedImageIndexes, setFailedImageIndexes] = useState<Set<number>>(new Set());
  const [expandedSections, setExpandedSections] = useState({
    details: false,
    timestamps: false,
    remarks: false,
  });

  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    
    if (Array.isArray(job.images)) {
      for (const img of job.images) {
        if (img?.image_url) {
          const fixedUrl = createImageUrl(img.image_url);
          if (fixedUrl) {
            urls.push(fixedUrl);
            console.log('🔍 JobCard image URL created:', { original: img.image_url, fixed: fixedUrl });
          }
        }
      }
    }
    if (Array.isArray(job.image_urls)) {
      for (const url of job.image_urls) {
        if (url) {
          const fixedUrl = createImageUrl(url);
          if (fixedUrl && !urls.includes(fixedUrl)) {
            urls.push(fixedUrl);
            console.log('🔍 JobCard image URL created:', { original: url, fixed: fixedUrl });
          }
        }
      }
    }
    console.log('🔍 JobCard final image URLs:', urls);
    return urls;
  }, [job.images, job.image_urls]);

  const toggleSection = useCallback((section: keyof typeof expandedSections, e: MouseEvent) => {
    e.stopPropagation();
    console.log('🔍 Toggling section:', section, 'for job:', job.job_id);
    
    try {
      setExpandedSections(prev => ({
        ...prev,
        [section]: !prev[section]
      }));
      
      // Additional logging for staff details section
      if (section === 'details') {
        console.log('🔍 Staff details section toggled. Job user data:', {
          jobUserId: job.user,
          jobUserIdType: typeof job.user,
          sessionUserId: session?.user?.id,
          sessionUsername: session?.user?.username,
          sessionPositions: session?.user?.positions
        });
      }
    } catch (error) {
      console.error('Error toggling section:', section, error);
    }
  }, [job.job_id, job.user, session]);

  const getPropertyName = useCallback((): string => {
    const jobProperties = [
      ...(job.profile_image?.properties || []),
      ...(job.properties || []),
      ...(job.rooms?.flatMap(room => room.properties || []) || []),
    ];

    if (selectedProperty) {
      const matchingProperty = jobProperties.find(
        prop =>
          typeof prop === 'object' && 'property_id' in prop
            ? String(prop.property_id) === selectedProperty
            : String(prop) === selectedProperty
      );

      if (matchingProperty) {
        if (typeof matchingProperty === 'object' && 'name' in matchingProperty) {
          return matchingProperty.name as string;
        }
        const fullProperty = properties.find(p => String(p.property_id) === selectedProperty);
        return fullProperty?.name || 'N/A';
      }
    }

    const firstMatchingProperty = jobProperties.find(
      prop => typeof prop === 'object' && 'name' in prop
    );

    if (typeof firstMatchingProperty === 'object' && 'name' in firstMatchingProperty) {
      return firstMatchingProperty.name as string;
    }

    const propertyFromList = properties.find(p =>
      jobProperties.some(jobProp =>
        typeof jobProp === 'object' && 'property_id' in jobProp
          ? String(jobProp.property_id) === String(p.property_id)
          : String(jobProp) === String(p.property_id)
      )
    );

    return propertyFromList?.name || 'N/A';
  }, [job, selectedProperty, properties]);

  const getStatusConfig = (status: JobStatus) => {
    const configs = {
      completed: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-green-100 text-green-800', label: 'Completed' },
      in_progress: { icon: <Clock className="w-4 h-4" />, color: 'bg-blue-100 text-blue-800', label: 'In Progress' },
      pending: { icon: <AlertCircle className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      cancelled: { icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-red-100 text-red-800', label: 'Cancelled' },
      waiting_sparepart: { icon: <ClipboardList className="w-4 h-4" />, color: 'bg-purple-100 text-purple-800', label: 'Waiting Sparepart' }
    };
    return configs[status] || configs.pending;
  };

  const formatDate = useCallback((dateString: string) => {
    try {
      return formatDateTime(dateString);
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  }, []);

  const statusConfig = useMemo(() => getStatusConfig(job.status), [job.status]);

  const handleImageError = useCallback((index: number) => {
    setFailedImageIndexes(prev => {
      const next = new Set(prev);
      next.add(index);
      setSelectedImage(prevSelected => {
        if (prevSelected !== index) return prevSelected;
        const nextIndex = imageUrls.findIndex((_, i) => i !== index && !next.has(i));
        return nextIndex !== -1 ? nextIndex : prevSelected;
      });
      return next;
    });
  }, [imageUrls]);

  // Helper functions to get user display information
  const getUserDisplayName = useCallback((user: Job['user'] | undefined) => {
    if (!user) return 'Unassigned';
    
    // Handle user as an object with various possible properties
    if (typeof user === 'object' && user) {
      // Priority 1: Check for full_name property (most important for display)
      if ('full_name' in user && user.full_name && typeof user.full_name === 'string' && user.full_name.trim()) {
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
      // Priority 6: Check for id property (continue with ID-based logic below)
      if ('id' in user && user.id) {
        user = user.id; // Continue with ID-based logic below
      } else {
        return 'Unknown User'; // Can't extract meaningful info from object
      }
    }
    
    // Use session data passed from component level
    if (!session?.user) return typeof user === 'string' ? `User ${user}` : 'Unknown User';
    
    // Normalize user IDs for comparison (handle different formats)
    const jobUserId = String(user).trim();
    const sessionUserId = String(session.user.id || '').trim();
    
    console.log('🔍 JobCard getUserDisplayName debug:', {
      jobUserId,
      sessionUserId,
      sessionUsername: session.user.username,
      jobUserIdType: typeof user,
      sessionUserIdType: typeof session.user.id,
      isExactMatch: jobUserId === sessionUserId,
      jobUserIdLower: jobUserId.toLowerCase(),
      sessionUserIdLower: sessionUserId.toLowerCase(),
      isLowerMatch: jobUserId.toLowerCase() === sessionUserId.toLowerCase()
    });
    
    // Try multiple comparison methods
    // Exact match
    if (jobUserId === sessionUserId) {
      console.log('✅ Exact ID match found');
      return session.user.username || 'You';
    }
    
    // Case-insensitive match
    if (jobUserId.toLowerCase() === sessionUserId.toLowerCase()) {
      console.log('✅ Case-insensitive ID match found');
      return session.user.username || 'You';
    }
    
    // Check if both are Google OAuth IDs (might have different formats)
    if (jobUserId.includes('google-oauth2_') && sessionUserId.includes('google-oauth2_')) {
      // Extract the numeric part and compare
      const jobNumeric = jobUserId.replace('google-oauth2_', '');
      const sessionNumeric = sessionUserId.replace('google-oauth2_', '');
      if (jobNumeric === sessionNumeric) {
        console.log('✅ Google OAuth numeric match found');
        return session.user.username || 'You';
      }
    }
    
    // If user is just an ID, try to get username from session or return a formatted ID
    if (typeof user === 'string' && user.includes('google-oauth2_')) {
      return 'Google User'; // Generic name for Google OAuth users
    }
    return `User ${String(user)}`;
  }, [session]);

  const getUserDisplayPosition = useCallback((user: Job['user'] | undefined) => {
    if (!user) return 'Staff';
    if (typeof user === 'object' && user && 'positions' in user) {
      return user.positions;
    }
    
    // Use session data passed from component level
    if (!session?.user) return 'Staff';
    
    // Use the same comparison logic as getUserDisplayName
    const jobUserId = String(user).trim();
    const sessionUserId = String(session.user.id || '').trim();
    
    // Try multiple comparison methods
    if (jobUserId === sessionUserId || 
        jobUserId.toLowerCase() === sessionUserId.toLowerCase()) {
      return session.user.positions || 'Staff';
    }
    
    // Check Google OAuth numeric match
    if (jobUserId.includes('google-oauth2_') && sessionUserId.includes('google-oauth2_')) {
      const jobNumeric = jobUserId.replace('google-oauth2_', '');
      const sessionNumeric = sessionUserId.replace('google-oauth2_', '');
      if (jobNumeric === sessionNumeric) {
        return session.user.positions || 'Staff';
      }
    }
    
    return 'Staff';
  }, [session]);

  // Enhanced image handling with tracking prevention protection
  const [profileImageError, setProfileImageError] = useState(false);

  const handleProfileImageError = useCallback((error: any) => {
    console.warn('Profile image failed to load (possibly blocked by tracking prevention):', error);
    console.log('🔍 JobCard profile image error details:', {
      jobId: job.job_id,
      userId: job.user,
      profileImageUrl: job.profile_image?.profile_image,
      error: error?.message || error
    });
    console.log('💡 This is likely due to browser tracking prevention blocking Google profile images');
    setProfileImageError(true);
  }, [job.job_id, job.user, job.profile_image?.profile_image]);

  // Reset profile image error when job changes
  useEffect(() => {
    setProfileImageError(false);
    
    // Debug logging for profile images
    if (job.profile_image?.profile_image) {
      console.log('🔍 JobCard profile image debug:', {
        jobId: job.job_id,
        profileImageUrl: job.profile_image.profile_image,
        isGoogleImage: job.profile_image.profile_image.includes('googleusercontent.com'),
        mayBeBlocked: job.profile_image.profile_image.includes('lh3.googleusercontent.com')
      });
    }
  }, [job.job_id, job.profile_image?.profile_image]);

  // Safe profile image URL creation with fallback
  const getSafeProfileImageUrl = useCallback((imageUrl: string | null | undefined): string | null => {
    if (!imageUrl) return null;
    
    try {
      // Check if it's a Google profile image that might be blocked
      if (imageUrl.includes('lh3.googleusercontent.com') || imageUrl.includes('googleusercontent.com')) {
        console.log('⚠️ Google profile image detected - may be blocked by tracking prevention');
        console.log('🔍 Profile image URL:', imageUrl);
        console.log('💡 This image may be blocked by browser tracking prevention');
        // Return the URL but be prepared for it to fail
        return imageUrl;
      }
      
      // For other images, use the normal creation method
      return createImageUrl(imageUrl);
    } catch (error) {
      console.error('Error creating profile image URL:', error);
      return null;
    }
  }, []);

  const handleThumbnailClick = (index: number, e: MouseEvent) => {
    e.stopPropagation();
    if (!imageUrls[index] || failedImageIndexes.has(index)) return;
    setSelectedImage(index);
  };

  const handleStatusUpdateComplete = useCallback(() => {
    window.location.reload();
  }, []);

  const handleCardClick = useCallback((e: MouseEvent) => {
    router.push(`/dashboard/jobs/${job.job_id}`);
  }, [job.job_id, router]);

  return (
    <Card 
      className={`w-full flex flex-col transition-all duration-200 bg-white shadow hover:shadow-md cursor-pointer mobile-card ${
        viewMode === 'list' 
          ? "max-w-none" 
          : "max-w-none sm:max-w-md mx-auto"
      }`}
      onClick={handleCardClick}
    >
      <CardHeader className="flex-shrink-0 p-3 sm:p-4 pb-2 sm:pb-3 border-b border-gray-100">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-grow min-w-0">
              <CardTitle className="text-sm sm:text-base font-semibold text-gray-900 line-clamp-2 leading-tight">
                {job.topics?.[0]?.title || 'No Topic'}
              </CardTitle>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="truncate max-w-full">
                  {(() => {
                    if (!job.rooms || job.rooms.length === 0) {
                      return `N/A - ${getPropertyName()}`;
                    }
                    const room = job.rooms[0];
                    const roomParts = [];
                    
                    // Add room ID if available
                    if (room.room_id) {
                      roomParts.push(`Room ID: #${room.room_id}`);
                    }
                    
                    // Add room type if available
                    if (room.room_type) {
                      roomParts.push(`Type: ${room.room_type}`);
                    }
                    
                    // Add room name
                    const roomName = room.name || 'Unknown';
                    roomParts.push(roomName);
                    
                    // Join parts with " | " and add property name
                    return `${roomParts.join(' | ')} - ${getPropertyName()}`;
                  })()}
                </span>
              </div>
            </div>
            <Badge 
              variant="secondary"
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium flex-shrink-0 ${statusConfig.color} whitespace-nowrap`}
            >
              {statusConfig.icon}
              <span className="hidden xs:inline">{statusConfig.label}</span>
            </Badge>
          </div>
          
          {/* Mobile-friendly priority and status indicators */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge 
              variant="outline" 
              className="px-2 py-0.5 text-xs font-medium"
            >
              {job.priority?.charAt(0).toUpperCase() + job.priority?.slice(1) || 'Medium'}
            </Badge>
            {job.is_defective && (
              <Badge variant="destructive" className="px-2 py-0.5 text-xs">
                Defective
              </Badge>
            )}
            {job.is_preventivemaintenance && (
              <Badge variant="secondary" className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700">
                PM
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-grow p-3 sm:p-4 space-y-3 sm:space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className={`space-y-2 ${
          viewMode === 'list' ? "flex flex-col sm:flex-row gap-3 sm:gap-4" : ""
        }`}>
          <div className={`relative overflow-hidden rounded-md bg-gray-100 ${
            viewMode === 'list' 
              ? "w-full sm:w-32 h-32 sm:h-24 flex-shrink-0" 
              : "w-full aspect-video"
          }`}>
            {imageUrls.length > 0 && imageUrls[selectedImage] && !failedImageIndexes.has(selectedImage) ? (
              <div className="w-full h-full relative">
                <Image
                  src={imageUrls[selectedImage]}
                  alt={`Job Image ${selectedImage + 1}`}
                  fill
                  className="object-cover rounded-md"
                  quality={75}
                  unoptimized={imageUrls[selectedImage].startsWith('/media/')}
                  onError={() => handleImageError(selectedImage)}
                />
              </div>
            ) : (
              <MissingImage className="w-full h-full" />
            )}
          </div>
          {imageUrls.length > 1 && viewMode === 'grid' && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
              {imageUrls.map((url, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={(e) => handleThumbnailClick(index, e)}
                  className={`w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 rounded-md overflow-hidden border transition-all touch-target ${
                    selectedImage === index ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"
                  } ${
                    (!url || failedImageIndexes.has(index)) ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  disabled={!url || failedImageIndexes.has(index)}
                >
                  {(!url || failedImageIndexes.has(index)) ? (
                    <MissingImage className="w-full h-full" iconClassName="w-5 h-5" />
                  ) : (
                    <div className="w-full h-full relative">
                      <Image
                        src={url}
                        alt={`Thumbnail ${index + 1}`}
                        fill
                        className="object-cover"
                        quality={60}
                        unoptimized={url.startsWith('/media/')}
                        onError={() => handleImageError(index)}
                      />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`flex items-start gap-2 bg-gray-50 p-2 sm:p-3 rounded-lg ${
          viewMode === 'list' ? "flex-1" : ""
        }`}>
          <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 flex-shrink-0" />
          <p className="text-xs sm:text-sm text-gray-700 leading-relaxed line-clamp-3 sm:line-clamp-2">
            {job.description || 'No description provided'}
          </p>
        </div>

        {job.remarks && (
          <div className="border-t border-gray-100 pt-2 sm:pt-3">
            <Button
              variant="ghost"
              className="w-full flex justify-between items-center p-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 rounded-md touch-target"
              onClick={(e) => toggleSection('remarks', e)}
            >
              <span className="font-medium flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-gray-400" />
                <span className="hidden xs:inline">Remarks</span>
                <span className="xs:hidden">Notes</span>
              </span>
              {expandedSections.remarks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            {expandedSections.remarks && (
              <div className="mt-2 p-2 sm:p-3 bg-gray-50 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{job.remarks}</p>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-gray-100 pt-2 sm:pt-3">
          <Button
            variant="ghost"
            className="w-full flex justify-between items-center p-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 rounded-md touch-target"
            onClick={(e) => toggleSection('details', e)}
          >
            <span className="font-medium flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="hidden xs:inline">Staff Details</span>
              <span className="xs:hidden">Staff</span>
            </span>
            {expandedSections.details ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          {expandedSections.details && (
            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 mt-2 bg-gray-50 rounded-lg">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden border border-gray-100 flex-shrink-0 bg-white">
                {job.profile_image && job.profile_image.profile_image && !profileImageError ? (
                  <Image
                    src={getSafeProfileImageUrl(job.profile_image.profile_image) || ''}
                    alt={String(getUserDisplayName(job.user) || 'User')}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover rounded-full"
                    quality={60}
                    unoptimized={true}
                    onError={() => handleProfileImageError(new Error('Image load failed'))}
                  />
                ) : (
                  <div 
                    className="w-full h-full bg-gray-100 flex items-center justify-center relative" 
                    title={profileImageError ? "Profile image blocked by tracking prevention" : "Profile image not available"}
                  >
                    <User className="w-5 h-5 text-gray-400" />
                    {profileImageError && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border border-white" title="Image blocked by tracking prevention">
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-700">
                  {(() => {
                    try {
                      // Additional safety check for job.user
                      if (!job.user) {
                        console.warn('JobCard: job.user is undefined or null');
                        return 'Unassigned';
                      }
                      const displayName = getUserDisplayName(job.user);
                      return typeof displayName === 'string' ? displayName : 'Unknown User';
                    } catch (error) {
                      console.error('Error getting user display name:', error);
                      return 'Unknown User';
                    }
                  })()}
                </p>
                <p className="text-xs text-gray-500">
                  {(() => {
                    try {
                      // Additional safety check for job.user
                      if (!job.user) {
                        console.warn('JobCard: job.user is undefined or null');
                        return 'Unassigned';
                      }
                      return getUserDisplayPosition(job.user);
                    } catch (error) {
                      console.error('Error getting user display position:', error);
                      return 'Staff';
                    }
                  })()}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-2 sm:pt-3">
          <Button
            variant="ghost"
            className="w-full flex justify-between items-center p-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 rounded-md touch-target"
            onClick={(e) => toggleSection('timestamps', e)}
          >
            <span className="font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="hidden xs:inline">Timestamps</span>
              <span className="xs:hidden">Time</span>
            </span>
            {expandedSections.timestamps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          {expandedSections.timestamps && (
            <div className="space-y-2 mt-2 p-2 sm:p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate"><span className="font-medium">Created:</span> {formatDate(job.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate"><span className="font-medium">Updated:</span> {formatDate(job.updated_at)}</span>
              </div>
              {job.completed_at && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="truncate"><span className="font-medium">Completed:</span> {formatDate(job.completed_at)}</span>
                </div>
              )}
              {job.status === "in_progress" && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0"></span>
                  <span className="truncate">In progress since {formatDate(job.updated_at)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-2 sm:pt-3 border-t border-gray-100">
          <UpdateStatusModal 
            job={job}
            onComplete={handleStatusUpdateComplete}
          >
            <Button 
              variant="outline" 
              size="sm"
              className="w-full text-xs sm:text-sm h-8 sm:h-9 font-medium hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors touch-target"
            >
              <span className="hidden xs:inline">Update Status</span>
              <span className="xs:hidden">Update</span>
            </Button>
          </UpdateStatusModal>
        </div>
      </CardContent>
    </Card>
  );
}
