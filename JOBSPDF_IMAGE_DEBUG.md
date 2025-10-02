# Jobs PDF Image Export Issue - Production Debugging Guide

## 🔍 Problem Summary

Images are not showing in the exported jobs PDF when running in production environment (pcms.live), but they work correctly in development.

## 📋 Investigation Findings

### Existing Solutions (Already Implemented)

Based on documentation review, the following fixes were already implemented:

1. **Unified Image URL Resolution** (`/frontend/Lastnext/app/lib/utils/pdfImageUtils.ts`)
   - Centralized URL resolution for PDF generation
   - Automatic production domain detection
   - Docker internal URL conversion to external URLs
   - Support for multiple image formats (JPG, JPEG, PNG, GIF)

2. **CORS Configuration** (Should be in nginx)
   - According to `NGINX_MEDIA_CORS_FIX.md`, nginx should have proper CORS headers
   - Handles preflight requests for PDF generation
   - Required headers: `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, etc.

### Common Root Causes for Production Image Issues

1. **CORS/Cross-Origin Issues**
   - PDF generation using `@react-pdf/renderer` makes cross-origin requests
   - Missing or incorrect CORS headers on nginx `/media/` endpoint
   - Browser blocks image loading due to CORS policy

2. **Image URL Resolution Problems**
   - Incorrect base URL in production (using localhost instead of pcms.live)
   - HTTP vs HTTPS protocol mismatch
   - Docker internal URLs (backend:8000) not converted to external URLs

3. **Image Format Compatibility**
   - WebP images not supported by `@react-pdf/renderer`
   - Only JPG, JPEG, PNG, and GIF are supported
   - Need to ensure images have proper extensions

4. **Environment Variable Issues**
   - `NEXT_PUBLIC_MEDIA_URL` not set correctly in production
   - `NODE_ENV` not set to 'production'
   - Environment variables not propagated to Docker containers

## 🔧 Debugging Steps Added

### Enhanced Logging Added to Files

#### 1. `/frontend/Lastnext/app/components/document/JobsPDFGenerator.tsx`
Added comprehensive logging to track:
- Job image data structure
- Image URL selection process
- Whether images are found or not

```typescript
console.log(`[PDF Image Debug] Job ${job.job_id}:`, {
  hasUrl: !!url,
  url: url,
  imageData: {
    images: job.images,
    image_urls: job.image_urls,
  }
});
```

#### 2. `/frontend/Lastnext/app/lib/utils/pdfImageUtils.ts`
Added detailed logging for:
- Image candidate collection process
- URL resolution logic
- Production vs development detection
- Image format validation

Key logging points:
- `[PDF Media Base URL]` - Base URL detection
- `[PDF Image URL]` - URL resolution process
- `[PDF Image Utils]` - Image selection logic

### How to Debug in Production

1. **Open Browser Console in Production**
   ```
   Navigate to: https://pcms.live
   Open Developer Tools (F12)
   Go to Console tab
   ```

2. **Export a Jobs PDF**
   - Select jobs with known images
   - Click Export PDF button
   - Watch console for logs

3. **Check for These Log Messages**
   - `[PDF Media Base URL] Client-side detection:` - Should show production hostname
   - `[PDF Image Utils] Processing job:` - Shows job image data structure
   - `[PDF Image URL] Base URL:` - Should be `https://pcms.live`
   - `[PDF Image Utils] ✅ Selected image URL:` - Shows final selected URL

## 🎯 Expected Console Output in Production

### Successful Case:
```
[PDF Media Base URL] Client-side detection: {hostname: "pcms.live", isProduction: true, NODE_ENV: "production"}
[PDF Media Base URL] Production hostname detected, using https://pcms.live
[PDF Image Utils] Processing job: {job_id: 123, has_images: true, images_length: 2, ...}
[PDF Image Utils] Found jpeg_url: /media/maintenance_job_images/image123.jpg
[PDF Image URL] Base URL: https://pcms.live
[PDF Image URL] Input URL: /media/maintenance_job_images/image123.jpg
[PDF Image URL] ✅ Resolved relative URL to: https://pcms.live/media/maintenance_job_images/image123.jpg
[PDF Image Utils] ✅ Selected image URL: https://pcms.live/media/maintenance_job_images/image123.jpg
[PDF Image] Using URL for job 123: https://pcms.live/media/maintenance_job_images/image123.jpg
```

### Problem Cases:

