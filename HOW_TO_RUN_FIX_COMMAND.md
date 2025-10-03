# How to Run the fix_jpeg_paths Management Command

## Quick Answer

```bash
# Navigate to your Django project directory
cd /workspace/backend/myLubd

# Preview changes (safe, doesn't modify database)
python manage.py fix_jpeg_paths --dry-run

# Apply the fixes
python manage.py fix_jpeg_paths
```

## Detailed Instructions

### Step 1: Navigate to Django Project Directory

The management command needs to be run from the directory containing `manage.py`:

```bash
cd /workspace/backend/myLubd
```

You should see `manage.py` file in this directory:
```bash
ls manage.py
# Output: manage.py
```

### Step 2: Check Python Version

Make sure you're using Python 3:

```bash
python --version
# OR
python3 --version
```

If `python` doesn't work, use `python3` instead in all commands below.

### Step 3: Preview Changes First (Recommended)

**Always run with `--dry-run` first** to see what will change:

```bash
python manage.py fix_jpeg_paths --dry-run
```

**Expected Output:**
```
DRY RUN MODE - No changes will be made
Fixing JobImage records...
  Job J25ABC123 - Image: maintenance_job_images/2025/09/IMG_4743.jpeg
    Old JPEG path: maintenance_job_images/%Y/%m//IMG_4743.jpg
    New JPEG path: maintenance_job_images/2025/09/IMG_4743.jpg
    JPEG exists: True
  Job J25DEF456 - Image: maintenance_job_images/2025/09/IMG_4740.jpeg
    Old JPEG path: maintenance_job_images/%Y/%m//IMG_4740.jpg
    New JPEG path: maintenance_job_images/2025/09/IMG_4740.jpg
    JPEG exists: True
...
JobImage: Would fix 150 records
PreventiveMaintenance before_image: Would fix 25 records
PreventiveMaintenance after_image: Would fix 30 records

DRY RUN COMPLETE - Would fix 205 records in total
```

### Step 4: Review the Output

Check the output carefully:
- ✅ **Old JPEG path** should contain `%Y/%m` (the bug)
- ✅ **New JPEG path** should have real dates like `2025/09`
- ✅ **JPEG exists** shows if the file is on disk (True is good)

### Step 5: Apply the Fixes

If the dry-run looks good, run it for real:

```bash
python manage.py fix_jpeg_paths
```

**Expected Output:**
```
Fixing JobImage records...
  Job J25ABC123 - Image: maintenance_job_images/2025/09/IMG_4743.jpeg
    Old JPEG path: maintenance_job_images/%Y/%m//IMG_4743.jpg
    New JPEG path: maintenance_job_images/2025/09/IMG_4743.jpg
    JPEG exists: True
...
JobImage: Fixed 150 records
PreventiveMaintenance before_image: Fixed 25 records
PreventiveMaintenance after_image: Fixed 30 records

SUCCESS - Fixed 205 records in total
```

## Common Scenarios

### Scenario 1: Using Docker

If your Django app runs in Docker:

```bash
# Find your container name
docker ps

# Run command inside container
docker exec -it <container_name> python manage.py fix_jpeg_paths --dry-run
docker exec -it <container_name> python manage.py fix_jpeg_paths
```

### Scenario 2: Using Virtual Environment

If you use a Python virtual environment:

```bash
# Activate virtual environment first
cd /workspace/backend/myLubd
source venv/bin/activate  # or whatever your venv is called

# Then run the command
python manage.py fix_jpeg_paths --dry-run
python manage.py fix_jpeg_paths
```

### Scenario 3: Production Server

On production, you might need to use the production settings:

```bash
# With production settings
python manage.py fix_jpeg_paths --dry-run --settings=myLubd.settings.production

# Or set environment variable
export DJANGO_SETTINGS_MODULE=myLubd.settings.production
python manage.py fix_jpeg_paths --dry-run
```

### Scenario 4: Using python3 explicitly

If `python` command doesn't work:

```bash
python3 manage.py fix_jpeg_paths --dry-run
python3 manage.py fix_jpeg_paths
```

## Command Options

