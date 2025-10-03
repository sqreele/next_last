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
  if (!imageUrl) return '';
  
  // Data URLs can be used directly
  if (imageUrl.startsWith('data:')) return imageUrl;
  
  // Get the correct base URL for the current environment
  const baseUrl = getPdfMediaBaseUrl();
  
  try {
    // Handle absolute URLs
    if (imageUrl.startsWith('http')) {
      const url = new URL(imageUrl);
      const pathname = url.pathname || '/';
      
      // Convert internal Docker URLs to production URLs
      const isInternal = /(^backend$)|(^localhost)|(^127\.0\.0\.1)/.test(url.hostname) || url.protocol === 'http:';
      const isMediaPath = pathname.startsWith('/media/');
      
      if (isInternal && isMediaPath) {
        return `${baseUrl}${pathname}${url.search || ''}`;
      }
      
      // Force HTTPS for production domain
      if (url.hostname.endsWith('pcms.live') && url.protocol !== 'https:') {
        return `https://pcms.live${pathname}${url.search || ''}`;
      }
      
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
    
    return `${baseUrl}${path}`;
  } catch (error) {
    console.warn('Error resolving PDF image URL:', error);
    // Fallback: construct basic URL
    const normalizedPath = imageUrl.startsWith('/media/') 
      ? imageUrl 
      : (imageUrl.startsWith('/') ? imageUrl : `/media/${imageUrl}`);
    return `${baseUrl}${normalizedPath}`;
  }
}

function getPdfMediaBaseUrl(): string {
  // Server-side rendering
  if (typeof window === 'undefined') {
    // In production, use the production domain
    if (process.env.NODE_ENV === 'production') {
      return 'https://pcms.live';
    }
    // In development, use the backend service
    return process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';
  }
  
  // Client-side
  try {
    const hostname = window.location?.hostname;
    const isProduction = hostname?.endsWith('pcms.live');
    if (isProduction) {
      return 'https://pcms.live';
    }
    // In development (localhost), use localhost:8000
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return process.env.NEXT_PUBLIC_MEDIA_URL || 'http://localhost:8000';
    }
    return 'https://pcms.live';
  } catch {
    // Fallback: check NODE_ENV for development
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:8000';
    }
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
  if (!job) return null;
  
  const candidates: string[] = [];
  
  // Collect all possible image URLs
  if (Array.isArray(job.images)) {
    for (const img of job.images) {
      if (img?.jpeg_url) candidates.push(String(img.jpeg_url));
      if (img?.image_url) candidates.push(String(img.image_url));
    }
  }
  
  if (Array.isArray(job.image_urls)) {
    for (const url of job.image_urls) {
      if (typeof url === 'string' && url) candidates.push(url);
    }
  }
  
  // Find the first supported image format
  for (let rawUrl of candidates) {
    if (!rawUrl) continue;
    const resolvedUrl = getProductionImageUrl(rawUrl);

    // Allow supported data URLs directly
    if (resolvedUrl.startsWith('data:')) {
      const isSupportedData = /data:image\/(jpeg|jpg|png|gif)/i.test(resolvedUrl);
      if (isSupportedData) return resolvedUrl;
      // Otherwise continue to next candidate
      continue;
    }

    const extension = getImageExtension(resolvedUrl);

    // Return directly if extension is supported by @react-pdf/renderer
    if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
      return resolvedUrl;
    }
  }
  
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
