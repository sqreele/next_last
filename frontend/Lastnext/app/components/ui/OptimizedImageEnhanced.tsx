/**
 * Enhanced Optimized Image Component
 * Provides better performance and optimization for different use cases
 */

"use client";

import React, { useState, useCallback } from 'react';
import Image, { ImageProps } from 'next/image';
import { cn } from '@/app/lib/utils/cn';
import { 
  getOptimizedImageProps, 
  IMAGE_PRESETS, 
  ImageOptimizationOptions,
  isExternalImage 
} from '@/app/lib/utils/image-optimization-enhanced';

interface OptimizedImageEnhancedProps extends Omit<ImageProps, 'src' | 'alt'> {
  src: string;
  alt: string;
  preset?: keyof typeof IMAGE_PRESETS;
  options?: ImageOptimizationOptions;
  fallback?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  onLoad?: () => void;
  onError?: () => void;
  showLoadingSpinner?: boolean;
}

export function OptimizedImageEnhanced({
  src,
  alt,
  preset = 'JOB_CARD',
  options,
  fallback,
  className,
  containerClassName,
  onLoad,
  onError,
  showLoadingSpinner = true,
  ...props
}: OptimizedImageEnhancedProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const imageOptions = options || IMAGE_PRESETS[preset];
  const optimizedProps = getOptimizedImageProps(src, alt, imageOptions, props);
  

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    onError?.();
  }, [onError]);

  // If there's an error and we have a fallback, show it
  if (hasError && fallback) {
    return <>{fallback}</>;
  }

  // If there's an error and no fallback, show a placeholder
  if (hasError) {
    return (
      <div className={cn(
        "flex items-center justify-center bg-gray-100 text-gray-400",
        className
      )}>
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
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", containerClassName)}>
      {isLoading && showLoadingSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}
      
      <Image
        {...optimizedProps}
        {...props}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}

// Preset-specific components for common use cases
export function JobCardImage({ src, alt, ...props }: Omit<OptimizedImageEnhancedProps, 'preset'>) {
  return (
    <OptimizedImageEnhanced
      src={src}
      alt={alt}
      preset="JOB_CARD"
      {...props}
    />
  );
}

export function JobHeroImage({ src, alt, ...props }: Omit<OptimizedImageEnhancedProps, 'preset'>) {
  return (
    <OptimizedImageEnhanced
      src={src}
      alt={alt}
      preset="JOB_HERO"
      {...props}
    />
  );
}

export function ProfileImage({ src, alt, ...props }: Omit<OptimizedImageEnhancedProps, 'preset'>) {
  return (
    <OptimizedImageEnhanced
      src={src}
      alt={alt}
      preset="PROFILE"
      fallback={
        <div className="flex items-center justify-center bg-gray-100 text-gray-400">
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
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
      }
      {...props}
    />
  );
}

export function ThumbnailImage({ src, alt, ...props }: Omit<OptimizedImageEnhancedProps, 'preset'>) {
  return (
    <OptimizedImageEnhanced
      src={src}
      alt={alt}
      preset="THUMBNAIL"
      {...props}
    />
  );
}

export function GalleryImage({ src, alt, ...props }: Omit<OptimizedImageEnhancedProps, 'preset'>) {
  return (
    <OptimizedImageEnhanced
      src={src}
      alt={alt}
      preset="GALLERY"
      {...props}
    />
  );
}

export function PreviewImage({ src, alt, ...props }: Omit<OptimizedImageEnhancedProps, 'preset'>) {
  return (
    <OptimizedImageEnhanced
      src={src}
      alt={alt}
      preset="PREVIEW"
      {...props}
    />
  );
}
