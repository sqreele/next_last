"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { cn } from '@/app/lib/utils/cn';

export interface UniversalImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  quality?: number;
  priority?: boolean;
  fill?: boolean;
  sizes?: string;
  placeholder?: 'blur' | 'empty';
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  objectPosition?: string;
  onLoad?: () => void;
  onError?: () => void;
  onLoadingComplete?: () => void;
  // Preset types for different use cases
  preset?: 'hero' | 'card' | 'thumbnail' | 'profile' | 'gallery' | 'preview' | 'maintenance';
  // Lazy loading options
  lazy?: boolean;
  rootMargin?: string;
  threshold?: number;
  // Fallback options
  fallbackSrc?: string;
  showFallback?: boolean;
  // Loading state
  showLoadingSpinner?: boolean;
  loadingText?: string;
}

const PRESET_CONFIGS = {
  hero: {
    quality: 90,
    priority: true,
    sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw",
    placeholder: 'blur' as const,
  },
  card: {
    quality: 80,
    priority: false,
    sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
    placeholder: 'blur' as const,
  },
  thumbnail: {
    quality: 60,
    priority: false,
    sizes: "(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw",
    placeholder: 'blur' as const,
  },
  profile: {
    quality: 85,
    priority: false,
    sizes: "(max-width: 768px) 80px, 120px",
    placeholder: 'blur' as const,
  },
  gallery: {
    quality: 85,
    priority: false,
    sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
    placeholder: 'blur' as const,
  },
  preview: {
    quality: 70,
    priority: false,
    sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw",
    placeholder: 'blur' as const,
  },
  maintenance: {
    quality: 80,
    priority: false,
    sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 40vw",
    placeholder: 'blur' as const,
  },
} as const;

// Default blur data URL for better loading experience
const DEFAULT_BLUR_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q==";

export function UniversalImage({
  src,
  alt,
  className,
  width,
  height,
  quality,
  priority = false,
  fill = false,
  sizes,
  placeholder = 'blur',
  objectFit = 'cover',
  objectPosition = 'center',
  onLoad,
  onError,
  onLoadingComplete,
  preset = 'card',
  lazy = true,
  rootMargin = '50px',
  threshold = 0.1,
  fallbackSrc,
  showFallback = true,
  showLoadingSpinner = true,
  loadingText = 'Loading...',
  ...props
}: UniversalImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(!lazy || priority);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Get preset configuration
  const presetConfig = PRESET_CONFIGS[preset];
  const finalQuality = quality ?? presetConfig.quality;
  const finalPriority = priority || presetConfig.priority;
  const finalSizes = sizes || presetConfig.sizes;
  const finalPlaceholder = placeholder === 'blur' ? presetConfig.placeholder : placeholder;

  // Handle image load
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  // Handle image error
  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  // Handle loading complete
  const handleLoadingComplete = useCallback(() => {
    onLoadingComplete?.();
  }, [onLoadingComplete]);

  // Reset states when src changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
    setIsInView(!lazy || priority);
  }, [src, lazy, priority]);

  // Set up intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || priority || isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
      observerRef.current = observer;
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [lazy, priority, isInView, rootMargin, threshold]);

  // Determine if image should be unoptimized
  const isExternalImage = src.startsWith('http') || src.startsWith('/media/') || src.includes('/media/');
  const shouldUnoptimize = isExternalImage;
  
  // Debug logging
  if (process.env.NODE_ENV === 'development' && isExternalImage) {
    console.log('External image detected:', src, 'shouldUnoptimize:', shouldUnoptimize);
  }

  // Error state with fallback
  if (hasError) {
    if (fallbackSrc && showFallback) {
      return (
        <UniversalImage
          src={fallbackSrc}
          alt={alt}
          className={className}
          width={width}
          height={height}
          quality={finalQuality}
          priority={finalPriority}
          fill={fill}
          sizes={finalSizes}
          placeholder={finalPlaceholder}
          objectFit={objectFit}
          objectPosition={objectPosition}
          preset={preset}
          lazy={false}
          showFallback={false}
          {...props}
        />
      );
    }

    return (
      <div 
        className={cn(
          "flex items-center justify-center bg-gray-100 text-gray-400",
          className
        )}
        style={fill ? undefined : { width, height }}
      >
        <div className="flex flex-col items-center space-y-2">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="text-xs">Image unavailable</span>
        </div>
      </div>
    );
  }

  // Don't render until in view for lazy loading
  if (!isInView) {
    return (
      <div 
        className={cn("bg-gray-100 animate-pulse", className)}
        style={fill ? undefined : { width, height }}
      >
        {showLoadingSpinner && (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {shouldUnoptimize ? (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          width={fill ? undefined : width}
          height={fill ? undefined : height}
          style={{
            objectFit,
            objectPosition,
            transition: 'opacity 0.3s ease-in-out',
            opacity: isLoaded ? 1 : 0,
            width: fill ? '100%' : width,
            height: fill ? '100%' : height,
          }}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      ) : (
        <Image
          ref={imgRef}
          src={src}
          alt={alt}
          width={fill ? undefined : width}
          height={fill ? undefined : height}
          fill={fill}
          quality={finalQuality}
          priority={finalPriority}
          placeholder={finalPlaceholder}
          blurDataURL={finalPlaceholder === 'blur' ? DEFAULT_BLUR_DATA_URL : undefined}
          sizes={finalSizes}
          style={{
            objectFit,
            objectPosition,
            transition: 'opacity 0.3s ease-in-out',
            opacity: isLoaded ? 1 : 0,
          }}
          onLoad={handleLoad}
          onError={handleError}
          onLoadingComplete={handleLoadingComplete}
          {...props}
        />
      )}
      
      {/* Loading placeholder */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          {showLoadingSpinner ? (
            <div className="flex flex-col items-center space-y-2">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              {loadingText && (
                <span className="text-xs text-gray-500">{loadingText}</span>
              )}
            </div>
          ) : (
            <div className="w-full h-full bg-gray-100 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}

// Convenience components for common use cases
export const HeroImage = (props: Omit<UniversalImageProps, 'preset'>) => (
  <UniversalImage {...props} preset="hero" />
);

export const CardImage = (props: Omit<UniversalImageProps, 'preset'>) => (
  <UniversalImage {...props} preset="card" />
);

export const ThumbnailImage = (props: Omit<UniversalImageProps, 'preset'>) => (
  <UniversalImage {...props} preset="thumbnail" />
);

export const ProfileImage = (props: Omit<UniversalImageProps, 'preset'>) => (
  <UniversalImage {...props} preset="profile" />
);

export const GalleryImage = (props: Omit<UniversalImageProps, 'preset'>) => (
  <UniversalImage {...props} preset="gallery" />
);

export const PreviewImage = (props: Omit<UniversalImageProps, 'preset'>) => (
  <UniversalImage {...props} preset="preview" />
);

export const MaintenanceImage = (props: Omit<UniversalImageProps, 'preset'>) => (
  <UniversalImage {...props} preset="maintenance" />
);

export default UniversalImage;
