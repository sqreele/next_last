# Deployment and Testing Guide for PDF Export Font Fix

## Overview
Fixed the `ValueError: Can't map determine family/bold/italic for sarabun` error in the Django admin PDF export functionality.

## Files Modified
- `/workspace/backend/myLubd/src/myappLubd/admin.py` (Lines 645-710)

## What Was Fixed

### Problem
The Thai font (Sarabun) family registration was failing silently, but the code was still trying to use it. When ReportLab's `ps2tt` function tried to map the family to actual font files, it failed with:
```
ValueError: Can't map determine family/bold/italic for sarabun
```

### Solution
1. **Added font registration check** to prevent double registration
2. **Test family before use** - verify the family mapping works before using it
3. **Proper verification** - use the same `ps2tt` function for verification that's used at runtime
4. **Graceful fallback** - if Thai fonts fail, use default fonts instead of crashing

## Deployment Steps

### Option 1: Automatic Reload (Code is Volume-Mounted)
Since the code is mounted as a volume in docker-compose.yml:
```yaml
volumes:
  - ./backend/myLubd/src:/app/src
```

The changes are already visible to the container. **However, Django needs to reload the module.**

#### For Development Mode (DEBUG=True with auto-reload):
If the Django server is running with auto-reload, it should pick up the changes automatically.

#### For Production Mode:
Restart the backend container:
```bash
docker-compose restart backend
```

### Option 2: Full Restart (Recommended for Production)
```bash
# Stop the backend
docker-compose stop backend

# Start it again
docker-compose start backend

# Or restart all services
docker-compose restart
```

### Option 3: Rebuild (If changes don't apply)
```bash
# Rebuild and restart the backend
docker-compose up -d --build backend
```

## Verification Steps

### 1. Check Container Logs
```bash
# Watch backend logs in real-time
docker-compose logs -f backend

# Look for these messages:
# ✅ "Thai font family Sarabun already registered and working"
# ✅ "Thai font family Sarabun registered successfully"
# ⚠️  "Thai font family mapping verification failed" (if fonts unavailable - this is OK, fallback will work)
```

### 2. Test PDF Export in Admin

1. **Navigate to Job Admin**:
   - Go to `https://pcms.live/admin/myappLubd/job/`

2. **Select Jobs**:
   - Check one or more job checkboxes

3. **Export PDF**:
   - Select action: "Export selected jobs as PDF"
   - Click "Go"

4. **Expected Results**:
   - ✅ PDF downloads successfully
   - ✅ No ValueError about font family
   - ✅ Thai text renders correctly (if fonts available)
   - ✅ Default fonts used gracefully (if fonts unavailable)

### 3. Run Test Script (Optional)
```bash
# Enter the backend container
docker exec -it django-backend bash

# Run the test script
cd /app/src
python ../test_admin_pdf_export.py

# This will:
# - Test the PDF export functionality
# - Create a test PDF file
# - Verify the font fix works
```

## Monitoring

### Django Logs Location
```bash
# View logs
docker-compose logs backend

# Save logs to file for analysis
docker-compose logs backend > backend_logs.txt
```

### What to Look For

#### ✅ Success Indicators:
```
INFO Thai font family Sarabun already registered and working
INFO Thai font family Sarabun registered successfully
```

#### ⚠️ Warning (Non-Critical):
```
WARNING Thai font family mapping verification failed for Sarabun: ...
```
This is OK - the system will fall back to default fonts and PDF will still generate.

#### ❌ Error (Critical):
```
ValueError: Can't map determine family/bold/italic for sarabun
```
If you still see this error, the fix didn't apply. Try:
1. Restart the container
2. Check if the file was modified correctly
3. Rebuild the container

## Rollback Plan

If issues occur, revert the changes:

```bash
# Restore from git (if tracked)
cd /workspace/backend/myLubd/src/myappLubd
git checkout admin.py

# Restart
docker-compose restart backend
```

## Font Files

The fix works with or without Thai fonts. If Thai fonts are available at these locations, they will be used:

```
/app/static/fonts/Sarabun-Regular.ttf
/app/static/fonts/Sarabun-Bold.ttf
```

If not available, the system gracefully falls back to default fonts (Helvetica).

## Troubleshooting

### Issue: PDF export still fails
**Solution**: 
1. Check container logs for errors
2. Verify the admin.py file has the changes
3. Restart the container
4. Check if fonts exist in the container

### Issue: Thai text doesn't render
**Solution**:
1. This is expected if Thai fonts aren't installed
2. Check if Sarabun fonts exist in `/app/static/fonts/`
3. The PDF will still generate with default fonts

### Issue: Changes don't apply
**Solution**:
1. Verify the file at `/workspace/backend/myLubd/src/myappLubd/admin.py` has the changes
2. Restart the container: `docker-compose restart backend`
3. If still not working, rebuild: `docker-compose up -d --build backend`

### Issue: Container won't start
**Solution**:
1. Check syntax errors: `docker-compose logs backend`
2. Verify Python syntax: `python3 -m py_compile admin.py`
3. Rollback changes and investigate

## Testing Checklist

- [ ] Container restarted/reloaded
- [ ] Container logs checked for font registration messages
- [ ] PDF export tested with 1 job
- [ ] PDF export tested with multiple jobs
- [ ] PDF export tested with defective jobs filter
- [ ] No ValueError errors in logs
- [ ] Generated PDFs open correctly
- [ ] Thai text renders (if fonts available) OR default fonts used gracefully

## Support

If issues persist:
1. Check `/workspace/PDF_EXPORT_FONT_ERROR_FIX.md` for technical details
2. Review container logs: `docker-compose logs backend`
3. Verify font files exist in the container: `docker exec -it django-backend ls -la /app/static/fonts/`

## Summary

The fix makes PDF export robust by:
- ✅ Testing font family registration before use
- ✅ Gracefully falling back if fonts unavailable
- ✅ Preventing double registration conflicts
- ✅ Using same verification method as runtime
- ✅ Adding detailed logging

**The PDF export will now work reliably whether Thai fonts are available or not.**
