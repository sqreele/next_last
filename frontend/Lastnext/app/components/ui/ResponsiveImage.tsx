'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/app/lib/utils/cn';

interface ResponsiveImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  quality?: number;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  aspectRatio?: 'square' | 'video' | 'portrait' | 'landscape' | 'auto';
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
  onError?: () => void;
}

export function ResponsiveImage({
  src,
  alt,
  className,
  priority = false,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  quality = 85,
  placeholder = 'empty',
  blurDataURL,
  fill = false,
  width,
  height,
  aspectRatio = 'auto',
  loading = 'lazy',
  onLoad,
  onError,
}: ResponsiveImageProps) {
  const [imageError, setImageError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  const handleLoad = () => {
    setIsLoading(false);
    onLoad?.();
  };

  const handleError = () => {
    setImageError(true);
    setIsLoading(false);
    onError?.();
  };

  const aspectRatioClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    portrait: 'aspect-[3/4]',
    landscape: 'aspect-[4/3]',
    auto: '',
  };

  if (imageError) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-gray-100 text-gray-400 rounded-lg',
          aspectRatioClasses[aspectRatio],
          className
        )}
        role="img"
        aria-label={alt}
      >
        <svg
          className="w-8 h-8 mobile:w-12 mobile:h-12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  const imageProps = {
    src,
    alt,
    priority,
    quality,
    placeholder,
    blurDataURL,
    loading,
    onLoad: handleLoad,
    onError: handleError,
    sizes,
    className: cn(
      'transition-all duration-300',
      {
        'opacity-0': isLoading,
        'opacity-100': !isLoading,
      },
      aspectRatioClasses[aspectRatio],
      className
    ),
  };

  if (fill) {
    return (
      <div className={cn('relative overflow-hidden', aspectRatioClasses[aspectRatio])}>
        <Image
          {...imageProps}
          fill
          style={{
            objectFit: 'cover',
          }}
        />
        {isLoading && (
          <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-lg" />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Image
        {...imageProps}
        width={width}
        height={height}
        style={{
          width: '100%',
          height: 'auto',
        }}
      />
      {isLoading && (
        <div
          className={cn(
            'absolute inset-0 bg-gray-200 animate-pulse rounded-lg',
            aspectRatioClasses[aspectRatio]
          )}
        />
      )}
    </div>
  );
}

// Optimized avatar component for profile images
export function ResponsiveAvatar({
  src,
  alt,
  size = 'md',
  className,
  fallback,
}: {
  src?: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  fallback?: React.ReactNode;
}) {
  const sizeClasses = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10 mobile:w-12 mobile:h-12',
    lg: 'w-12 h-12 mobile:w-16 mobile:h-16',
    xl: 'w-16 h-16 mobile:w-20 mobile:h-20',
  };

  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-gray-200 text-gray-600',
          sizeClasses[size],
          className
        )}
      >
        {fallback || (
          <svg
            className="w-1/2 h-1/2"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        )}
      </div>
    );
  }

  return (
    <ResponsiveImage
      src={src}
      alt={alt}
      width={80}
      height={80}
      aspectRatio="square"
      className={cn(
        'rounded-full object-cover',
        sizeClasses[size],
        className
      )}
      sizes="(max-width: 768px) 80px, 80px"
      quality={90}
      priority
    />
  );
}

// Gallery component for multiple images
export function ResponsiveGallery({
  images,
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  className,
}: {
  images: Array<{
    src: string;
    alt: string;
    caption?: string;
  }>;
  columns?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  className?: string;
}) {
  const gridClasses = `
    grid gap-4
    grid-cols-${columns.mobile || 1}
    tablet:grid-cols-${columns.tablet || 2}
    desktop:grid-cols-${columns.desktop || 3}
  `;

  return (
    <div className={cn(gridClasses, className)}>
      {images.map((image, index) => (
        <div key={index} className="space-y-2">
          <ResponsiveImage
            src={image.src}
            alt={image.alt}
            aspectRatio="square"
            className="rounded-lg hover:shadow-lg transition-shadow duration-200"
            loading={index < 3 ? 'eager' : 'lazy'}
          />
          {image.caption && (
            <p className="text-sm text-gray-600 text-center">{image.caption}</p>
          )}
        </div>
      ))}
    </div>
  );
}

