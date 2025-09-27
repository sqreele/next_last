# Production Image Export Fix for Job PDFs

## Problem Description

Images were not showing in job PDF exports when running in production environment. This was caused by inconsistent URL resolution across different PDF generation components.

## Root Causes

### 1. **Inconsistent URL Resolution**
- Multiple image URL resolution functions with different logic
- Inconsistent production environment detection
- Mixed handling of Docker internal URLs vs external URLs

### 2. **Environment Detection Issues**
- Some components used `window.location.hostname` for production detection
- Others used `process.env.NODE_ENV`
- Inconsistent fallback URLs

### 3. **CORS and Cross-Origin Issues**
- PDF generation used `crossOrigin = 'anonymous'` but production had CORS restrictions
- Mixed content issues between HTTP and HTTPS

## Solution Implemented

### 1. **Created Unified Image URL Resolution**
Created `/frontend/Lastnext/app/lib/utils/pdfImageUtils.ts` with:

- **`getProductionImageUrl()`**: Unified URL resolution for PDF generation
- **`getSupportedImageFromJob()`**: Extracts supported image formats from job data
- **`validateImageForPdf()`**: Validates image accessibility with timeout
- **Consistent environment detection**: Uses both `NODE_ENV` and `window.location` for reliability

### 2. **Updated PDF Generation Components**

#### JobsPDFGenerator.tsx
- Replaced `pickSupportedImageUrlFromJob()` with unified function
- Added import for `getSupportedImageFromJob`

#### JobPDFTemplate.tsx
- Simplified image resolution logic
- Uses unified `getSupportedImageFromJob()` function
- Removed duplicate URL resolution code

### 3. **Key Features of the Fix**

#### Production URL Handling
```typescript
// Automatically detects production environment
const isProduction = window.location?.hostname?.endsWith('pcms.live');
if (isProduction) {
  return 'https://pcms.live';
}
```

#### Docker URL Conversion
```typescript
// Converts internal Docker URLs to external URLs
const isInternal = /(^backend$)|(^localhost)|(^127\.0\.0\.1)/.test(url.hostname);
if (isInternal && isMediaPath) {
  return `${baseUrl}${pathname}${url.search || ''}`;
}
```

#### Image Format Support
- Converts WebP to JPG for PDF compatibility
- Supports JPG, JPEG, PNG, GIF formats
- Handles both `images` array and `image_urls` array

#### Error Handling
- 5-second timeout for image validation
- Graceful fallbacks for failed URL resolution
- Console warnings for debugging

## Files Modified

1. **Created**: `/frontend/Lastnext/app/lib/utils/pdfImageUtils.ts`
2. **Modified**: `/frontend/Lastnext/app/components/document/JobsPDFGenerator.tsx`
3. **Modified**: `/frontend/Lastnext/app/components/document/JobPDFTemplate.tsx`

## Testing the Fix

### 1. **Development Environment**
```bash
# Start development server
npm run dev

# Export a job PDF with images
# Images should show correctly using localhost:8000 URLs
```

### 2. **Production Environment**
```bash
# Build and deploy to production
npm run build
npm start

# Export a job PDF with images
# Images should show correctly using https://pcms.live URLs
```

### 3. **Verify Image URLs**
Check browser console for:
- No CORS errors
- Images loading successfully
- Correct production URLs (https://pcms.live/media/...)

## Environment Variables Required

### Development
```env
NEXT_PUBLIC_MEDIA_URL=http://localhost:8000
NEXT_PRIVATE_API_URL=http://backend:8000
```

### Production
```env
NODE_ENV=production
NEXT_PUBLIC_MEDIA_URL=https://pcms.live
NEXT_PRIVATE_API_URL=https://pcms.live
```

## Troubleshooting

### Images Still Not Showing

1. **Check Console Errors**
   - Look for CORS errors
   - Check for 404 errors on image URLs
   - Verify HTTPS vs HTTP issues

2. **Verify Environment Variables**
   ```bash
   # In production, check these are set correctly
   echo $NODE_ENV
   echo $NEXT_PUBLIC_MEDIA_URL
   ```

3. **Test Image URLs Manually**
   ```bash
   # Test if image URLs are accessible
   curl -I https://pcms.live/media/maintenance_job_images/your-image.jpg
   ```

### PDF Generation Fails

1. **Check Image Format Support**
   - Only JPG, JPEG, PNG, GIF are supported
   - WebP images are automatically converted to JPG

2. **Verify CORS Headers**
   - Backend must allow CORS for image requests
   - Check nginx configuration for media files

## Benefits of This Fix

1. **Consistent URL Resolution**: All PDF components use the same logic
2. **Production Ready**: Properly handles production vs development environments
3. **Error Resilient**: Graceful fallbacks for failed image loading
4. **Maintainable**: Centralized image URL logic in one utility file
5. **Performance**: Timeout-based validation prevents hanging requests

## Future Improvements

1. **Image Optimization**: Pre-process images for PDF generation
2. **Caching**: Cache resolved image URLs for better performance
3. **Batch Processing**: Process multiple images in parallel
4. **Error Reporting**: Better error logging for production debugging
