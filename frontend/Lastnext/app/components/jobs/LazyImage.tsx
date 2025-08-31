'use client';
import Image from 'next/image';
import React, { useMemo, useState, useCallback, useEffect } from 'react';

interface LazyImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  onError?: () => void;
  placeholder?: string;
  fallbackSrc?: string;
}

// Utility function to check if backend media server is accessible
const checkMediaServerAccess = async (mediaPath: string): Promise<boolean> => {
  try {
    // Try to fetch the image with a HEAD request to check accessibility
    const response = await fetch(mediaPath, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.warn(`Media server check failed for ${mediaPath}:`, error);
    return false;
  }
};

export const LazyImage: React.FC<LazyImageProps> = ({ 
  src, 
  alt, 
  className, 
  onError, 
  placeholder,
  fallbackSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik04MCAxMDBDODAgODkuNTQ0IDg4LjU0NCA4MSAxMDAgODFDMTExLjQ1NiA4MSAxMjAgODkuNTQ0IDEyMCAxMDBDMTIwIDExMC40NTYgMTExLjQ1NiAxMTkgMTAwIDExOUM4OC41NDQgMTE5IDgwIDExMC40NTYgODAgMTAwWiIgZmlsbD0iIzlDQTNBRiIvPjxwYXRoIGQ9Ik0xMDAgMTMwQzExMC40NTYgMTMwIDEyMCAxMjAuNDU2IDEyMCAxMTBDMTIwIDEwOS41NDQgMTE5LjQ1NiAxMDkgMTE5IDEwOUg4MUM4MC41NDQgMTA5IDgwIDEwOS41NDQgODAgMTEwQzgwIDEyMC40NTYgODkuNTQ0IDEzMCAxMDAgMTMwWiIgZmlsbD0iIzlDQTNBRiIvPjwvc3ZnPgo=' // Simple SVG placeholder
}) => {
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isMediaServerAccessible, setIsMediaServerAccessible] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const maxRetries = 2;

  // Debug mode - enable this in development to see detailed logging
  const isDebugMode = process.env.NODE_ENV === 'development';

  // Check media server accessibility when component mounts
  useEffect(() => {
    if (src && typeof src === 'string' && src.startsWith('/media/')) {
      checkMediaServerAccess(src).then(setIsMediaServerAccessible);
    }
  }, [src]);

  const checkMediaServerAccess = async (mediaPath: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(mediaPath, { method: 'HEAD' });
      const isAccessible = response.ok;
      
      if (isDebugMode) {
        console.log(`Media server check for ${mediaPath}:`, {
          status: response.status,
          statusText: response.statusText,
          accessible: isAccessible,
          headers: Object.fromEntries(response.headers.entries())
        });
      }
      
      return isAccessible;
    } catch (error) {
      if (isDebugMode) {
        console.warn(`Media server accessibility check failed for ${mediaPath}:`, error);
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const safeSrc = useMemo(() => {
    if (hasError && retryCount < maxRetries) {
      return src; // Retry with original src
    }
    if (hasError && fallbackSrc) {
      return fallbackSrc; // Use fallback after max retries
    }
    return (typeof src === 'string' && src.length > 0 ? src : placeholder ?? null);
  }, [src, placeholder, hasError, retryCount, fallbackSrc]);

  // Determine when to bypass Next.js optimization to match plain <img> behavior
  // - Relative media URLs ("/media/...") should not be optimized
  // - Absolute URLs pointing to our own domain should not be optimized
  const isRelativeMedia = typeof safeSrc === 'string' && safeSrc.startsWith('/media/');
  const isOwnDomainAbsolute = typeof safeSrc === 'string' && (
    safeSrc.startsWith('https://pcms.live') ||
    safeSrc.startsWith('https://www.pcms.live') ||
    safeSrc.startsWith('http://pcms.live') ||
    safeSrc.startsWith('http://www.pcms.live')
  );
  const shouldUnoptimize = isRelativeMedia || isOwnDomainAbsolute;

  const handleError = useCallback(() => {
    const errorContext = {
      src: safeSrc,
      isMediaServerAccessible,
      retryCount,
      maxRetries,
      isRelativeMedia,
      shouldUnoptimize,
      isLoading
    };
    
    if (isDebugMode) {
      console.warn(`Image failed to load:`, errorContext);
    }
    
    if (retryCount < maxRetries) {
      // Retry loading the image
      setRetryCount(prev => prev + 1);
      setHasError(false); // Reset error state for retry
      if (isDebugMode) {
        console.log(`Retrying image load (attempt ${retryCount + 1}/${maxRetries}): ${safeSrc}`);
      }
    } else {
      // Max retries reached, show fallback or placeholder
      setHasError(true);
      console.error(`Image failed to load after ${maxRetries} attempts:`, errorContext);
      
      // Provide troubleshooting guidance
      if (isRelativeMedia && isMediaServerAccessible === false) {
        console.error(`
🔍 TROUBLESHOOTING GUIDE for failed media image:
Image: ${safeSrc}

Possible causes:
1. Backend server is not running
2. Backend server is not accessible from frontend
3. Image file doesn't exist on backend
4. CORS configuration issue
5. Network/firewall blocking the request

Check:
- Is your Django backend running on port 8000?
- Can you access ${safeSrc} directly in browser?
- Check backend logs for any errors
- Verify Next.js rewrites are working correctly
        `);
      }
      
      onError?.();
    }
  }, [safeSrc, isMediaServerAccessible, retryCount, maxRetries, isRelativeMedia, shouldUnoptimize, isLoading, onError, isDebugMode]);

  const handleLoad = useCallback(() => {
    if (hasError) {
      setHasError(false);
      setRetryCount(0);
    }
    if (isDebugMode) {
      console.log(`Image loaded successfully: ${safeSrc}`);
    }
  }, [hasError, safeSrc, isDebugMode]);

  if (!safeSrc) {
    return (
      <div className={`${className} bg-gray-200 flex items-center justify-center text-gray-500 text-sm`}>
        No image
      </div>
    );
  }

  // If we've exhausted retries and have a fallback, show it
  if (hasError && retryCount >= maxRetries && fallbackSrc && fallbackSrc !== safeSrc) {
    return (
      <Image
        src={fallbackSrc}
        alt={`${alt} (fallback)`}
        className={className}
        width={0}
        height={0}
        sizes="100vw"
        style={{ width: '100%', height: 'auto' }}
        loading="lazy"
        unoptimized={false}
        onError={() => {
          console.error(`Fallback image also failed to load: ${fallbackSrc}`);
          onError?.();
        }}
      />
    );
  }

  return (
    <Image
      src={safeSrc}
      alt={alt}
      className={className}
      width={0}
      height={0}
      sizes="100vw"
      style={{ width: '100%', height: 'auto' }}
      loading="lazy"
      unoptimized={shouldUnoptimize}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
};
