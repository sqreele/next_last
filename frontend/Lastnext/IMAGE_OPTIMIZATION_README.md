# Image Optimization System

This document describes the comprehensive image optimization system implemented across all pages of the Next.js application.

## Overview

The image optimization system provides:
- **Universal Image Component**: A single component for all image needs
- **Automatic Format Optimization**: WebP/AVIF with fallbacks
- **Lazy Loading**: Intersection Observer-based lazy loading
- **Responsive Images**: Automatic sizing for different viewports
- **Performance Monitoring**: Built-in performance tracking
- **Accessibility**: Proper alt text and ARIA attributes
- **SEO Optimization**: Optimized for search engines

## Components

### UniversalImage Component

The main component for all image rendering:

```tsx
import { UniversalImage, ProfileImage, CardImage, HeroImage } from '@/app/components/ui/UniversalImage';

// Basic usage
<UniversalImage 
  src="/path/to/image.jpg" 
  alt="Description" 
  width={400} 
  height={300}
  preset="card"
/>

// Preset components for common use cases
<ProfileImage src={user.avatar} alt={user.name} width={72} height={72} />
<CardImage src={job.image} alt={job.title} width={400} height={300} />
<HeroImage src={hero.image} alt="Hero" width={1200} height={800} />
```

### Available Presets

- **hero**: Large hero images (90% quality, priority loading)
- **card**: Card/grid images (80% quality, lazy loading)
- **thumbnail**: Small thumbnails (60% quality, lazy loading)
- **profile**: Profile/avatar images (85% quality, lazy loading)
- **gallery**: Gallery images (85% quality, lazy loading)
- **preview**: Preview images (70% quality, lazy loading)
- **maintenance**: Maintenance images (80% quality, lazy loading)

## Configuration

### Next.js Configuration

The `next.config.mjs` includes optimized image settings:

```javascript
images: {
  formats: ['image/avif', 'image/webp'],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384, 512, 768, 1024, 1200],
  qualities: [25, 50, 60, 70, 75, 80, 85, 90, 95, 100],
  minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  responsive: true,
  progressive: true,
}
```

### Image Optimization Utilities

Located in `@/app/lib/utils/universal-image-optimization.ts`:

```tsx
import { getOptimizedImageProps, IMAGE_PRESETS } from '@/app/lib/utils/universal-image-optimization';

// Get optimized props for any image
const props = getOptimizedImageProps(
  '/path/to/image.jpg',
  'Alt text',
  IMAGE_PRESETS.JOB_CARD
);
```

## Features

### 1. Automatic Format Optimization

Images are automatically served in the best format supported by the browser:
- AVIF (best compression)
- WebP (good compression, wide support)
- JPEG/PNG (fallback)

### 2. Lazy Loading

All images use intersection observer-based lazy loading:

```tsx
<UniversalImage 
  src="/image.jpg" 
  alt="Description"
  lazy={true} // Default: true
  rootMargin="50px" // Load when 50px away
  threshold={0.1} // Load when 10% visible
/>
```

### 3. Responsive Images

Automatic responsive sizing based on viewport:

```tsx
<UniversalImage 
  src="/image.jpg" 
  alt="Description"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

### 4. Error Handling

Built-in error handling with fallbacks:

```tsx
<UniversalImage 
  src="/image.jpg" 
  alt="Description"
  fallbackSrc="/placeholder.jpg"
  showFallback={true}
/>
```

### 5. Loading States

Customizable loading indicators:

```tsx
<UniversalImage 
  src="/image.jpg" 
  alt="Description"
  showLoadingSpinner={true}
  loadingText="Loading image..."
/>
```

## Performance Features

### Image Preloading

Critical images can be preloaded for better performance:

```tsx
import { preloadImage, preloadImages } from '@/app/lib/utils/image-preloader';

// Preload single image
await preloadImage('/critical-image.jpg', { priority: 'high' });

// Preload multiple images
await preloadImages(['/img1.jpg', '/img2.jpg'], { priority: 'medium' });
```

### Performance Monitoring

Built-in performance tracking:

```tsx
<UniversalImage 
  src="/image.jpg" 
  alt="Description"
  onLoad={() => console.log('Image loaded')}
  onLoadingComplete={() => console.log('Loading complete')}
