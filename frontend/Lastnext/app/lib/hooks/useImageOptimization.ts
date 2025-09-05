"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { preloadImage, createLazyImageObserver } from '@/app/lib/utils/image-optimization';

interface UseImageOptimizationOptions {
  priority?: boolean;
  lazy?: boolean;
  threshold?: number;
  rootMargin?: string;
}

export function useImageOptimization(
  src: string,
  options: UseImageOptimizationOptions = {}
) {
  const {
    priority = false,
    lazy = true,
    threshold = 0.1,
    rootMargin = '50px'
  } = options;

  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(!lazy || priority);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Preload image if priority
  useEffect(() => {
    if (priority && src) {
      preloadImage(src)
        .then(() => setIsLoaded(true))
        .catch(() => setHasError(true));
    }
  }, [src, priority]);

  // Set up intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || priority || !imgRef.current) return;

    const observer = createLazyImageObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer?.disconnect();
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(imgRef.current);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [lazy, priority, threshold, rootMargin]);

  // Reset states when src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
    if (!lazy || priority) {
      setIsInView(true);
    }
  }, [src, lazy, priority]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoaded(false);
  }, []);

  return {
    isLoaded,
    hasError,
    isInView,
    imgRef,
    handleLoad,
    handleError,
    shouldLoad: isInView || priority
  };
}

// Hook for managing multiple images
export function useImageGallery(images: string[], options: UseImageOptimizationOptions = {}) {
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  const handleImageLoad = useCallback((index: number) => {
    setLoadedImages(prev => new Set([...prev, index]));
    setFailedImages(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const handleImageError = useCallback((index: number) => {
    setFailedImages(prev => new Set([...prev, index]));
    setLoadedImages(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const isImageLoaded = useCallback((index: number) => loadedImages.has(index), [loadedImages]);
  const isImageFailed = useCallback((index: number) => failedImages.has(index), [failedImages]);

  const preloadNextImages = useCallback((currentIndex: number, count: number = 2) => {
    const nextIndices = [];
    for (let i = 1; i <= count; i++) {
      const nextIndex = (currentIndex + i) % images.length;
      if (!loadedImages.has(nextIndex) && !failedImages.has(nextIndex)) {
        nextIndices.push(nextIndex);
      }
    }

    nextIndices.forEach(index => {
      if (images[index]) {
        preloadImage(images[index]).catch(() => {
          // Silently fail for preload
        });
      }
    });
  }, [images, loadedImages, failedImages]);

  return {
    loadedImages,
    failedImages,
    handleImageLoad,
    handleImageError,
    isImageLoaded,
    isImageFailed,
    preloadNextImages
  };
}
