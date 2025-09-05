/**
 * Enhanced Image Optimization Utilities
 * Provides optimized settings for different image use cases
 */

"use client";

import { ImageProps } from 'next/image';

export interface OptimizedImageConfig {
  quality: number;
  priority: boolean;
  placeholder: 'blur' | 'empty';
  blurDataURL?: string;
  sizes: string;
  unoptimized: boolean;
}

export interface ImageOptimizationOptions {
  type: 'hero' | 'thumbnail' | 'card' | 'profile' | 'gallery' | 'preview';
  priority?: boolean;
  blur?: boolean;
  external?: boolean;
}

/**
 * Get optimized image configuration based on use case
 */
export function getOptimizedImageConfig(options: ImageOptimizationOptions): OptimizedImageConfig {
  const { type, priority = false, blur = true, external = false } = options;

  // Default blur data URL for better loading experience
  const defaultBlurDataURL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q==";

  const configs: Record<string, OptimizedImageConfig> = {
    hero: {
      quality: 85,
      priority: priority || true,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw",
      unoptimized: external
    },
    thumbnail: {
      quality: 60,
      priority: priority,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: "(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw",
      unoptimized: external
    },
    card: {
      quality: 75,
      priority: priority,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
      unoptimized: external
    },
    profile: {
      quality: 80,
      priority: priority,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: "(max-width: 768px) 80px, 120px",
      unoptimized: external
    },
    gallery: {
      quality: 85,
      priority: priority,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
      unoptimized: external
    },
    preview: {
      quality: 70,
      priority: priority,
      placeholder: blur ? 'blur' : 'empty',
      blurDataURL: blur ? defaultBlurDataURL : undefined,
      sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw",
      unoptimized: external
    }
  };

  return configs[type] || configs.card;
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
 * Check if image URL is external
 */
export function isExternalImage(url: string): boolean {
  // Consider both external URLs and relative media URLs as unoptimized
  // since relative URLs go through Next.js rewrite rules to the backend
  return url.startsWith('http') || url.startsWith('/media/');
}

/**
 * Get optimized image props for Next.js Image component
 */
export function getOptimizedImageProps(
  src: string,
  alt: string,
  options: ImageOptimizationOptions,
  additionalProps?: Partial<ImageProps>
): ImageProps {
  const config = getOptimizedImageConfig(options);
  const isExternal = isExternalImage(src);

  return {
    src,
    alt,
    quality: config.quality,
    priority: config.priority,
    placeholder: config.placeholder,
    blurDataURL: config.blurDataURL,
    sizes: config.sizes,
    unoptimized: config.unoptimized || isExternal,
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
 * Lazy load images with intersection observer
 */
export function useLazyImageLoading() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsLoaded(true);
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

  return { imgRef, isLoaded, hasError, setHasError };
}

/**
 * Image optimization presets for common use cases
 */
export const IMAGE_PRESETS = {
  // Job card images
  JOB_CARD: {
    type: 'card' as const,
    priority: false,
    blur: true,
    external: false
  },
  
  // Job detail hero images
  JOB_HERO: {
    type: 'hero' as const,
    priority: true,
    blur: true,
    external: false
  },
  
  // Profile images
  PROFILE: {
    type: 'profile' as const,
    priority: false,
    blur: true,
    external: true
  },
  
  // Thumbnail images
  THUMBNAIL: {
    type: 'thumbnail' as const,
    priority: false,
    blur: false,
    external: false
  },
  
  // Gallery images
  GALLERY: {
    type: 'gallery' as const,
    priority: false,
    blur: true,
    external: false
  },
  
  // Preview images
  PREVIEW: {
    type: 'preview' as const,
    priority: false,
    blur: true,
    external: false
  }
} as const;

// Import React hooks
import { useState, useEffect, useRef } from 'react';
