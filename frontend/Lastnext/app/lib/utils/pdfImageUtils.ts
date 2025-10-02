/**
 * Unified image URL resolution for PDF generation
 * Handles production vs development URL differences
 */

// Type definitions for environment variables
declare const process: {
  env: {
    NODE_ENV?: string;
    NEXT_PRIVATE_API_URL?: string;
    NEXT_PUBLIC_MEDIA_URL?: string;
  };
};

export function getProductionImageUrl(imageUrl: string): string {
  if (!imageUrl) {
    console.warn('[PDF Image URL] Empty image URL provided');
    return '';
  }
  
  // Data URLs can be used directly
  if (imageUrl.startsWith('data:')) {
    console.log('[PDF Image URL] Data URL detected, using directly');
    return imageUrl;
  }
  
  // Get the correct base URL for the current environment
  const baseUrl = getPdfMediaBaseUrl();
  console.log('[PDF Image URL] Base URL:', baseUrl);
  console.log('[PDF Image URL] Input URL:', imageUrl);
  
  try {
    // Handle absolute URLs
    if (imageUrl.startsWith('http')) {
      const url = new URL(imageUrl);
      const pathname = url.pathname || '/';
      
      // Convert internal Docker URLs to production URLs
      const isInternal = /(^backend$)|(^localhost)|(^127\.0\.0\.1)/.test(url.hostname) || url.protocol === 'http:';
      const isMediaPath = pathname.startsWith('/media/');
      
      console.log('[PDF Image URL] Processing absolute URL:', {
        hostname: url.hostname,
        protocol: url.protocol,
        pathname: pathname,
        isInternal: isInternal,
        isMediaPath: isMediaPath
      });
      
      if (isInternal && isMediaPath) {
        const resolvedUrl = `${baseUrl}${pathname}${url.search || ''}`;
        console.log('[PDF Image URL] ✅ Converted internal URL to:', resolvedUrl);
        return resolvedUrl;
      }
      
      // Force HTTPS for production domain
      if (url.hostname.endsWith('pcms.live') && url.protocol !== 'https:') {
        const resolvedUrl = `https://pcms.live${pathname}${url.search || ''}`;
        console.log('[PDF Image URL] ✅ Forced HTTPS for production:', resolvedUrl);
        return resolvedUrl;
      }
      
      console.log('[PDF Image URL] ✅ Using URL as-is:', imageUrl);
      return imageUrl;
    }
    
    // Handle relative URLs
    let path = imageUrl;
    if (!path.startsWith('/')) {
      path = path.startsWith('media/') ? `/${path}` : `/media/${path}`;
    }
    if (!path.startsWith('/media/')) {
      path = `/media${path}`;
    }
    
    const resolvedUrl = `${baseUrl}${path}`;
    console.log('[PDF Image URL] ✅ Resolved relative URL to:', resolvedUrl);
    return resolvedUrl;
  } catch (error) {
    console.error('[PDF Image URL] ❌ Error resolving URL:', error);
    // Fallback: construct basic URL
    const normalizedPath = imageUrl.startsWith('/media/') 
      ? imageUrl 
      : (imageUrl.startsWith('/') ? imageUrl : `/media/${imageUrl}`);
    const fallbackUrl = `${baseUrl}${normalizedPath}`;
    console.log('[PDF Image URL] 🔄 Using fallback URL:', fallbackUrl);
    return fallbackUrl;
  }
}

function getPdfMediaBaseUrl(): string {
  // Server-side rendering
  if (typeof window === 'undefined') {
    // In production, use the production domain
    if (process.env.NODE_ENV === 'production') {
      console.log('[PDF Media Base URL] SSR Production mode detected');
      return 'https://pcms.live';
    }
    // In development, use the backend service
    const url = process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';
    console.log('[PDF Media Base URL] SSR Development mode, using:', url);
    return url;
  }
  
  // Client-side
  try {
    const hostname = window.location?.hostname;
    const isProduction = hostname?.endsWith('pcms.live');
    console.log('[PDF Media Base URL] Client-side detection:', {
      hostname: hostname,
      isProduction: isProduction,
      NODE_ENV: process.env.NODE_ENV
    });
    
    if (isProduction) {
      console.log('[PDF Media Base URL] Production hostname detected, using https://pcms.live');
      return 'https://pcms.live';
    }
    // In development (localhost), use localhost:8000
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const url = process.env.NEXT_PUBLIC_MEDIA_URL || 'http://localhost:8000';
      console.log('[PDF Media Base URL] Localhost detected, using:', url);
      return url;
    }
    console.log('[PDF Media Base URL] Unknown hostname, defaulting to https://pcms.live');
    return 'https://pcms.live';
  } catch (error) {
    console.error('[PDF Media Base URL] Error in client-side detection:', error);
    // Fallback: check NODE_ENV for development
    if (process.env.NODE_ENV === 'development') {
      console.log('[PDF Media Base URL] Fallback to development mode');
      return 'http://localhost:8000';
    }
    console.log('[PDF Media Base URL] Fallback to production mode');
    return 'https://pcms.live';
  }
}

export function validateImageForPdf(imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!imageUrl || imageUrl.startsWith('data:')) {
      resolve(!!imageUrl);
      return;
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    const timeout = setTimeout(() => {
      resolve(false);
    }, 5000); // 5 second timeout
    
    img.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
    
    img.src = imageUrl;
  });
}

export function getSupportedImageFromJob(job: any): string | null {
  if (!job) {
    console.warn('[PDF Image Utils] Job is null or undefined');
    return null;
  }
  
  const candidates: string[] = [];
  
  console.log('[PDF Image Utils] Processing job:', {
    job_id: job.job_id,
    has_images: !!job.images,
    images_length: job.images?.length,
    has_image_urls: !!job.image_urls,
    image_urls_length: job.image_urls?.length
  });
  
  // Collect all possible image URLs
  if (Array.isArray(job.images)) {
    for (const img of job.images) {
      if (img?.jpeg_url) {
        console.log('[PDF Image Utils] Found jpeg_url:', img.jpeg_url);
        candidates.push(String(img.jpeg_url));
      }
      if (img?.image_url) {
        console.log('[PDF Image Utils] Found image_url:', img.image_url);
        candidates.push(String(img.image_url));
      }
      if (img?.url) {
        console.log('[PDF Image Utils] Found url:', img.url);
        candidates.push(String(img.url));
      }
    }
  }
  
  if (Array.isArray(job.image_urls)) {
    for (const url of job.image_urls) {
      if (typeof url === 'string' && url) {
        console.log('[PDF Image Utils] Found image_urls entry:', url);
        candidates.push(url);
      }
    }
  }
  
  console.log('[PDF Image Utils] Total candidates found:', candidates.length);
  
  // Find the first supported image format
  for (let rawUrl of candidates) {
    if (!rawUrl) continue;
    const resolvedUrl = getProductionImageUrl(rawUrl);
    const extension = getImageExtension(resolvedUrl);
    
    console.log('[PDF Image Utils] Checking candidate:', {
      rawUrl,
      resolvedUrl,
      extension,
      isSupported: ['jpg', 'jpeg', 'png', 'gif'].includes(extension)
    });
    
    // Check if it's a supported format for PDF
    if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
      console.log('[PDF Image Utils] ✅ Selected image URL:', resolvedUrl);
      return resolvedUrl;
    }
  }
  
  console.warn('[PDF Image Utils] ❌ No supported image format found for job', job.job_id);
  return null;
}

function getImageExtension(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname || '';
    return pathname.split('.').pop()?.toLowerCase() || '';
  } catch {
    return url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || '';
  }
}