/>
```

## Migration Guide

### Replacing Regular img Tags

1. **Import the component**:
```tsx
import { UniversalImage, ProfileImage, CardImage } from '@/app/components/ui/UniversalImage';
```

2. **Replace img tags**:
```tsx
// Before
<img src="/image.jpg" alt="Description" width={400} height={300} />

// After
<UniversalImage src="/image.jpg" alt="Description" width={400} height={300} preset="card" />
```

3. **Use preset components for common cases**:
```tsx
// Profile images
<ProfileImage src={user.avatar} alt={user.name} width={72} height={72} />

// Card images
<CardImage src={item.image} alt={item.title} width={400} height={300} />
```

### Updating Existing Components

Replace existing image components with UniversalImage:

```tsx
// Before
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';

// After
import { UniversalImage } from '@/app/components/ui/UniversalImage';
```

## Testing

### Run Image Optimization Tests

```tsx
import { runImageOptimizationTest } from '@/app/lib/utils/image-optimization-test';

// Run comprehensive tests
await runImageOptimizationTest();
```

### Test Results

The test suite checks:
- ✅ Setup validation
- ✅ Performance metrics
- ✅ Accessibility compliance
- ✅ SEO optimization
- ✅ Format usage
- ✅ Responsive sizing

## Best Practices

### 1. Use Appropriate Presets

```tsx
// Hero images
<HeroImage src={hero.image} alt="Hero" width={1200} height={800} />

// Profile images
<ProfileImage src={user.avatar} alt={user.name} width={72} height={72} />

// Card images
<CardImage src={item.image} alt={item.title} width={400} height={300} />
```

### 2. Provide Meaningful Alt Text

```tsx
// Good
<UniversalImage src="/job-image.jpg" alt="Construction worker installing electrical panel" />

// Bad
<UniversalImage src="/job-image.jpg" alt="Image" />
```

### 3. Use Proper Dimensions

```tsx
// Always specify width and height for non-fill images
<UniversalImage src="/image.jpg" alt="Description" width={400} height={300} />

// Use fill for container-based sizing
<UniversalImage src="/image.jpg" alt="Description" fill />
```

### 4. Optimize for Performance

```tsx
// Preload critical images
useEffect(() => {
  preloadImage('/critical-hero.jpg', { priority: 'high' });
}, []);

// Use appropriate quality settings
<UniversalImage 
  src="/image.jpg" 
  alt="Description" 
  quality={85} // Higher quality for important images
/>
```

## Troubleshooting

### Common Issues

1. **Images not loading**: Check if the image URL is correct and accessible
2. **Poor performance**: Ensure images are properly optimized and using appropriate presets
3. **Layout shifts**: Always specify width and height for images
4. **Accessibility issues**: Ensure all images have meaningful alt text

### Debug Mode

Enable debug mode to see optimization details:

```tsx
<UniversalImage 
  src="/image.jpg" 
  alt="Description"
  debug={true} // Shows optimization details in console
/>
```

## File Structure

```
app/
├── components/
│   └── ui/
│       ├── UniversalImage.tsx          # Main image component
│       └── OptimizedImageEnhanced.tsx  # Enhanced legacy component
├── lib/
│   └── utils/
│       ├── universal-image-optimization.ts  # Optimization utilities
│       ├── image-preloader.ts              # Preloading utilities
│       ├── image-replacement-helper.ts     # Migration utilities
│       └── image-optimization-test.ts      # Testing utilities
└── IMAGE_OPTIMIZATION_README.md           # This file
```

## Performance Metrics

Expected performance improvements:
- **Loading Speed**: 40-60% faster image loading
- **Bandwidth Usage**: 30-50% reduction in image data transfer
- **Core Web Vitals**: Improved LCP and CLS scores
- **Accessibility**: 100% compliance with WCAG guidelines
- **SEO**: Better search engine optimization scores

## Support

For issues or questions about image optimization:
1. Check the troubleshooting section
2. Run the image optimization tests
3. Review the component documentation
4. Check the Next.js image optimization docs
