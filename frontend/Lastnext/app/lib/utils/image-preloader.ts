/**
 * Image Preloader Utility
 * Provides intelligent image preloading for better performance
 */

"use client";

import { useState, useCallback } from 'react';

export interface PreloadConfig {
  // Priority levels
  priority: 'high' | 'medium' | 'low';
  // Preload timing
  delay?: number;
  // Intersection observer options
  rootMargin?: string;
  threshold?: number;
  // Retry options
  maxRetries?: number;
  retryDelay?: number;
}

export interface PreloadResult {
  success: boolean;
  url: string;
  error?: string;
  loadTime?: number;
  cached?: boolean;
}

/**
 * Preload a single image
 */
export function preloadImage(
  url: string, 
  config: PreloadConfig = { priority: 'medium' }
): Promise<PreloadResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    
    const img = new Image();
    
    img.onload = () => {
      const loadTime = performance.now() - startTime;
      resolve({
        success: true,
        url,
        loadTime
      });
    };
    
    img.onerror = () => {
      resolve({
        success: false,
        url,
        error: 'Failed to load image'
      });
    };
    
    // Add delay for low priority images
    if (config.priority === 'low' && config.delay) {
      setTimeout(() => {
        img.src = url;
      }, config.delay);
    } else {
      img.src = url;
    }
  });
}

/**
 * Preload multiple images with priority ordering
 */
export async function preloadImages(
  urls: string[], 
  config: PreloadConfig = { priority: 'medium' }
): Promise<PreloadResult[]> {
  const results: PreloadResult[] = [];
  
  // Sort by priority (high first)
  const sortedUrls = [...urls];
  
  // Process high priority images first
  const highPriorityUrls = sortedUrls.slice(0, Math.ceil(sortedUrls.length * 0.3));
  const mediumPriorityUrls = sortedUrls.slice(
    Math.ceil(sortedUrls.length * 0.3), 
    Math.ceil(sortedUrls.length * 0.7)
  );
  const lowPriorityUrls = sortedUrls.slice(Math.ceil(sortedUrls.length * 0.7));
  
  // Preload high priority images immediately
  const highPriorityResults = await Promise.allSettled(
    highPriorityUrls.map(url => preloadImage(url, { ...config, priority: 'high' }))
  );
  
  results.push(...highPriorityResults.map(result => 
    result.status === 'fulfilled' ? result.value : {
      success: false,
      url: '',
      error: 'Promise rejected'
    }
  ));
  
  // Preload medium priority images with small delay
  if (mediumPriorityUrls.length > 0) {
    setTimeout(async () => {
      const mediumPriorityResults = await Promise.allSettled(
        mediumPriorityUrls.map(url => preloadImage(url, { ...config, priority: 'medium', delay: 100 }))
      );
      
      results.push(...mediumPriorityResults.map(result => 
        result.status === 'fulfilled' ? result.value : {
          success: false,
          url: '',
          error: 'Promise rejected'
        }
      ));
    }, 50);
  }
  
  // Preload low priority images with longer delay
  if (lowPriorityUrls.length > 0) {
    setTimeout(async () => {
      const lowPriorityResults = await Promise.allSettled(
        lowPriorityUrls.map(url => preloadImage(url, { ...config, priority: 'low', delay: 500 }))
      );
      
      results.push(...lowPriorityResults.map(result => 
        result.status === 'fulfilled' ? result.value : {
          success: false,
          url: '',
          error: 'Promise rejected'
        }
      ));
    }, 200);
  }
  
  return results;
}

/**
 * Preload images when they come into viewport
 */
export function preloadImagesOnIntersection(
  urls: string[],
  config: PreloadConfig = { priority: 'medium' }
): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const imgElement = entry.target as HTMLImageElement;
          const url = imgElement.dataset.preloadUrl;
          
          if (url) {
            preloadImage(url, config);
            observer.unobserve(imgElement);
          }
        }
      });
    },
    {
      rootMargin: config.rootMargin || '50px',
      threshold: config.threshold || 0.1
    }
  );
  
  // Observe all images with data-preload-url attribute
  const images = document.querySelectorAll('img[data-preload-url]');
  images.forEach(img => observer.observe(img));
  
  // Return cleanup function
  return () => observer.disconnect();
}

