/**
 * Unified image URL resolution for PDF generation
 * Handles production vs development URL differences
 */

import { pdfDebug } from '@/app/lib/utils/pdfDebug';

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
  try { pdfDebug.log('image.baseUrl', { baseUrl }); } catch {}
  
  try {
    // Handle absolute URLs
    if (imageUrl.startsWith('http')) {
      const url = new URL(imageUrl);
      const pathname = url.pathname || '/';
      
      // Convert internal Docker URLs to production URLs
      const isInternal = /(^backend$)|(^localhost)|(^127\.0\.0\.1)/.test(url.hostname) || url.protocol === 'http:';
      const isMediaPath = pathname.startsWith('/media/');
      
      if (isInternal && isMediaPath) {
        const resolved = `${baseUrl}${pathname}${url.search || ''}`;
        try { pdfDebug.imageResolve({ sourceUrl: imageUrl, resolvedUrl: resolved, note: 'rebased-internal' }); } catch {}
        return resolved;
      }
      
      // Force HTTPS for production domain
      if (url.hostname.endsWith('pcms.live') && url.protocol !== 'https:') {
        const resolved = `https://pcms.live${pathname}${url.search || ''}`;
        try { pdfDebug.imageResolve({ sourceUrl: imageUrl, resolvedUrl: resolved, note: 'forced-https' }); } catch {}
        return resolved;
      }
      
      try { pdfDebug.imageResolve({ sourceUrl: imageUrl, resolvedUrl: imageUrl, note: 'absolute-unchanged' }); } catch {}
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
    
    const resolved = `${baseUrl}${path}`;
    try { pdfDebug.imageResolve({ sourceUrl: imageUrl, resolvedUrl: resolved, baseUrl, note: 'relative-rebased' } as any); } catch {}
    return resolved;
  } catch (error) {
    console.warn('Error resolving PDF image URL:', error);
    // Fallback: construct basic URL
    const normalizedPath = imageUrl.startsWith('/media/') 
      ? imageUrl 
      : (imageUrl.startsWith('/') ? imageUrl : `/media/${imageUrl}`);
    const resolved = `${baseUrl}${normalizedPath}`;
    try { pdfDebug.imageResolve({ sourceUrl: imageUrl, resolvedUrl: resolved, baseUrl, note: 'fallback' } as any); } catch {}
    return resolved;
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
      try { pdfDebug.imageValidate({ url: imageUrl, valid: false, error: 'timeout' } as any); } catch {}
      resolve(false);
    }, 5000); // 5 second timeout
    
    img.onload = () => {
      clearTimeout(timeout);
      try { pdfDebug.imageValidate({ url: imageUrl, valid: true } as any); } catch {}
      resolve(true);
    };
    
    img.onerror = () => {
      clearTimeout(timeout);
      try { pdfDebug.imageValidate({ url: imageUrl, valid: false, error: 'onerror' } as any); } catch {}
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
    const extension = getImageExtension(resolvedUrl);
    
    // Check if it's a supported format for PDF
    if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
      try { pdfDebug.imageResolve({ sourceUrl: rawUrl, resolvedUrl, note: 'selected-supported', extension } as any); } catch {}
      return resolvedUrl;
    }
  }
  
  try { pdfDebug.imageResolve({ sourceUrl: '', resolvedUrl: '', note: 'no-supported-image' } as any); } catch {}
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

/**
 * Return all candidate image URLs from a job in priority order
 */
function getCandidateImageUrlsFromJob(job: any): string[] {
  const candidates: string[] = [];
  try {
    if (Array.isArray(job?.images)) {
      for (const img of job.images) {
        if (img?.jpeg_url) candidates.push(String(img.jpeg_url));
        if (img?.image_url) candidates.push(String(img.image_url));
      }
    }
    if (Array.isArray(job?.image_urls)) {
      for (const url of job.image_urls) {
        if (typeof url === 'string' && url) candidates.push(url);
      }
    }
  } catch {}
  return candidates;
}

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error(`Invalid content type: ${blob.type}`);
  }
  return await blobToDataURL(blob);
}

function dataUrlToJpegDataUrl(dataUrl: string, maxSize: number = 1024, quality: number = 0.86): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      try {
        const jpeg = canvas.toDataURL('image/jpeg', quality);
        resolve(jpeg);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.crossOrigin = 'anonymous';
    img.src = dataUrl;
  });
}

/**
 * Enrich jobs with a preprocessed image source suitable for PDF embedding
 * - Prefers existing supported formats
 * - Falls back to converting first available image to JPEG data URL
 */
export async function enrichJobsWithPdfImages(jobs: any[]): Promise<any[]> {
  const tasks = (jobs || []).map(async (job) => {
    try {
      if (job && job.pdf_image_src) {
        return job;
      }
      const supported = getSupportedImageFromJob(job);
      if (supported) {
        // Supported as-is; no need to convert
        return job;
      }
      const candidates = getCandidateImageUrlsFromJob(job);
      for (const raw of candidates) {
        if (!raw) continue;
        const absolute = getProductionImageUrl(raw);
        try {
          const dataUrl = await fetchAsDataUrl(absolute);
          // Convert any format (including WebP/AVIF) into JPEG data URL for PDF compatibility
          const jpegDataUrl = await dataUrlToJpegDataUrl(dataUrl);
          if (jpegDataUrl && jpegDataUrl.startsWith('data:image/jpeg')) {
            try { pdfDebug.imageResolve({ sourceUrl: raw, resolvedUrl: 'data:image/jpeg;base64,...', note: 'converted-jpeg-dataurl' } as any); } catch {}
            return { ...job, pdf_image_src: jpegDataUrl };
          }
        } catch (e) {
          // Try next candidate
          continue;
        }
      }
      return job;
    } catch {
      return job;
    }
  });
  return await Promise.all(tasks);
}
