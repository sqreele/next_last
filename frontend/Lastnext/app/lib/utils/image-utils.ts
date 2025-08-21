import { MEDIA_CONFIG } from '../config';

/**
 * Get the base media URL for the current environment
 */
export function getMediaBaseUrl(): string {
  // Always use relative URLs for consistency between server and client
  // This prevents hydration mismatches and works with Next.js image optimization
  return '';
}

/**
 * Converts internal Docker URLs to external URLs for browser access
 * This is needed because the browser can't resolve internal Docker hostnames
 */
export function fixImageUrl(imageUrl: string | null | undefined): string | null {
  // Handle null, undefined, or non-string values
  if (!imageUrl || typeof imageUrl !== 'string') {
    return null;
  }
  
  // Always use relative URLs for consistency between server and client
  // This prevents hydration mismatches and works with Next.js image optimization
  
  // If it's already a relative URL starting with /media/, return as is
  if (imageUrl.startsWith('/media/')) {
    return imageUrl;
  }
  
  // If it's a full external URL, convert to relative URL for consistency
  if (imageUrl.startsWith('http')) {
    // Extract the path from external URLs
    try {
      const url = new URL(imageUrl);
      if (url.pathname.startsWith('/media/')) {
        return url.pathname;
      }
      // If it's not a media URL, return the original
      return imageUrl;
    } catch {
      // If URL parsing fails, return the original
      return imageUrl;
    }
  }
  
  // If it's a relative path without /media/, prepend /media/
  if (imageUrl.startsWith('maintenance_job_images/') || imageUrl.startsWith('profile_images/')) {
    return `/media/${imageUrl}`;
  }
  
  // Default case: prepend /media/
  return `/media/${imageUrl}`;
}

/**
 * Fixes image URLs in a job object
 */
export function fixJobImageUrls(job: any): any {
  if (!job || typeof job !== 'object') return job;
  
  const fixedJob = { ...job };
  
  // Fix image_urls array
  if (Array.isArray(fixedJob.image_urls)) {
    fixedJob.image_urls = fixedJob.image_urls.map((url: string) => fixImageUrl(url)).filter(Boolean);
  }
  
  // Fix images array
  if (Array.isArray(fixedJob.images)) {
    fixedJob.images = fixedJob.images.map((img: any) => {
      if (img && typeof img === 'object') {
        return {
          ...img,
          image_url: fixImageUrl(img.image_url)
        };
      }
      return img;
    });
  }
  
  // Fix profile_image
  if (fixedJob.profile_image && typeof fixedJob.profile_image === 'object') {
    fixedJob.profile_image = {
      ...fixedJob.profile_image,
      profile_image: fixImageUrl(fixedJob.profile_image.profile_image)
    };
  }
  
  // Fix user profile_image
  if (fixedJob.user && typeof fixedJob.user === 'object') {
    fixedJob.user = {
      ...fixedJob.user,
      profile_image: fixImageUrl(fixedJob.user.profile_image)
    };
  }
  
  return fixedJob;
}

/**
 * Creates a consistent image URL for any image source
 */
export function createImageUrl(imageSource: string | null | undefined, fallbackPath?: string): string | null {
  if (!imageSource) {
    return fallbackPath ? fallbackPath : null;
  }
  
  return fixImageUrl(imageSource);
}

/**
 * Validates if an image URL is accessible
 */
export async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fixes image URLs in an array of jobs
 */
export function fixJobsImageUrls(jobs: any[]): any[] {
  if (!Array.isArray(jobs)) return [];
  
  return jobs
    .filter(job => job && typeof job === 'object')
    .map(job => fixJobImageUrls(job))
    .filter(job => job !== null);
}

/**
 * Sanitizes job data to ensure all string fields are actually strings
 * This prevents issues with non-string values being passed to string methods
 */
export function sanitizeJobData(job: any): any {
  if (!job || typeof job !== 'object') return job;
  
  const sanitized = { ...job };
  
  // Ensure all string fields are actually strings
  const stringFields = [
    'description', 'status', 'priority', 'remarks', 'job_id',
    'user', 'updated_by', 'created_at', 'updated_at', 'completed_at'
  ];
  
  stringFields.forEach(field => {
    if (sanitized[field] !== null && sanitized[field] !== undefined) {
      sanitized[field] = String(sanitized[field]);
    }
  });
  
  // Ensure user and updated_by are strings
  if (sanitized.user !== null && sanitized.user !== undefined) {
    sanitized.user = String(sanitized.user);
  }
  if (sanitized.updated_by !== null && sanitized.updated_by !== undefined) {
    sanitized.updated_by = String(sanitized.updated_by);
  }
  
  return sanitized;
}

/**
 * Sanitizes an array of jobs
 */
export function sanitizeJobsData(jobs: any[]): any[] {
  if (!Array.isArray(jobs)) return [];
  
  return jobs
    .filter(job => job && typeof job === 'object')
    .map(job => sanitizeJobData(job))
    .filter(job => job !== null);
} 