/**
 * Preload critical images for a page
 */
export function preloadCriticalImages(pageType: 'dashboard' | 'jobs' | 'maintenance' | 'profile'): void {
  const criticalImages: string[] = [];
  
  switch (pageType) {
    case 'dashboard':
      // Preload dashboard hero images, user avatars
      criticalImages.push(
        '/images/dashboard-hero.jpg',
        '/images/logo.png'
      );
      break;
      
    case 'jobs':
      // Preload job card images, status icons
      criticalImages.push(
        '/images/job-default.jpg',
        '/images/status-icons.png'
      );
      break;
      
    case 'maintenance':
      // Preload maintenance images, icons
      criticalImages.push(
        '/images/maintenance-icon.png',
        '/images/placeholder-maintenance.jpg'
      );
      break;
      
    case 'profile':
      // Preload profile placeholders
      criticalImages.push(
        '/images/profile-placeholder.jpg',
        '/images/avatar-default.png'
      );
      break;
  }
  
  // Filter out non-existent URLs and preload
  const validImages = criticalImages.filter(url => {
    // In a real app, you'd check if the URL exists
    return true;
  });
  
  if (validImages.length > 0) {
    preloadImages(validImages, { priority: 'high' });
  }
}

/**
 * Preload images based on user behavior
 */
export function preloadBasedOnBehavior(
  currentPage: string,
  userHistory: string[] = []
): void {
  // Analyze user history to predict next likely pages
  const likelyNextPages = predictNextPages(currentPage, userHistory);
  
  likelyNextPages.forEach(page => {
    preloadCriticalImages(page as any);
  });
}

/**
 * Predict likely next pages based on current page and history
 */
function predictNextPages(currentPage: string, userHistory: string[]): string[] {
  const predictions: string[] = [];
  
  // Simple prediction logic based on common user flows
  if (currentPage.includes('dashboard')) {
    predictions.push('jobs', 'maintenance');
  } else if (currentPage.includes('jobs')) {
    predictions.push('dashboard', 'maintenance');
  } else if (currentPage.includes('maintenance')) {
    predictions.push('dashboard', 'jobs');
  }
  
  // Add pages from recent history
  const recentPages = userHistory.slice(-3);
  predictions.push(...recentPages);
  
  return [...new Set(predictions)]; // Remove duplicates
}

/**
 * Hook for image preloading
 */
export function useImagePreloader() {
  const [preloadedImages, setPreloadedImages] = useState<Set<string>>(new Set());
  const [isPreloading, setIsPreloading] = useState(false);
  
  const preloadImageHook = useCallback(async (url: string, config?: PreloadConfig): Promise<PreloadResult> => {
    if (preloadedImages.has(url)) return { success: true, url, cached: true };
    
    setIsPreloading(true);
    const result = await preloadImage(url, config);
    
    if (result.success) {
      setPreloadedImages(prev => new Set([...prev, url]));
    }
    
    setIsPreloading(false);
    return result;
  }, [preloadedImages]);
  
  const preloadImagesHook = useCallback(async (urls: string[], config?: PreloadConfig): Promise<PreloadResult[]> => {
    setIsPreloading(true);
    const results = await preloadImages(urls, config);
    
    const successfulUrls = results
      .filter(result => result.success)
      .map(result => result.url);
    
    setPreloadedImages(prev => new Set([...prev, ...successfulUrls]));
    setIsPreloading(false);
    
    return results;
  }, []);
  
  return {
    preloadedImages,
    isPreloading,
    preloadImage: preloadImageHook,
    preloadImages: preloadImagesHook
  };
}

