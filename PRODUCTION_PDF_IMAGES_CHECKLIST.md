# 🎯 Production PDF Images - Debugging Checklist

Use this checklist to systematically debug and fix the jobs PDF image export issue in production.

## 📋 Pre-Deployment Checklist

- [ ] **Code changes reviewed**
  - [ ] JobsPDFGenerator.tsx has enhanced logging
  - [ ] pdfImageUtils.ts has enhanced logging
  - [ ] No TypeScript/linter errors

- [ ] **Build and deploy**
  - [ ] Frontend code built successfully (`npm run build`)
  - [ ] Docker containers restarted
  - [ ] Production site is accessible (https://pcms.live)

## 🔍 Step 1: Environment Verification

- [ ] **Open production site**
  - [ ] Navigate to https://pcms.live
  - [ ] Open Developer Tools (F12)
  - [ ] Switch to Console tab
  - [ ] Clear console (Ctrl+L or Cmd+K)

- [ ] **Verify environment variables**
  - [ ] Run: `console.log(window.location.hostname)` - Should show: `pcms.live`
  - [ ] Run: `console.log(process.env.NODE_ENV)` - Should show: `production` or `undefined`
  - [ ] Note results: _______________________

## 🧪 Step 2: Test PDF Export

- [ ] **Select test job**
  - [ ] Find a job you KNOW has images
  - [ ] Note the Job ID: _______________________
  - [ ] Verify images exist in job details page

- [ ] **Export PDF**
  - [ ] Click Export PDF button
  - [ ] PDF generation starts
  - [ ] Check console for logs

## 📊 Step 3: Analyze Console Logs

### Base URL Detection
- [ ] **Look for**: `[PDF Media Base URL]` logs
  - [ ] Message shows: `Client-side detection`
  - [ ] `hostname` value: _______________________
  - [ ] `isProduction` value: _______________________
  - [ ] Final base URL: _______________________ (should be `https://pcms.live`)

### Job Image Data
- [ ] **Look for**: `[PDF Image Utils] Processing job` logs
  - [ ] `has_images`: _______________________ (should be `true`)
  - [ ] `images_length`: _______________________ (should be > 0)
  - [ ] `has_image_urls`: _______________________
  - [ ] `image_urls_length`: _______________________

### Image Candidates
- [ ] **Look for**: `Found jpeg_url` or `Found image_url` logs
  - [ ] Number of candidates found: _______________________
  - [ ] Example URL found: _______________________

### URL Resolution
- [ ] **Look for**: `[PDF Image URL]` logs
  - [ ] Input URL: _______________________
  - [ ] Resolved URL: _______________________
  - [ ] Should start with: `https://pcms.live`

### Final Selection
- [ ] **Look for success message**: `✅ Selected image URL`
  - [ ] Selected URL: _______________________
- [ ] **OR look for failure**: `❌ No supported image format found`
  - [ ] Note which job failed: _______________________

## 🔴 Step 4: Check for Errors

### Console Errors
- [ ] **Red error messages**
  - [ ] CORS errors? Yes / No
  - [ ] Network errors? Yes / No
  - [ ] JavaScript errors? Yes / No
  - [ ] Error details: _______________________

### Network Tab Errors
- [ ] **Switch to Network tab**
  - [ ] Filter by: `media`
  - [ ] Look for failed requests (red/4xx/5xx)
  - [ ] Failed URL: _______________________
  - [ ] Status code: _______________________

### CORS Specific
- [ ] **If CORS error present**
  - [ ] Error message: _______________________
  - [ ] Image URL being blocked: _______________________
  - [ ] Origin: _______________________

## 🔧 Step 5: Apply Fixes

Based on findings, apply appropriate fix:

### Fix A: CORS Configuration
- [ ] **If CORS errors detected**
  - [ ] Locate nginx config file
  - [ ] Add CORS headers to `/media/` location
  - [ ] Test preflight with: `curl -X OPTIONS https://pcms.live/media/test.jpg`
  - [ ] Reload nginx: `docker exec nginx nginx -s reload`
  - [ ] Re-test PDF export

### Fix B: No Image Data
- [ ] **If `has_images: false`**
  - [ ] Check API endpoint: `curl https://pcms.live/api/jobs/{job_id}/`
  - [ ] Verify response includes `images` array
  - [ ] Check backend serializer includes image data
  - [ ] Re-test after backend fix

### Fix C: Wrong Base URL
- [ ] **If base URL is not `https://pcms.live`**
  - [ ] Check environment variables in Docker
  - [ ] Set `NODE_ENV=production`
  - [ ] Set `NEXT_PUBLIC_MEDIA_URL=https://pcms.live`
  - [ ] Rebuild and restart containers
  - [ ] Re-test PDF export

### Fix D: 404 Not Found
- [ ] **If images return 404**
  - [ ] Check media files exist: `docker exec nginx ls /usr/share/nginx/html/media/`
  - [ ] Verify Docker volume mounting
  - [ ] Check media path in backend settings
  - [ ] Ensure files uploaded correctly
  - [ ] Re-test after fixing file location

### Fix E: Image Format Issues
- [ ] **If "No supported image format found"**
  - [ ] Check image file extensions (should be .jpg, .jpeg, .png, or .gif)
  - [ ] Convert WebP images to JPG if needed
  - [ ] Ensure image URLs have proper extensions
  - [ ] Re-test with supported format

## ✅ Step 6: Verify Fix

- [ ] **Export PDF again**
  - [ ] Clear browser cache (Ctrl+Shift+Delete)
  - [ ] Clear console
  - [ ] Export PDF
  - [ ] PDF opens successfully

- [ ] **Check PDF content**
  - [ ] PDF contains images (not "No Image" placeholders)
  - [ ] Images are visible and not corrupted
  - [ ] Multiple jobs with images all work
  - [ ] No console errors remain

- [ ] **Test multiple scenarios**
  - [ ] Export PDF with 1 job with images
  - [ ] Export PDF with multiple jobs with images
  - [ ] Export PDF with mix of jobs (with/without images)
  - [ ] All scenarios work correctly

## 📝 Step 7: Document Solution

- [ ] **Record what fixed it**
  - [ ] Issue identified: _______________________
  - [ ] Fix applied: _______________________
  - [ ] Files modified: _______________________
  - [ ] Commands run: _______________________

- [ ] **Update documentation**
  - [ ] Add notes to project README if needed
  - [ ] Create follow-up documentation
  - [ ] Share solution with team

## 🧹 Step 8: Cleanup (Optional)

After confirming fix works:

- [ ] **Reduce verbose logging** (if desired)
  - [ ] Remove or comment out console.log statements
  - [ ] Keep critical error logging
  - [ ] Rebuild and deploy

- [ ] **Add monitoring**
  - [ ] Set up error tracking for PDF generation
  - [ ] Add alerts for CORS failures
  - [ ] Monitor media file accessibility

## 📊 Results Summary

**Issue Identified:**
_____________________________________________

**Root Cause:**
_____________________________________________

**Fix Applied:**
_____________________________________________

**Time to Resolve:**
_____________________________________________

**Additional Notes:**
_____________________________________________

## 🎓 Lessons Learned

What can prevent this in the future?
_____________________________________________
_____________________________________________
_____________________________________________

What monitoring would help?
_____________________________________________
_____________________________________________
_____________________________________________

## 🔗 Reference Documents

- ✅ `QUICK_START_DEBUG_GUIDE.md` - Quick start guide
- ✅ `JOBSPDF_IMAGE_DEBUG.md` - Comprehensive debugging
- ✅ `TEST_PDF_IMAGES.md` - Test scripts
- ✅ `DEBUGGING_CHANGES_SUMMARY.md` - Changes details
- ✅ `PRODUCTION_IMAGE_FIX.md` - Previous fixes
- ✅ `NGINX_MEDIA_CORS_FIX.md` - CORS configuration

---

**Date Started:** _____________
**Date Completed:** _____________
**Debugged By:** _____________
