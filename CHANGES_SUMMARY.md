# Changes Summary - Image JPEG Path Fix

## Issue Fixed
**Problem**: PDF export was failing with "Not valid image extension" errors and 403 Forbidden errors when trying to load images. The URLs contained unprocessed Django template placeholders like `%Y/%m/`.

**Example Error URLs**:
```
GET https://pcms.live/media/maintenance_job_images/%Y/%m//IMG_4743.jpg 403 (Forbidden)
```

## Root Cause
The `save()` methods in `JobImage` and `PreventiveMaintenance` models were using Django's raw `upload_to` template string (`'maintenance_job_images/%Y/%m/'`) instead of the actual processed directory path from the uploaded file.

## Files Changed

### 1. `/workspace/backend/myLubd/src/myappLubd/models.py`

#### Change 1: JobImage.save() method (lines 571-594)
**Before**:
```python
jpeg_path = f'{self.image.field.upload_to}/{jpeg_name}'
# Produced: maintenance_job_images/%Y/%m//IMG_4743.jpg
```

**After**:
```python
image_path = Path(self.image.name)
jpeg_path = str(image_path.parent / jpeg_name)
# Produces: maintenance_job_images/2025/10/IMG_4743.jpg
```

#### Change 2: PreventiveMaintenance.save() - before_image (lines 263-287)
**Before**:
```python
jpeg_path = f'maintenance_pm_images/{processed_images["jpeg_name"]}'
# Produced: maintenance_pm_images/randomname.jpg
```

**After**:
```python
image_path = Path(self.before_image.name)
jpeg_name = f'{image_path.stem}.jpg'
jpeg_path = str(image_path.parent / jpeg_name)
# Produces: maintenance_pm_images/2025/10/before_image.jpg
```

#### Change 3: PreventiveMaintenance.save() - after_image (lines 289-313)
Same fix as Change 2, but for `after_image` field.

### 2. `/workspace/backend/myLubd/src/myappLubd/management/commands/fix_jpeg_paths.py` (NEW FILE)
Django management command to fix existing database records with incorrect paths.

**Usage**:
```bash
# Preview changes
python manage.py fix_jpeg_paths --dry-run

# Apply fixes
python manage.py fix_jpeg_paths
```

**What it does**:
- Scans `JobImage` table for records with `jpeg_path` containing `%Y/%m` or null
- Scans `PreventiveMaintenance` table for records with `before_image_jpeg_path` or `after_image_jpeg_path` containing `%Y/%m` or null
- Reconstructs correct paths from the actual image file paths
- Updates database records
- Reports which JPEG files exist vs. need regeneration

## Testing Performed

### Unit Test
Created and ran test script to verify path generation logic:
- ✓ Verified paths no longer contain `%Y/%m` placeholders
- ✓ Verified paths include proper date directories (e.g., `2025/09/`)
- ✓ Verified JPEG extension is correctly applied

### Test Results
```
Input:  maintenance_job_images/2025/09/IMG_4743.jpeg
Output: maintenance_job_images/2025/09/IMG_4743.jpg
✓ Correct format (no %Y/%m)
```

## Deployment Requirements

1. **No database migrations needed** - Only code changes and data cleanup
2. **No downtime required** - Can be deployed during normal operation
3. **Management command must be run** after deployment to fix existing records

## Quick Deployment Steps

```bash
# 1. Deploy code changes
git pull origin main

# 2. Restart application
sudo systemctl restart your-django-app

# 3. Fix existing database records
python manage.py fix_jpeg_paths --dry-run  # Preview
python manage.py fix_jpeg_paths            # Apply

# 4. Verify PDF export works
```

## Impact Assessment

### Affected Components
- **Backend Models**: `JobImage`, `PreventiveMaintenance`
- **Database Tables**: `myapplubd_jobimage`, `myapplubd_preventivemaintenance`
- **PDF Export**: All PDF generation that includes images

### Not Affected
- Image upload functionality (still works)
- Image display in UI (uses original image, not JPEG)
- Existing image files on disk (no changes needed)

### Risk Level: **LOW**
- Changes are isolated to image processing logic
- No database schema changes
- Backward compatible with existing data
- Management command can be run multiple times safely

## Verification Checklist

After deployment, verify:

- [ ] New image uploads get correct `jpeg_path` values (without `%Y/%m`)
- [ ] Database query returns 0 records with `%Y/%m` in paths:
  ```sql
  SELECT COUNT(*) FROM myapplubd_jobimage WHERE jpeg_path LIKE '%Y%m%';
  ```
- [ ] PDF export works without errors
- [ ] Browser console shows no "Not valid image extension" warnings
- [ ] No 403 Forbidden errors for image URLs
- [ ] Application logs show no image-related errors

## Documentation

- **Technical Details**: See `/workspace/IMAGE_PATH_FIX_README.md`
- **Deployment Guide**: See `/workspace/DEPLOYMENT_STEPS.md`
- **Management Command**: See `/workspace/backend/myLubd/src/myappLubd/management/commands/fix_jpeg_paths.py`

## Related Issues

- Frontend error: "Not valid image extension"
- HTTP 403 errors: `GET .../media/maintenance_job_images/%Y/%m//IMG_*.jpg`
- PDF export failures when jobs contain images

## Credits

- **Issue Identified**: Browser console errors during PDF export
- **Root Cause Analysis**: Django `upload_to` template vs. processed path confusion
- **Fix Implemented**: Extract directory from actual uploaded file path
- **Testing**: Path generation logic verified

---

**Status**: ✅ Ready for Deployment  
**Priority**: High (affects PDF export functionality)  
**Effort**: Low (code changes only, no migrations)
