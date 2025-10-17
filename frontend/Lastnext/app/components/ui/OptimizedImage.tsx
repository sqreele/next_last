"use client";

// ✅ PERFORMANCE: Enhanced image component with lazy loading and blur placeholders
import React, { useState, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { getOptimizedImageProps, IMAGE_PRESETS } from '@/app/lib/utils/image-optimization';
import { cn } from '@/app/lib/utils/cn';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  quality?: number;
  priority?: boolean;
  preset?: keyof typeof IMAGE_PRESETS;
  onError?: () => void;
  onLoad?: () => void;
  placeholder?: 'blur' | 'empty';
  sizes?: string;
  fill?: boolean;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

// ✅ PERFORMANCE: Memoize component to prevent unnecessary re-renders
export const OptimizedImage = React.memo(function OptimizedImage({
  src,
  alt,
  className,
  width,
  height,
  quality,
  priority = false,
  preset = 'card',
  onError,
  onLoad,
  placeholder = 'blur',
  sizes,
  fill = false,
  objectFit = 'cover',
  ...props
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority); // If priority, load immediately
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ✅ PERFORMANCE: Lazy load images using Intersection Observer
  useEffect(() => {
    if (priority || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before image enters viewport
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [priority]);

  // ✅ PERFORMANCE: Memoize handlers
  const handleLoad = useMemo(() => () => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useMemo(() => () => {
    setHasError(true);
    onError?.();
  }, [onError]);

  // Reset error state when src changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
    if (!priority) setIsInView(false);
  }, [src, priority]);

  if (hasError) {
    return (
      <div 
        className={cn(
          "flex items-center justify-center bg-gray-100 text-gray-400",
          className
        )}
        style={fill ? undefined : { width, height }}
      >
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

  const imageProps = getOptimizedImageProps(src, preset, {
    width,
    height,
    quality,
    priority,
    placeholder,
    sizes: sizes || (fill ? '100vw' : undefined),
  });

  // Ensure width and height are provided when not using fill
  const imageWidth = fill ? undefined : (width || imageProps.width || 400);
  const imageHeight = fill ? undefined : (height || imageProps.height || 300);

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden", className)}>
      {/* ✅ PERFORMANCE: Only render image when in viewport or priority */}
      {isInView ? (
        <Image
          ref={imgRef}
          src={imageProps.src}
          alt={alt}
          width={imageWidth}
          height={imageHeight}
          fill={fill}
          quality={imageProps.quality}
          placeholder={imageProps.placeholder}
          blurDataURL={imageProps.blurDataURL}
          sizes={imageProps.sizes}
          priority={imageProps.priority}
          loading={priority ? 'eager' : 'lazy'} // ✅ PERFORMANCE: Native lazy loading
          // Avoid Next.js optimizer for media and external URLs to prevent server-side fetch
          unoptimized={Boolean(
            (typeof imageProps.src === 'string' && imageProps.src.includes('/media/')) ||
            (typeof src === 'string' && (src.startsWith('http') || src.includes('/media/')))
          )}
          style={{
            objectFit,
            transition: 'opacity 0.3s ease-in-out',
            opacity: isLoaded ? 1 : 0,
          }}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      ) : (
        // Placeholder while waiting to enter viewport
        <div 
          className="absolute inset-0 bg-gray-100 animate-pulse"
          style={fill ? undefined : { width: imageWidth, height: imageHeight }}
        />
      )}
      
      {/* Loading placeholder */}
      {isInView && !isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
});

// ✅ PERFORMANCE: Memoize thumbnail variant
export const OptimizedThumbnail = React.memo(function OptimizedThumbnail({
  src,
  alt,
  className,
  onError,
  onLoad,
  ...props
}: Omit<OptimizedImageProps, 'preset'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      className={className}
      preset="thumbnail"
      quality={60}
      onError={onError}
      onLoad={onLoad}
      {...props}
    />
  );
});

// ✅ PERFORMANCE: Memoize hero variant
export const OptimizedHero = React.memo(function OptimizedHero({
  src,
  alt,
  className,
  onError,
  onLoad,
  ...props
}: Omit<OptimizedImageProps, 'preset'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      className={className}
      preset="hero"
      quality={90}
      priority
      onError={onError}
      onLoad={onLoad}
      {...props}
    />
  );
});
