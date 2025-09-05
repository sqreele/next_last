/**
 * Universal Image Optimization Utilities
 * Provides comprehensive image optimization for all pages and components
 */

"use client";

import { UniversalImageProps } from '@/app/components/ui/UniversalImage';

export interface ImageOptimizationConfig {
  // Quality settings
  quality: number;
  // Loading behavior
  priority: boolean;
  lazy: boolean;
  // Placeholder settings
  placeholder: 'blur' | 'empty';
  blurDataURL?: string;
  // Responsive settings
  sizes: string;
  // Optimization settings
  unoptimized: boolean;
  // Performance settings
  rootMargin: string;
  threshold: number;
}

export interface ImagePresetOptions {
  type: 'hero' | 'card' | 'thumbnail' | 'profile' | 'gallery' | 'preview' | 'maintenance';
  priority?: boolean;
  lazy?: boolean;
  blur?: boolean;
  external?: boolean;
  responsive?: boolean;
}

/**
 * Generate optimized image configuration based on use case
 */
export function getImageOptimizationConfig(options: ImagePresetOptions): ImageOptimizationConfig {
  const { 
    type, 
    priority = false, 
    lazy = true, 
    blur = true, 
    external = false,
    responsive = true 
  } = options;

  // Default blur data URL for better loading experience
  const defaultBlurDataURL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q==";

  const configs: Record<string, ImageOptimizationConfig> = {
    hero: {
      quality: 90,
      priority: priority || true,
      lazy: lazy && !priority,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: responsive ? "(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw" : "100vw",
      unoptimized: external,
      rootMargin: '100px',
      threshold: 0.1
    },
    card: {
      quality: 80,
      priority: priority,
      lazy: lazy,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: responsive ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" : "400px",
      unoptimized: external,
      rootMargin: '50px',
      threshold: 0.1
    },
    thumbnail: {
      quality: 60,
      priority: priority,
      lazy: lazy,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: responsive ? "(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw" : "150px",
      unoptimized: external,
      rootMargin: '50px',
      threshold: 0.1
    },
    profile: {
      quality: 85,
      priority: priority,
      lazy: lazy,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: responsive ? "(max-width: 768px) 80px, 120px" : "120px",
      unoptimized: external,
      rootMargin: '50px',
      threshold: 0.1
    },
    gallery: {
      quality: 85,
      priority: priority,
      lazy: lazy,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: responsive ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" : "400px",
      unoptimized: external,
      rootMargin: '50px',
      threshold: 0.1
    },
    preview: {
      quality: 70,
      priority: priority,
      lazy: lazy,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: responsive ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw" : "300px",
      unoptimized: external,
      rootMargin: '50px',
      threshold: 0.1
    },
    maintenance: {
      quality: 80,
      priority: priority,
      lazy: lazy,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: responsive ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 40vw" : "400px",
      unoptimized: external,
      rootMargin: '50px',
      threshold: 0.1
    }
  };

  return configs[type] || configs.card;
}

/**
 * Check if image URL is external
 */
export function isExternalImage(url: string): boolean {
  return url.startsWith('http') || url.startsWith('/media/');
}

/**
 * Generate responsive sizes string based on container width
 */
export function generateResponsiveSizes(containerWidth: number): string {
  if (containerWidth <= 640) {
    return "100vw";
  } else if (containerWidth <= 768) {
    return "(max-width: 640px) 100vw, 80vw";
  } else if (containerWidth <= 1024) {
    return "(max-width: 640px) 100vw, (max-width: 768px) 80vw, 60vw";
  } else if (containerWidth <= 1280) {
    return "(max-width: 640px) 100vw, (max-width: 768px) 80vw, (max-width: 1024px) 60vw, 50vw";
  } else {
    return "(max-width: 640px) 100vw, (max-width: 768px) 80vw, (max-width: 1024px) 60vw, (max-width: 1280px) 50vw, 40vw";
  }
}

/**
 * Get optimized image props for UniversalImage component
 */
export function getOptimizedImageProps(
  src: string,
  alt: string,
  options: ImagePresetOptions,
  additionalProps?: Partial<UniversalImageProps>
): UniversalImageProps {
  const config = getImageOptimizationConfig(options);
  const isExternal = isExternalImage(src);

  return {
    src,
    alt,
    quality: config.quality,
    priority: config.priority,
    lazy: config.lazy,
    placeholder: config.placeholder,
    blurDataURL: config.blurDataURL,
    sizes: config.sizes,
    unoptimized: config.unoptimized || isExternal,
    rootMargin: config.rootMargin,
    threshold: config.threshold,
    preset: options.type,
    ...additionalProps
  };
}

/**
 * Preload critical images
 */
export function preloadImage(src: string, as: 'image' = 'image'): void {
  if (typeof window !== 'undefined') {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = src;
    document.head.appendChild(link);
  }
}

/**
 * Preload multiple images
 */
export function preloadImages(srcs: string[]): void {
  srcs.forEach(src => preloadImage(src));
}

/**
 * Generate optimized image URL with query parameters
 */
export function generateOptimizedImageUrl(
  src: string,
  width: number,
  height: number,
  quality: number = 75,
  format: 'webp' | 'avif' | 'jpeg' = 'webp'
): string {
  if (isExternalImage(src)) {
    return src; // Return original URL for external images
  }

  // For internal images, Next.js will handle optimization automatically
  return src;
}

/**
 * Image optimization presets for common use cases
 */
export const IMAGE_PRESETS = {
  // Job card images
  JOB_CARD: {
    type: 'card' as const,
    priority: false,
    lazy: true,
    blur: true,
    external: false,
    responsive: true
  },
  
  // Job detail hero images
  JOB_HERO: {
    type: 'hero' as const,
    priority: true,
    lazy: false,
    blur: true,
    external: false,
    responsive: true
  },
  
  // Profile images
  PROFILE: {
    type: 'profile' as const,
    priority: false,
    lazy: true,
    blur: true,
    external: true,
    responsive: true
  },
  
  // Thumbnail images
  THUMBNAIL: {
    type: 'thumbnail' as const,
    priority: false,
    lazy: true,
    blur: false,
    external: false,
    responsive: true
  },
  
  // Gallery images
  GALLERY: {
    type: 'gallery' as const,
    priority: false,
    lazy: true,
    blur: true,
    external: false,
    responsive: true
  },
  
  // Preview images
  PREVIEW: {
    type: 'preview' as const,
    priority: false,
    lazy: true,
    blur: true,
    external: false,
    responsive: true
  },
  
  // Maintenance images
  MAINTENANCE: {
    type: 'maintenance' as const,
    priority: false,
    lazy: true,
    blur: true,
    external: false,
    responsive: true
  }
} as const;

/**
 * Hook for lazy image loading with intersection observer
 */
export function useLazyImageLoading() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return { imgRef, isLoaded, hasError, setHasError, isInView };
}

// Import React hooks
import { useState, useEffect, useRef } from 'react';
