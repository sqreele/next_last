# 🚀 Quick Start Guide: Debug Jobs PDF Images in Production

## ⚡ TL;DR - What Was Done

Enhanced logging was added to help diagnose why images aren't showing in exported job PDFs in production. You can now see exactly what's happening at each step of image URL resolution and loading.

## 🎯 Files Modified

1. ✅ `/frontend/Lastnext/app/components/document/JobsPDFGenerator.tsx` - Added image debugging logs
2. ✅ `/frontend/Lastnext/app/lib/utils/pdfImageUtils.ts` - Enhanced URL resolution logging

## 📝 Documentation Added

1. ✅ `JOBSPDF_IMAGE_DEBUG.md` - Comprehensive debugging guide
2. ✅ `TEST_PDF_IMAGES.md` - Quick test scripts for browser console
3. ✅ `DEBUGGING_CHANGES_SUMMARY.md` - Detailed changes summary
4. ✅ `QUICK_START_DEBUG_GUIDE.md` - This file

## 🔥 Immediate Action Required

### 1. Deploy the Changes
```bash
cd /workspace/frontend/Lastnext
npm run build
# Or if using Docker:
docker-compose up -d --build frontend
```

### 2. Open Production Console
- Go to: **https://pcms.live**
- Press **F12** (Developer Tools)
- Click **Console** tab
- Clear console (Ctrl+L)

### 3. Export a Jobs PDF
- Select jobs with images
- Click Export PDF button
- **Watch the console output**

## 🔍 What to Look For

### ✅ GOOD - Working Correctly
```
[PDF Media Base URL] Production hostname detected, using https://pcms.live
[PDF Image Utils] Processing job: {job_id: 123, has_images: true, images_length: 2}
[PDF Image Utils] ✅ Selected image URL: https://pcms.live/media/maintenance_job_images/abc.jpg
[PDF Image] Using URL for job 123: https://pcms.live/media/...
```

### ❌ BAD - Issue Detected

#### Problem 1: No Images in Job Data
```
[PDF Image Utils] Processing job: {job_id: 123, has_images: false, images_length: 0}
[PDF Image Utils] ❌ No supported image format found for job 123
```
**Fix**: Check API endpoint - jobs aren't returning image data

#### Problem 2: Wrong Base URL
```
[PDF Media Base URL] Unknown hostname, defaulting to https://pcms.live
[PDF Image URL] Base URL: http://localhost:8000  ← WRONG!
```
**Fix**: Environment variable issue or hostname detection failing

#### Problem 3: CORS Error (in Network tab)
```
Access to image at 'https://pcms.live/media/...' has been blocked by CORS policy
```
**Fix**: Nginx CORS configuration needed - see `NGINX_MEDIA_CORS_FIX.md`

#### Problem 4: 404 Not Found
```
GET https://pcms.live/media/maintenance_job_images/abc.jpg 404 (Not Found)
```
**Fix**: Media files missing or volume not mounted

## 🔧 Quick Fixes

### Fix CORS (Most Common Issue)

Edit nginx configuration:
```nginx
location /media/ {
    alias /usr/share/nginx/html/media/;
    
    # Add these CORS headers
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept" always;
    
    # Handle OPTIONS requests
    if ($request_method = 'OPTIONS') {
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        return 204;
    }
}
```

Then reload nginx:
```bash
docker exec nginx nginx -s reload
```

### Fix Environment Variables

Check and set if missing:
```bash
# In your .env or docker-compose.yml
NODE_ENV=production
NEXT_PUBLIC_MEDIA_URL=https://pcms.live
```

### Fix Missing Media Files

Check if files exist:
```bash
docker exec nginx ls -la /usr/share/nginx/html/media/maintenance_job_images/
```

If empty, check Docker volume mounting in `docker-compose.yml`.

## 📞 What to Report

When asking for help, provide:

1. **Console logs** - Copy all `[PDF ...]` messages
2. **Network tab** - Screenshot of failed image requests
3. **Job ID** - A specific job that should have images
4. **Environment** - Are you on https://pcms.live?

Example report:
```
Environment: https://pcms.live
Job ID: 12345 (should have 2 images)

Console logs:
[PDF Media Base URL] ...
[PDF Image Utils] ...

Network errors:
GET .../media/abc.jpg - 404 Not Found
```

## 🎓 Learn More

- **Full debugging guide**: Read `JOBSPDF_IMAGE_DEBUG.md`
- **Test scripts**: Use `TEST_PDF_IMAGES.md` for manual testing
- **Previous fixes**: Check `PRODUCTION_IMAGE_FIX.md` and `NGINX_MEDIA_CORS_FIX.md`

## ✨ After Fixing

Once images work correctly:

1. ✅ Test PDF export with multiple jobs
2. ✅ Verify images load in the PDF
3. ✅ Check no console errors remain
4. ✅ Document what fixed it (for future reference)

Optional: Remove verbose logging if desired (the console.log statements can be removed once debugging is complete).

## 🚨 Emergency Rollback

If the changes cause problems:
```bash
git checkout HEAD -- frontend/Lastnext/app/components/document/JobsPDFGenerator.tsx
git checkout HEAD -- frontend/Lastnext/app/lib/utils/pdfImageUtils.ts
npm run build
docker-compose restart frontend
```

---

**Questions?** Check the other documentation files or open an issue with the console logs.
