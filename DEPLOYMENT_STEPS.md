# Deployment Steps for Image Path Fix

## Overview
This document outlines the steps to deploy the fix for the image path issue that was causing "Not valid image extension" errors and 403 Forbidden errors when exporting PDFs.

## Changes Made

### 1. Backend Code Changes
**File**: `/workspace/backend/myLubd/src/myappLubd/models.py`

- **JobImage.save()** method (lines 566-602): Fixed JPEG path generation to use actual image directory instead of template string
- **PreventiveMaintenance.save()** method (lines 252-315): Fixed both `before_image` and `after_image` JPEG path generation

### 2. Management Command
**File**: `/workspace/backend/myLubd/src/myappLubd/management/commands/fix_jpeg_paths.py`

- New Django management command to fix existing database records with incorrect paths
- Supports `--dry-run` flag for previewing changes

## Deployment Instructions

### Step 1: Backup Database
```bash
# Create a backup before making changes
pg_dump your_database > backup_before_jpeg_fix_$(date +%Y%m%d).sql
```

### Step 2: Deploy Code Changes
```bash
# Pull the latest code
git pull origin main

# Or if using a branch
git checkout fix/image-jpeg-paths
git pull
```

### Step 3: Restart Application
```bash
# Restart Django application (method depends on your deployment)
# For systemd:
sudo systemctl restart your-django-app

# For Docker:
docker-compose restart backend

# For gunicorn:
sudo systemctl restart gunicorn
```

### Step 4: Preview Database Changes (Recommended)
```bash
# Navigate to Django project directory
cd /workspace/backend/myLubd

# Run in dry-run mode first to see what would change
python manage.py fix_jpeg_paths --dry-run
```

Review the output carefully. You should see:
- Current incorrect paths (containing `%Y/%m`)
- New correct paths (with actual dates like `2025/09/`)
- Whether the JPEG files exist on disk

### Step 5: Apply Database Fixes
```bash
# Apply the fixes to the database
python manage.py fix_jpeg_paths
```

The command will:
- Update all `JobImage` records with incorrect `jpeg_path` values
- Update all `PreventiveMaintenance` records with incorrect `before_image_jpeg_path` values
- Update all `PreventiveMaintenance` records with incorrect `after_image_jpeg_path` values

### Step 6: Verify the Fix

#### Test 1: Check Database Records
```bash
# Connect to your database and verify paths are correct
psql your_database -c "SELECT id, image, jpeg_path FROM myapplubd_jobimage WHERE jpeg_path LIKE '%Y%m%' LIMIT 5;"

# Should return 0 rows
```

#### Test 2: Test New Image Upload
1. Upload a new image through the application
2. Check the database record to verify `jpeg_path` is correct
3. Verify the JPEG file exists on disk

#### Test 3: Test PDF Export
1. Open a job or maintenance record with images
2. Export to PDF
3. Verify:
   - No "Not valid image extension" errors in browser console
   - No 403 Forbidden errors for image URLs
   - Images appear correctly in the exported PDF

## Rollback Instructions

If issues occur, follow these steps:

### 1. Revert Code Changes
```bash
git revert <commit_hash>
git push
```

### 2. Restore Database (if needed)
```bash
# Only if Step 5 was completed and caused issues
psql your_database < backup_before_jpeg_fix_YYYYMMDD.sql
```

### 3. Restart Application
```bash
sudo systemctl restart your-django-app
```

## Expected Results

### Before the Fix
- URLs like: `https://pcms.live/media/maintenance_job_images/%Y/%m//IMG_4743.jpg`
- 403 Forbidden errors
- "Not valid image extension" warnings
- PDF export failures

### After the Fix
- URLs like: `https://pcms.live/media/maintenance_job_images/2025/10/IMG_4743.jpg`
- Images load successfully (200 OK)
- No extension warnings
- PDF export works correctly with embedded images

## Monitoring

After deployment, monitor:

1. **Application Logs**: Look for any errors related to image processing
2. **Browser Console**: Check for 403 errors or "Not valid image extension" warnings
3. **PDF Generation**: Test PDF export functionality across different job/maintenance records
4. **New Uploads**: Verify new image uploads get correct JPEG paths

## Troubleshooting

### Issue: Management Command Shows Missing JPEG Files

**Solution**: Some records may have lost their JPEG files. Run the existing backfill command:
```bash
python manage.py backfill_jpeg_images
```

### Issue: Still Seeing %Y/%m in URLs

**Possible Causes**:
1. Application wasn't restarted after code deployment
2. Management command wasn't run
3. Cached data in browser or CDN

**Solution**:
```bash
# 1. Restart application
sudo systemctl restart your-django-app

# 2. Run management command
python manage.py fix_jpeg_paths

# 3. Clear browser cache or test in incognito mode
```

### Issue: 403 Forbidden Errors Persist

**Possible Causes**:
1. JPEG files don't exist on disk
2. File permissions issue
3. NGINX/Apache configuration issue

**Solution**:
```bash
# 1. Check if JPEG files exist
ls -la /path/to/media/maintenance_job_images/2025/10/

# 2. Fix permissions if needed
chown -R www-data:www-data /path/to/media/

# 3. Regenerate missing JPEGs
python manage.py backfill_jpeg_images
```

## Additional Notes

- The fix only affects the path generation logic; existing JPEG files on disk remain unchanged
- The management command is idempotent - it's safe to run multiple times
- New image uploads after code deployment will automatically get correct paths
- The fix maintains backward compatibility with existing image formats

## Support

For issues or questions during deployment:
1. Check `/workspace/IMAGE_PATH_FIX_README.md` for technical details
2. Review application logs in `/var/log/django/` or equivalent
3. Contact the development team with:
   - Output from `--dry-run` command
   - Sample database records showing the issue
   - Browser console errors (if applicable)
