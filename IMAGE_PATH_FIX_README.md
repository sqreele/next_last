# Image Path Fix Documentation

## Problem Description

The application was experiencing errors when exporting PDFs with images:

1. **Error**: "Not valid image extension"
2. **Error**: `GET https://pcms.live/media/maintenance_job_images/%Y/%m//IMG_4743.jpg 403 (Forbidden)`

### Root Cause

The issue was in the `save()` method of both `JobImage` and `PreventiveMaintenance` models. When generating JPEG versions of uploaded images for PDF compatibility, the code was using the raw template string from Django's `upload_to` parameter (`'maintenance_job_images/%Y/%m/'`) instead of the actual processed directory path.

**In JobImage model (line 580):**
```python
# BEFORE (INCORRECT)
jpeg_path = f'{self.image.field.upload_to}/{jpeg_name}'
# This would produce: maintenance_job_images/%Y/%m//IMG_4743.jpg
```

**In PreventiveMaintenance model (lines 268, 291):**
```python
# BEFORE (INCORRECT)
jpeg_path = f'maintenance_pm_images/{processed_images["jpeg_name"]}'
# This would produce: maintenance_pm_images/randomname.jpg (missing date directories)
```

### Why This Happened

Django's `ImageField.upload_to` parameter accepts a strftime format string (e.g., `'%Y/%m/'`) that gets processed during file upload to create date-based directories. However, when accessed as `self.image.field.upload_to`, it returns the **raw template string**, not the processed path.

## Solution

### Code Changes

#### 1. Fixed JobImage.save() method
**File**: `/workspace/backend/myLubd/src/myappLubd/models.py` (lines 571-594)

```python
# AFTER (CORRECT)
# Extract the directory from the actual image path (which has date directories)
image_path = Path(self.image.name)
base_name = image_path.stem
jpeg_name = f'{base_name}.jpg'

# Use the directory from the actual uploaded image path, not the template
jpeg_path = str(image_path.parent / jpeg_name)
# This produces: maintenance_job_images/2025/09/IMG_4743.jpg
```

#### 2. Fixed PreventiveMaintenance.save() method
**File**: `/workspace/backend/myLubd/src/myappLubd/models.py` (lines 263-313)

```python
# AFTER (CORRECT) - for both before_image and after_image
image_path = Path(self.before_image.name)  # or self.after_image.name
jpeg_name = f'{image_path.stem}.jpg'
jpeg_path = str(image_path.parent / jpeg_name)
# This produces: maintenance_pm_images/2025/09/IMG_4743.jpg
```

### Database Cleanup

#### Management Command: fix_jpeg_paths

A Django management command was created to fix existing database records with incorrect paths.

**File**: `/workspace/backend/myLubd/src/myappLubd/management/commands/fix_jpeg_paths.py`

**Usage**:

```bash
# Preview changes without modifying the database
python manage.py fix_jpeg_paths --dry-run

# Apply the fixes
python manage.py fix_jpeg_paths
```

**What it does**:
- Finds all `JobImage` records with `jpeg_path` containing `%Y/%m` or null
- Finds all `PreventiveMaintenance` records with `before_image_jpeg_path` or `after_image_jpeg_path` containing `%Y/%m` or null
- Reconstructs the correct JPEG path from the actual image path
- Updates the database records with correct paths
- Reports which JPEG files exist on disk vs. need regeneration

## Testing

### How to Test the Fix

1. **Test new image uploads**:
   ```bash
   # Upload a new image via the API or admin interface
   # Check that the jpeg_path is correctly set without %Y/%m placeholders
   ```

2. **Test existing data**:
   ```bash
   # Run the management command in dry-run mode first
   python manage.py fix_jpeg_paths --dry-run
   
   # Review the output, then apply the fix
   python manage.py fix_jpeg_paths
   ```

3. **Test PDF export**:
   - Try exporting a job or maintenance record to PDF
   - Verify images load correctly without 403 errors
   - Check browser console for absence of "Not valid image extension" errors

### Expected Results

After applying the fixes:
- New image uploads will have correct `jpeg_path` values like `maintenance_job_images/2025/10/IMG_4743.jpg`
- Existing database records will be updated to use correct paths
- PDF exports will work without image loading errors
- No more 403 Forbidden errors when accessing JPEG versions of images

## Additional Notes

### Image Processing Flow

1. User uploads an image (e.g., `IMG_4743.jpeg`)
2. Django's storage system processes the `upload_to` template and saves to `maintenance_job_images/2025/10/IMG_4743.jpeg`
3. The model's `save()` method:
   - Reads `self.image.name` which contains the processed path
   - Extracts directory using `Path(self.image.name).parent`
   - Creates JPEG version with same filename but `.jpg` extension
   - Saves JPEG to the same directory as original image
   - Stores the correct path in `jpeg_path` field

### File Extensions

The JPEG path should always end with `.jpg`, while the original image can be:
- `.jpg` / `.jpeg`
- `.png`
- `.gif`
- `.webp` (for older records)

### Directory Structure

```
media/
├── maintenance_job_images/
│   └── 2025/
│       ├── 09/
│       │   ├── IMG_4743.jpeg    (original upload)
│       │   └── IMG_4743.jpg     (JPEG version for PDF)
│       └── 10/
│           └── IMG_4744.png
└── maintenance_pm_images/
    └── 2025/
        └── 09/
            ├── before_image.jpeg
            └── before_image.jpg
```

## Rollback Plan

If issues arise, you can:

1. **Revert code changes**: Use git to revert the changes to `models.py`
2. **Restore database**: The old `jpeg_path` values are shown in the management command output for reference
3. **Regenerate JPEGs**: Use the existing `backfill_jpeg_images.py` command to regenerate JPEG files

## Prevention

To prevent similar issues in the future:
- Always use `self.image.name` (the actual saved path) rather than `self.image.field.upload_to` (the template)
- Test file upload paths in development before deploying
- Add unit tests for image processing methods
- Monitor server logs for 403 errors on media URLs

## Related Files

- `/workspace/backend/myLubd/src/myappLubd/models.py` - Fixed `JobImage` and `PreventiveMaintenance` models
- `/workspace/backend/myLubd/src/myappLubd/management/commands/fix_jpeg_paths.py` - Database cleanup command
- `/workspace/backend/myLubd/src/myappLubd/serializers.py` - Serializers that expose `jpeg_url` to frontend
- Frontend PDF generation code (searches for images by URL)
