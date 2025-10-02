/**
 * Image optimization utilities for better performance and quality
 */

export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'avif';
  placeholder?: 'blur' | 'empty';
  priority?: boolean;
  sizes?: string;
}

/**
 * Generate optimized image URL with query parameters
 */
export function getOptimizedImageUrl(
  src: string, 
  options: ImageOptimizationOptions = {}
): string {
  const {
    width = 400,
    height = 300,
    quality = 75,
    format = 'jpeg',
    placeholder = 'blur'
  } = options;

  // If it's already a Next.js optimized URL, return as is
  if (src.includes('/_next/image')) {
    return src;
  }

  // For external URLs, use Next.js image optimization
  if (src.startsWith('http')) {
    return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
  }

  // For local media files, construct optimized path
  if (src.startsWith('/media/')) {
    return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
  }

  return src;
}

/**
 * Generate responsive image sizes for different viewports
 */
export function getResponsiveSizes(breakpoints: { [key: string]: number } = {}): string {
  const defaultBreakpoints = {
    'sm': 640,
    'md': 768,
    'lg': 1024,
    'xl': 1280
  };

  const merged = { ...defaultBreakpoints, ...breakpoints };
  
  return Object.entries(merged)
    .map(([breakpoint, width]) => `(max-width: ${width}px) ${width}px`)
    .join(', ') + `, ${Math.max(...Object.values(merged))}px`;
}

/**
 * Generate blur placeholder data URL
 */
export function generateBlurDataURL(width: number = 10, height: number = 10): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f3f4f6');
    gradient.addColorStop(1, '#e5e7eb');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  
  return canvas.toDataURL('image/jpeg', 0.1);
}

/**
 * Preload critical images
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Lazy load images with intersection observer
 */
export function createLazyImageObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options: IntersectionObserverInit = {}
): IntersectionObserver {
  const defaultOptions: IntersectionObserverInit = {
    rootMargin: '50px',
    threshold: 0.1,
    ...options
  };

  return new IntersectionObserver(callback, defaultOptions);
}

/**
 * Image quality presets for different use cases
 */
export const IMAGE_PRESETS = {
  thumbnail: { width: 150, height: 150, quality: 60 },
  card: { width: 400, height: 300, quality: 75 },
  detail: { width: 800, height: 600, quality: 85 },
  hero: { width: 1200, height: 800, quality: 90 }
} as const;

/**
 * Get optimized image props for Next.js Image component
 */
export function getOptimizedImageProps(
  src: string,
  preset: keyof typeof IMAGE_PRESETS = 'card',
  customOptions: Partial<ImageOptimizationOptions> = {}
) {
  const presetOptions = IMAGE_PRESETS[preset];
  const options = { ...presetOptions, ...customOptions };

  return {
    src: getOptimizedImageUrl(src, options),
    width: options.width,
    height: options.height,
    quality: options.quality,
    placeholder: 'blur' as const,
    blurDataURL: generateBlurDataURL(10, 10),
    sizes: getResponsiveSizes(),
    loading: 'lazy' as const,
    ...customOptions
  };
}
