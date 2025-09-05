"use client";

import React, { useState, useRef, useEffect } from 'react';
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

export function OptimizedImage({
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
  const imgRef = useRef<HTMLImageElement>(null);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Reset error state when src changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [src]);

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
    <div className={cn("relative overflow-hidden", className)}>
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
        style={{
          objectFit,
          transition: 'opacity 0.3s ease-in-out',
          opacity: isLoaded ? 1 : 0,
        }}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
      
      {/* Loading placeholder */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

// Thumbnail variant for smaller images
export function OptimizedThumbnail({
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
}

// Hero variant for large images
export function OptimizedHero({
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
}
