# Jobs PDF Image Production Fix

## 🎯 Problem Summary

Images were not showing consistently in job PDF exports in production environment (pcms.live). The root cause was **duplicate and inconsistent URL resolution functions** between `JobsPDFGenerator.tsx` and `pdfImageUtils.ts`.

## 🔍 Root Cause Analysis

### The Problem

`JobsPDFGenerator.tsx` contained its own duplicate URL resolution functions:
- `getMediaBaseUrl()` - For determining base URL
- `toAbsolutePdfImageUrl()` - For converting image URLs
- `pickSupportedImageUrlFromJob()` - For selecting images

These duplicated the functionality already present in `pdfImageUtils.ts`:
- `getPdfMediaBaseUrl()` - Unified base URL detection
- `getProductionImageUrl()` - Unified URL resolution
- `getSupportedImageFromJob()` - Unified image selection

### Why This Caused Issues

1. **Inconsistent Production Detection**: The two implementations had slightly different logic for detecting production environment
2. **Maintenance Issues**: Bug fixes applied to one location weren't applied to the other
3. **URL Resolution Mismatch**: Different handling of edge cases (Docker URLs, HTTP vs HTTPS, etc.)

## ✅ Solution Implemented

### Changes Made to `JobsPDFGenerator.tsx`

1. **Added Import**: Now imports both `getSupportedImageFromJob` and `getProductionImageUrl` from `pdfImageUtils.ts`

```typescript
import { getSupportedImageFromJob, getProductionImageUrl } from '@/app/lib/utils/pdfImageUtils';
```

2. **Removed Duplicate Functions**: Deleted the following duplicate functions:
   - `getMediaBaseUrl()`
   - `toAbsolutePdfImageUrl()`
   - `pickSupportedImageUrlFromJob()`
   - `SUPPORTED_IMAGE_EXTENSIONS` constant

3. **Updated Image Rendering**: Modified the image rendering logic to use the unified function directly:

```typescript
// Before:
const url = pickSupportedImageUrlFromJob(job);

// After:
const url = getSupportedImageFromJob(job);
```

4. **Improved Logging**: Updated console log prefixes for better debugging:
   - `[PDF Image Debug]` → `[JobsPDF Image Debug]`
   - `[PDF Image]` → `[JobsPDF Image]`

### Unified Implementation in `pdfImageUtils.ts`

The unified implementation already handles:

✅ **Production Environment Detection**
- Client-side: Checks `window.location.hostname.endsWith('pcms.live')`
- Server-side: Checks `process.env.NODE_ENV === 'production'`
- Fallback: Defaults to production mode for safety

✅ **URL Resolution**
- Converts Docker internal URLs (backend:8000) to external URLs
- Forces HTTPS for pcms.live domain
- Handles relative and absolute URLs
- Preserves query parameters

✅ **Image Format Support**
- Only selects supported formats (JPG, JPEG, PNG, GIF)
- Filters out unsupported formats (WebP, SVG, etc.)
- Returns only the FIRST supported image per job

✅ **Comprehensive Logging**
- `[PDF Media Base URL]` - Base URL detection process
- `[PDF Image URL]` - URL resolution steps
- `[PDF Image Utils]` - Image selection logic

## 🎨 Important Design Decision

**PDF exports show ONLY ONE IMAGE per job** by design, not all images. This is intentional to:
- Keep PDF file sizes manageable
- Maintain consistent layout across pages
- Ensure optimal PDF generation performance

From the code documentation:
```typescript
/**
 * Gets a single supported image from a job for PDF export.
 * 
 * ⚠️ IMPORTANT: This function returns ONLY ONE IMAGE (the first supported image found).
 * When exporting jobs to PDF, only one image per job will be displayed, not all images.
 * This is by design to keep PDF file sizes manageable and maintain consistent layout.
 */
```

## 🔧 Technical Details

### URL Resolution Priority

1. **Data URLs**: Used directly without modification
2. **Absolute URLs with Internal Hosts**: Converted to production domain
   - `http://backend:8000/media/...` → `https://pcms.live/media/...`
   - `http://localhost:8000/media/...` → `https://pcms.live/media/...`
3. **Production URLs with HTTP**: Forced to HTTPS
   - `http://pcms.live/media/...` → `https://pcms.live/media/...`
4. **Relative URLs**: Normalized and prefixed with base URL
   - `media/images/photo.jpg` → `https://pcms.live/media/images/photo.jpg`
   - `/media/images/photo.jpg` → `https://pcms.live/media/images/photo.jpg`

### Image Selection Priority

1. First JPEG URL from `job.images[0].jpeg_url`
2. First image URL from `job.images[0].image_url` or `job.images[0].url`
3. First URL from `job.image_urls[0]`
4. Returns `null` if no supported images found

### Production Environment Detection

**Client-side (Browser)**:
```typescript
const hostname = window.location?.hostname;
const isProduction = hostname?.endsWith('pcms.live');
```

**Server-side (SSR)**:
```typescript
if (process.env.NODE_ENV === 'production') {
  return 'https://pcms.live';
}
```

## 📋 Testing the Fix

### 1. Verify in Browser Console

When generating a PDF in production, you should see:

