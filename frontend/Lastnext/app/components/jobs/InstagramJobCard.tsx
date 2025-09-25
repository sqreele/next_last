"use client";

import React, { useMemo, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Job, JobStatus } from "@/app/lib/types";
import { createImageUrl } from "@/app/lib/utils/image-utils";
import { Badge } from "@/app/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, AlertTriangle, ClipboardList, ImageOff, User, Calendar, MessageSquare } from "lucide-react";

type ViewMode = "grid" | "list";

interface InstagramJobCardProps {
  job: Job;
  viewMode?: ViewMode;
}

function getStatusConfig(status: JobStatus) {
  const configs = {
    completed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "bg-green-100 text-green-700", label: "Completed" },
    in_progress: { icon: <Clock className="w-3.5 h-3.5" />, color: "bg-blue-100 text-blue-700", label: "In Progress" },
    pending: { icon: <AlertCircle className="w-3.5 h-3.5" />, color: "bg-yellow-100 text-yellow-700", label: "Pending" },
    cancelled: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "bg-red-100 text-red-700", label: "Cancelled" },
    waiting_sparepart: { icon: <ClipboardList className="w-3.5 h-3.5" />, color: "bg-purple-100 text-purple-700", label: "Waiting Sparepart" },
  } as const;
  return (configs as any)[status] || configs.pending;
}

