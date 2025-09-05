/**
 * Image Replacement Helper
 * Utilities to help replace regular <img> tags with optimized components
 */

import { UniversalImageProps } from '@/app/components/ui/UniversalImage';
import { getOptimizedImageProps, IMAGE_PRESETS } from './universal-image-optimization';

export interface ImageReplacementConfig {
  // Default settings
  defaultPreset?: 'hero' | 'card' | 'thumbnail' | 'profile' | 'gallery' | 'preview' | 'maintenance';
  preset?: 'hero' | 'card' | 'thumbnail' | 'profile' | 'gallery' | 'preview' | 'maintenance';
  // Quality overrides
  quality?: number;
  // Lazy loading
  lazy?: boolean;
  // Priority loading
  priority?: boolean;
  // Fallback settings
  fallbackSrc?: string;
  showFallback?: boolean;
  // Loading settings
  showLoadingSpinner?: boolean;
  loadingText?: string;
}

/**
 * Convert regular img tag props to UniversalImage props
 */
export function convertImgToUniversalImage(
  imgProps: {
    src: string;
    alt: string;
    className?: string;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
  },
  config: ImageReplacementConfig = {}
): UniversalImageProps {
  const {
    defaultPreset = 'card',
    quality,
    lazy = true,
    priority = false,
    fallbackSrc,
    showFallback = true,
    showLoadingSpinner = true,
    loadingText = 'Loading...'
  } = config;

  // Determine preset based on context clues
  const preset = determinePresetFromProps(imgProps, defaultPreset);

  // Get optimized props
  const optimizedProps = getOptimizedImageProps(
    imgProps.src,
    imgProps.alt,
    IMAGE_PRESETS[preset.toUpperCase() as keyof typeof IMAGE_PRESETS] || IMAGE_PRESETS.JOB_CARD,
    {
      className: imgProps.className,
      width: imgProps.width,
      height: imgProps.height,
      quality,
      priority,
      lazy,
      fallbackSrc,
      showFallback,
      showLoadingSpinner,
      loadingText
    }
  );

  return optimizedProps;
}

/**
 * Determine the best preset based on img tag properties
 */
function determinePresetFromProps(
  imgProps: { src: string; alt: string; className?: string; width?: number; height?: number },
  defaultPreset: string
): 'hero' | 'card' | 'thumbnail' | 'profile' | 'gallery' | 'preview' | 'maintenance' {
  const { src, alt, className = '', width, height } = imgProps;

  // Check for profile images
  if (alt.toLowerCase().includes('profile') || 
      alt.toLowerCase().includes('user') || 
      alt.toLowerCase().includes('avatar') ||
      className.includes('profile') ||
      className.includes('avatar') ||
      (width && height && Math.abs(width - height) < 20)) {
    return 'profile';
  }

  // Check for thumbnail images
  if (width && height && (width <= 150 || height <= 150) ||
      className.includes('thumbnail') ||
      className.includes('thumb')) {
    return 'thumbnail';
  }

  // Check for hero images
  if (width && height && (width >= 800 || height >= 600) ||
      className.includes('hero') ||
      className.includes('banner') ||
      className.includes('main')) {
    return 'hero';
  }

  // Check for gallery images
  if (className.includes('gallery') ||
      className.includes('gallery-item') ||
      alt.toLowerCase().includes('gallery')) {
    return 'gallery';
  }

  // Check for maintenance images
  if (alt.toLowerCase().includes('maintenance') ||
      alt.toLowerCase().includes('before') ||
      alt.toLowerCase().includes('after') ||
      className.includes('maintenance')) {
    return 'maintenance';
  }

  // Check for preview images
  if (className.includes('preview') ||
      alt.toLowerCase().includes('preview')) {
    return 'preview';
  }

  // Default to card for most cases
  return defaultPreset as any;
}

/**
 * Common replacement patterns for different contexts
 */
export const REPLACEMENT_PATTERNS = {
  // Profile images
  profile: {
    preset: 'profile' as const,
    quality: 85,
    lazy: true,
    priority: false,
    showLoadingSpinner: false
  },
  
  // Job card images
  jobCard: {
    preset: 'card' as const,
    quality: 80,
    lazy: true,
    priority: false,
    showLoadingSpinner: true
  },
  
  // Job hero images
  jobHero: {
    preset: 'hero' as const,
    quality: 90,
    lazy: false,
    priority: true,
    showLoadingSpinner: true
  },
  
  // Maintenance images
  maintenance: {
    preset: 'maintenance' as const,
    quality: 80,
    lazy: true,
    priority: false,
    showLoadingSpinner: true
  },
  
  // Gallery images
  gallery: {
    preset: 'gallery' as const,
    quality: 85,
    lazy: true,
    priority: false,
    showLoadingSpinner: true
  },
  
  // Thumbnail images
  thumbnail: {
    preset: 'thumbnail' as const,
    quality: 60,
    lazy: true,
    priority: false,
    showLoadingSpinner: false
  }
} as const;

/**
 * Get replacement config for specific context
 */
export function getReplacementConfig(context: keyof typeof REPLACEMENT_PATTERNS): ImageReplacementConfig {
  return REPLACEMENT_PATTERNS[context];
}

/**
 * Batch convert multiple img tags
 */
export function batchConvertImgTags(
  imgTags: Array<{
    src: string;
    alt: string;
    className?: string;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
  }>,
  context: keyof typeof REPLACEMENT_PATTERNS = 'jobCard'
): UniversalImageProps[] {
  const config = getReplacementConfig(context);
  
  return imgTags.map(imgProps => 
    convertImgToUniversalImage(imgProps, config)
  );
}

/**
 * Generate replacement code for common patterns
 */
export function generateReplacementCode(
  originalCode: string,
  context: keyof typeof REPLACEMENT_PATTERNS = 'jobCard'
): string {
  const config = getReplacementConfig(context);
  
  // This would be used by a build tool or manual replacement process
  // For now, it's a placeholder for future automation
  return originalCode.replace(
    /<img\s+([^>]*?)>/g,
    (match, attributes) => {
      // Parse attributes and convert to UniversalImage
      // This is a simplified example
      return `<UniversalImage ${attributes} preset="${config.preset}" quality={${config.quality}} />`;
    }
  );
}

/**
 * Validate image optimization setup
 */
export function validateImageOptimization(): {
  isValid: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check if UniversalImage is properly imported
  try {
    require('@/app/components/ui/UniversalImage');
  } catch (error) {
    issues.push('UniversalImage component not found');
  }

  // Check if optimization utilities are available
  try {
    require('@/app/lib/utils/universal-image-optimization');
  } catch (error) {
    issues.push('Image optimization utilities not found');
  }

  // Check Next.js config
  try {
    const nextConfig = require('@/next.config.mjs');
    if (!nextConfig.default?.images?.formats?.includes('image/avif')) {
      recommendations.push('Consider adding AVIF format support in Next.js config');
    }
    if (!nextConfig.default?.images?.formats?.includes('image/webp')) {
      recommendations.push('Consider adding WebP format support in Next.js config');
    }
  } catch (error) {
    issues.push('Next.js config not found or invalid');
  }

  return {
    isValid: issues.length === 0,
    issues,
    recommendations
  };
}