```
[PDF Media Base URL] Client-side detection: {hostname: "pcms.live", isProduction: true, ...}
[PDF Media Base URL] Production hostname detected, using https://pcms.live
[PDF Image Utils] Processing job: {job_id: 123, has_images: true, ...}
[PDF Image Utils] Found jpeg_url: /media/maintenance_job_images/photo.jpg
[PDF Image URL] ✅ Resolved relative URL to: https://pcms.live/media/maintenance_job_images/photo.jpg
[PDF Image Utils] ✅ Selected FIRST image URL (only one per job): https://pcms.live/media/...
[JobsPDF Image] Using FIRST image for job 123: https://pcms.live/media/...
```

### 2. Check Network Tab

- Image requests should go to `https://pcms.live/media/...`
- Status should be `200 OK`
- Response should include CORS headers:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, OPTIONS`

### 3. Verify PDF Output

- PDF should contain job images (not "No Image" placeholders)
- Each job should show exactly ONE image
- Images should load without CORS errors

## 🐛 Troubleshooting

### Issue: Images Still Not Showing

**Possible Causes & Solutions:**

1. **CORS Headers Missing**
   - Check nginx configuration at `/media/` location
   - Verify CORS headers are present in Network tab
   - See `NGINX_MEDIA_CORS_FIX.md` for details

2. **Environment Variables Not Set**
   ```bash
   # Verify in production container
   docker exec frontend env | grep NODE_ENV
   # Should show: NODE_ENV=production
   ```

3. **Job Data Has No Images**
   - Check console for "No supported image found" warnings
   - Verify job data structure in browser DevTools
   - Ensure jobs have `images` or `image_urls` arrays

4. **Wrong Image Format**
   - Only JPG, JPEG, PNG, GIF are supported
   - WebP and SVG are NOT supported by @react-pdf/renderer
   - Check console logs for format validation messages

### Issue: Wrong URLs Generated

**Possible Causes & Solutions:**

1. **Hostname Not Detected Correctly**
   - Check console for: `[PDF Media Base URL] Client-side detection: {...}`
   - Verify `hostname` shows "pcms.live"
   - If not, check browser location or DNS settings

2. **Using HTTP Instead of HTTPS**
   - The fix automatically forces HTTPS for pcms.live
   - Check console for: `[PDF Image URL] ✅ Forced HTTPS for production`

3. **Internal Docker URLs Not Converted**
   - The fix automatically converts backend:8000 to pcms.live
   - Check console for: `[PDF Image URL] ✅ Converted internal URL to:`

## 📊 Benefits of This Fix

1. ✅ **Single Source of Truth**: All PDF components use the same URL resolution logic
2. ✅ **Consistent Production Detection**: Reliable environment detection across SSR and client-side
3. ✅ **Easier Maintenance**: Bug fixes only need to be applied in one place
4. ✅ **Better Logging**: Comprehensive debugging information for troubleshooting
5. ✅ **Production Ready**: Proper handling of all edge cases (Docker URLs, protocols, etc.)

## 📁 Files Modified

1. **`/frontend/Lastnext/app/components/document/JobsPDFGenerator.tsx`**
   - ✅ Added import for `getProductionImageUrl` from `pdfImageUtils`
   - ✅ Removed duplicate `getMediaBaseUrl()` function
   - ✅ Removed duplicate `toAbsolutePdfImageUrl()` function
   - ✅ Removed duplicate `pickSupportedImageUrlFromJob()` function
   - ✅ Updated to use unified `getSupportedImageFromJob()` directly
   - ✅ Improved console logging for better debugging

2. **`/frontend/Lastnext/app/lib/utils/pdfImageUtils.ts`**
   - ℹ️ No changes needed (already contains comprehensive implementation)

## 🔗 Related Documentation

- `JOBSPDF_IMAGE_DEBUG.md` - Comprehensive debugging guide
- `PRODUCTION_IMAGE_FIX.md` - Previous image URL resolution fixes
- `NGINX_MEDIA_CORS_FIX.md` - CORS configuration for media files
- `PDF_SINGLE_IMAGE_BEHAVIOR.md` - Explanation of single image per job design

## 🎯 Summary

This fix consolidates all PDF image URL resolution logic into a single unified implementation in `pdfImageUtils.ts`, eliminating the duplicate functions in `JobsPDFGenerator.tsx`. This ensures consistent behavior between development and production, makes the codebase easier to maintain, and provides comprehensive debugging capabilities.

The fix addresses the root cause of images not showing in production by ensuring that:
1. All PDF components use the same production environment detection logic
2. URLs are consistently resolved using a single authoritative implementation
3. Edge cases (Docker URLs, HTTP/HTTPS, relative paths) are handled uniformly
4. Comprehensive logging helps diagnose any remaining issues

## ✅ Deployment Checklist

- [x] Updated `JobsPDFGenerator.tsx` to use unified functions
- [x] Removed duplicate URL resolution code
- [x] Verified CORS headers in nginx configuration (already present)
- [ ] Deploy updated code to production
- [ ] Test PDF generation with multiple jobs
- [ ] Verify console logs show correct production URLs
- [ ] Confirm images appear in generated PDFs
- [ ] Check for any CORS or network errors