export default function InstagramJobCard({ job, viewMode = "grid" }: InstagramJobCardProps) {
  const router = useRouter();

  // Function to get user display name
  const getUserDisplayName = useCallback((user: Job['user'] | undefined): string => {
    if (!user) return 'Unknown User';
    
    // If user is an object with user properties
    if (typeof user === 'object' && user) {
      // Priority 1: Check for full_name
      if ('full_name' in user && user.full_name && typeof user.full_name === 'string' && user.full_name.trim()) {
        return user.full_name.trim();
      }
      // Priority 2: Check for first_name and last_name combination
      if ('first_name' in user && 'last_name' in user) {
        const firstName = typeof user.first_name === 'string' ? user.first_name : '';
        const lastName = typeof user.last_name === 'string' ? user.last_name : '';
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName) return fullName;
      }
      // Priority 3: Check for name property
      if ('name' in user && user.name && typeof user.name === 'string') {
        return user.name;
      }
      // Priority 4: Check for username property (clean Auth0 usernames)
      if ('username' in user && user.username && typeof user.username === 'string') {
        let cleanUsername = user.username;
        // Clean up Auth0 usernames for better display
        if (cleanUsername.includes('auth0_') || cleanUsername.includes('google-oauth2_')) {
          cleanUsername = cleanUsername.replace(/^(auth0_|google-oauth2_)/, '');
        }
        return cleanUsername;
      }
      // Priority 5: Check for email and extract name part
      if ('email' in user && user.email && typeof user.email === 'string') {
        return user.email.split('@')[0]; // Return part before @ as display name
      }
    }
    
    // If user is a string or number (ID), return a generic name
    if (typeof user === 'string') {
      if (user.includes('google-oauth2')) {
        return 'Google User'; // Generic name for Google OAuth users
      }
      return user;
    }
    
    if (typeof user === 'number') {
      return `User ${user}`;
    }
    
    return 'Unknown User';
  }, []);

  // Function to format dates
  const formatDate = useCallback((dateString: string | null | undefined): string => {
    if (!dateString) return 'Not set';
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInMs = now.getTime() - date.getTime();
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
      
      if (diffInDays === 0) {
        return 'Today';
      } else if (diffInDays === 1) {
        return 'Yesterday';
      } else if (diffInDays < 7) {
        return `${diffInDays} days ago`;
      } else {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
      }
    } catch (error) {
      return 'Invalid date';
    }
  }, []);

  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    if (Array.isArray(job.images)) {
      for (const img of job.images) {
        const rawUrl = (img && (img.jpeg_url || img.image_url)) || null;
        if (rawUrl) {
          const u = createImageUrl(rawUrl);
          if (u) urls.push(u);
        }
      }
    }
    if (Array.isArray(job.image_urls)) {
      for (const url of job.image_urls) {
        const u = createImageUrl(url);
        if (u && !urls.includes(u)) urls.push(u);
      }
    }
    return urls;
  }, [job.images, job.image_urls]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());

  const onError = useCallback((idx: number) => {
    setFailed(prev => new Set(prev).add(idx));
    if (idx === activeIdx) {
      const next = imageUrls.findIndex((_, i) => i !== idx && !failed.has(i));
      if (next !== -1) setActiveIdx(next);
    }
  }, [activeIdx, imageUrls, failed]);


  const goToDetail = useCallback(() => {
    router.push(`/dashboard/jobs/${job.job_id}`);
  }, [router, job.job_id]);

  // Function to handle sharing
  const handleShare = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    
    const shareData = {
      title: `Job: ${job.topics?.[0]?.title || 'Maintenance Job'}`,
      text: `${job.description || 'No description'}\n\nRoom: ${job.rooms?.[0]?.name || 'N/A'}\nStatus: ${job.status}\nCreated: ${formatDate(job.created_at)}`,
      url: `${window.location.origin}/dashboard/jobs/${job.job_id}`
    };

    try {
      // Check if Web Share API is supported
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback: Copy to clipboard
        const shareText = `${shareData.title}\n\n${shareData.text}\n\n${shareData.url}`;
        await navigator.clipboard.writeText(shareText);
        
        // Show a simple notification (you could replace this with a toast notification)
        alert('Job details copied to clipboard!');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      
      // Final fallback: Copy just the URL
      try {
        await navigator.clipboard.writeText(shareData.url);
        alert('Job link copied to clipboard!');
      } catch (clipboardError) {
        console.error('Clipboard access failed:', clipboardError);
        alert('Unable to share. Please copy the URL manually.');
      }
    }
  }, [job, formatDate]);

  const status = getStatusConfig(job.status);

  return (
    <div className="rounded-md shadow-md bg-white text-gray-900 overflow-hidden cursor-pointer w-full max-w-full" onClick={goToDetail}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <User className="w-4 h-4 text-gray-500" />
          </div>
          <div className="-space-y-0.5 min-w-0">
            <h2 className="text-sm font-semibold leading-none truncate">{getUserDisplayName(job.user)}</h2>
            <span className="inline-block text-xs text-gray-500 truncate">{job.rooms?.[0]?.name || "N/A"} • {job.topics?.[0]?.title || "Job"}</span>
          </div>
        </div>
        <Badge variant="secondary" className={`px-2 py-0.5 text-xs ${status.color}`}>{status.icon}<span className="ml-1 hidden xs:inline">{status.label}</span></Badge>
      </div>

      {/* Image */}
      <div className={viewMode === "list" ? "h-60 w-full relative" : "relative aspect-square sm:aspect-square w-full bg-gray-50 min-h-[250px] sm:min-h-0"}>
        {job.status === 'waiting_sparepart' && (
          <div className="absolute top-2 left-2 z-10 bg-orange-600 text-white text-xs font-medium px-2 py-0.5 rounded">
            Parts
          </div>
        )}
        {imageUrls.length > 0 && imageUrls[activeIdx] && !failed.has(activeIdx) ? (
          <Image src={imageUrls[activeIdx]} alt="job" fill className="object-cover" unoptimized onError={() => onError(activeIdx)} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100"><ImageOff className="w-6 h-6 text-gray-400" /></div>
        )}

        {imageUrls.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/30 px-2 py-1 rounded-full">
            {imageUrls.map((_: string, i: number) => (
              <button key={i} className={`w-1.5 h-1.5 rounded-full ${i === activeIdx ? "bg-white" : "bg-white/60"}`} onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setActiveIdx(i); }} aria-label={`Show image ${i+1}`} />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" title="Comment" className="flex items-center justify-center" onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-5 h-5 fill-current">
                <path d="M496,496H480a273.39,273.39,0,0,1-179.025-66.782l-16.827-14.584C274.814,415.542,265.376,416,256,416c-63.527,0-123.385-20.431-168.548-57.529C41.375,320.623,16,270.025,16,216S41.375,111.377,87.452,73.529C132.615,36.431,192.473,16,256,16S379.385,36.431,424.548,73.529C470.625,111.377,496,161.975,496,216a171.161,171.161,0,0,1-21.077,82.151,201.505,201.505,0,0,1-47.065,57.537,285.22,285.22,0,0,0,63.455,97L496,457.373ZM294.456,381.222l27.477,23.814a241.379,241.379,0,0,0,135,57.86,317.5,317.5,0,0,1-62.617-105.583v0l-4.395-12.463,9.209-7.068C440.963,305.678,464,262.429,464,216c0-92.636-93.309-168-208-168S48,123.364,48,216s93.309,168,208,168a259.114,259.114,0,0,0,31.4-1.913Z"></path>
              </svg>
            </button>
            <button type="button" title="Share" className="flex items-center justify-center hover:text-blue-600 transition-colors" onClick={handleShare}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-5 h-5 fill-current">
                <path d="M474.444,19.857a20.336,20.336,0,0,0-21.592-2.781L33.737,213.8v38.066l176.037,70.414L322.69,496h38.074l120.3-455.4A20.342,20.342,0,0,0,474.444,19.857ZM337.257,459.693,240.2,310.37,389.553,146.788l-23.631-21.576L215.4,290.069,70.257,232.012,443.7,56.72Z"></path>
              </svg>
            </button>
          </div>
          <button type="button" title="Bookmark" className="flex items-center justify-center" onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-5 h-5 fill-current">
              <path d="M424,496H388.75L256.008,381.19,123.467,496H88V16H424ZM120,48V456.667l135.992-117.8L392,456.5V48Z"></path>
            </svg>
          </button>
        </div>


        {/* Caption and details */}
        <div className="space-y-3">
          <p className="text-sm">
            {job.description || "No description"}
          </p>
          
          {/* Job Details */}
          <div className="space-y-2">
            <div className="text-xs text-gray-500">
              <span className="font-medium">{job.topics?.[0]?.title || "Job"}</span>
            </div>
            
            {/* Dates */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 flex-shrink-0" />
                <span>Created: {formatDate(job.created_at)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-500 flex-shrink-0" />
                <span>Updated: {formatDate(job.updated_at)}</span>
              </div>
              {job.completed_at && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                  <span>Completed: {formatDate(job.completed_at)}</span>
                </div>
              )}
            </div>
            
            {/* Remarks */}
            {job.remarks && job.remarks.trim() && (
              <div className="flex items-start gap-1 text-xs text-gray-600">
                <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span className="italic">{job.remarks}</span>
              </div>
            )}
          </div>
          
          <input type="text" placeholder="Add a comment..." className="w-full py-1 bg-transparent border-none rounded text-sm pl-0 outline-none" onClick={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()} />
        </div>
      </div>
    </div>
  );
}