### --dry-run
**Recommended first step!** Preview changes without modifying the database.

```bash
python manage.py fix_jpeg_paths --dry-run
```

**What it does:**
- ✅ Shows what would change
- ✅ Doesn't modify database
- ✅ Safe to run anytime
- ✅ Can run multiple times

### No options (apply changes)
Actually updates the database.

```bash
python manage.py fix_jpeg_paths
```

**What it does:**
- ✅ Updates database records
- ✅ Fixes incorrect jpeg_path values
- ✅ Safe to run multiple times (idempotent)

## Troubleshooting

### Error: "No module named 'myappLubd'"

**Problem:** Not in correct directory or Django not installed

**Solution:**
```bash
# Make sure you're in the right directory
cd /workspace/backend/myLubd
ls manage.py  # Should exist

# Check if Django is installed
python -m django --version
```

### Error: "manage.py: command not found"

**Problem:** `manage.py` doesn't have execute permissions

**Solution:**
```bash
# Run with python explicitly
python manage.py fix_jpeg_paths --dry-run
```

### Error: Database connection errors

**Problem:** Database not accessible or wrong credentials

**Solution:**
```bash
# Check your database settings
python manage.py check

# Test database connection
python manage.py dbshell
```

### Nothing happens / No records found

**Possible reasons:**
1. All paths are already correct (good!)
2. No images in database yet
3. Database not connected

**Check:**
```bash
# Verify there are records to fix
python manage.py dbshell
# Then in SQL:
SELECT COUNT(*) FROM myapplubd_jobimage WHERE jpeg_path LIKE '%Y%';
```

### Some JPEG files don't exist (JPEG exists: False)

**Not a problem!** The command still fixes the paths. To regenerate missing JPEGs:

```bash
# Run the existing backfill command
python manage.py backfill_jpeg_images
```

## Verification

After running the command, verify it worked:

### Check Database Directly
```bash
python manage.py dbshell
```

Then run SQL:
```sql
-- Should return 0 rows after fix
SELECT COUNT(*) 
FROM myapplubd_jobimage 
WHERE jpeg_path LIKE '%Y%m%';

-- Check some fixed records
SELECT id, image, jpeg_path 
FROM myapplubd_jobimage 
LIMIT 5;
```

### Check Through Django Shell
```bash
python manage.py shell
```

Then in Python:
```python
from myappLubd.models import JobImage

# Check for any remaining bad paths
bad_paths = JobImage.objects.filter(jpeg_path__contains='%Y')
print(f"Records with bad paths: {bad_paths.count()}")

# Check a few good records
good = JobImage.objects.exclude(jpeg_path__contains='%Y')[:5]
for img in good:
    print(f"{img.image.name} -> {img.jpeg_path}")
```

## Complete Example Run

Here's what a complete run looks like:

```bash
# 1. Navigate to project
cd /workspace/backend/myLubd

# 2. Preview first
$ python manage.py fix_jpeg_paths --dry-run
DRY RUN MODE - No changes will be made
Fixing JobImage records...
...
DRY RUN COMPLETE - Would fix 205 records in total

# 3. Review output, looks good? Apply it
$ python manage.py fix_jpeg_paths
Fixing JobImage records...
...
SUCCESS - Fixed 205 records in total

# 4. Verify
$ python manage.py shell
>>> from myappLubd.models import JobImage
>>> JobImage.objects.filter(jpeg_path__contains='%Y').count()
0
>>> exit()

# 5. Done! ✅
```

## Safety Notes

- ✅ **Safe to run multiple times** - It's idempotent
- ✅ **Won't break anything** - Only fixes paths, doesn't modify files
- ✅ **No downtime needed** - Can run while app is running
- ✅ **Dry-run is completely safe** - Never modifies database

## When to Run This

Run this command:
1. **After deploying the code fix** to models.py
2. **Before testing PDF export** to ensure paths are correct
3. **Anytime you see %Y/%m in paths** in the database

---

**Quick Reference:**
```bash
cd /workspace/backend/myLubd
python manage.py fix_jpeg_paths --dry-run  # Preview
python manage.py fix_jpeg_paths             # Apply
```

That's it! 🎉