#### Case 1: Wrong Base URL
```
[PDF Media Base URL] Client-side detection: {hostname: "pcms.live", isProduction: false, ...}
[PDF Media Base URL] Unknown hostname, defaulting to https://pcms.live
```
**Solution**: Check hostname detection logic

#### Case 2: No Images Found
```
[PDF Image Utils] Processing job: {job_id: 123, has_images: false, images_length: 0, ...}
[PDF Image Utils] Total candidates found: 0
[PDF Image Utils] ❌ No supported image format found for job 123
```
**Solution**: Check job data structure from API

#### Case 3: CORS Error
```
Access to image at 'https://pcms.live/media/...' from origin 'https://pcms.live' has been blocked by CORS policy
```
**Solution**: Check nginx CORS configuration

#### Case 4: 404 Not Found
```
GET https://pcms.live/media/maintenance_job_images/image123.jpg 404 (Not Found)
```
**Solution**: Check if image file exists on server and media volume is mounted

## 🔍 Diagnostic Checklist

Use this checklist to diagnose the issue:

- [ ] **Check Console Logs**: Look for `[PDF Media Base URL]` and `[PDF Image Utils]` messages
- [ ] **Verify Base URL**: Should be `https://pcms.live` in production
- [ ] **Check Job Data**: Verify jobs have `images` or `image_urls` arrays
- [ ] **Test Image URLs**: Try opening image URLs directly in browser
- [ ] **Check CORS**: Look for CORS errors in Network tab
- [ ] **Verify Image Format**: Ensure images are JPG, JPEG, PNG, or GIF (not WebP)
- [ ] **Check Environment Variables**: Verify `NODE_ENV` and `NEXT_PUBLIC_MEDIA_URL`
- [ ] **Test Network Request**: Check Network tab for failed image requests

## 🔧 Potential Fixes

Based on debugging output, apply appropriate fix:

### Fix 1: CORS Configuration (Most Likely)
If you see CORS errors, verify nginx configuration at `/media/` location:

```nginx
location /media/ {
    alias /usr/share/nginx/html/media/;
    
    # CORS headers for PDF generation
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization" always;
    add_header Access-Control-Max-Age 86400 always;
    
    # Handle preflight requests
    if ($request_method = 'OPTIONS') {
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization" always;
        return 204;
    }
}
```

### Fix 2: Environment Variables
Verify in Docker production environment:

```bash
# Check if environment variables are set
docker exec frontend env | grep -E '(NODE_ENV|NEXT_PUBLIC_MEDIA_URL)'

# Should show:
# NODE_ENV=production
# NEXT_PUBLIC_MEDIA_URL=https://pcms.live
```

### Fix 3: Image Data Structure
If no images found in job data, check API response:

```bash
# Test API endpoint
curl -H "Authorization: Bearer <token>" https://pcms.live/api/jobs/<job_id>/ | jq '.images'
```

### Fix 4: Media Files Accessibility
Check if media files exist and are accessible:

```bash
# Check if media directory is mounted
docker exec nginx ls -la /usr/share/nginx/html/media/maintenance_job_images/

# Test image accessibility
curl -I https://pcms.live/media/maintenance_job_images/<image_name>.jpg
```

## 📝 Next Steps

1. **Deploy the Enhanced Logging**
   - Build and deploy the updated code to production
   - Restart containers if needed

2. **Generate PDF in Production**
   - Open browser console
   - Export a jobs PDF with known images
   - Capture all console logs

3. **Analyze Logs**
   - Review the console output
   - Identify which stage is failing
   - Apply appropriate fix from the list above

4. **Verify Fix**
   - After applying fix, test PDF generation again
   - Verify images appear correctly in PDF
   - Check for any remaining console errors

## 📚 Related Documentation

- `PRODUCTION_IMAGE_FIX.md` - Previous image URL resolution fixes
- `NGINX_MEDIA_CORS_FIX.md` - CORS configuration guide
- `/frontend/Lastnext/app/lib/utils/pdfImageUtils.ts` - Image utility functions
- `/frontend/Lastnext/app/components/document/JobsPDFGenerator.tsx` - PDF generator component

## 🆘 If Issue Persists

If images still don't show after debugging:

1. Share the complete console log output
2. Provide a sample job ID that should have images
3. Check Network tab for specific failed requests
4. Verify nginx error logs: `docker logs nginx`
5. Check backend logs for media file serving issues

## ✅ Expected Result

After proper configuration:
- ✅ Images load in PDF without CORS errors
- ✅ Console shows successful URL resolution
- ✅ Network tab shows successful image requests (200 OK)
- ✅ PDF contains actual images, not "No Image" placeholders
