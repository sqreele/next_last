# PDF Export Font Error Fix

## Error Description
```
ValueError at /admin/myappLubd/job/
paragraph text '<para>Generated: 2025-10-08 11:51</para>' caused exception 
error with style name=ThaiNormal 
Can't map determine family/bold/italic for sarabun

Exception Location: /usr/local/lib/python3.12/site-packages/reportlab/lib/fonts.py, line 78, in ps2tt
```

## Root Cause
The error occurred because the Thai font (Sarabun) family registration was incomplete or failing silently. The previous code:

1. Registered individual font faces (Sarabun-Regular, Sarabun-Bold)
2. Attempted to register a font family (Sarabun)
3. Only verified that individual fonts existed, NOT that the family mapping worked
4. Used the family in styles even if the mapping was broken

When ReportLab tried to use the family with the `ps2tt` function (to map family/bold/italic), it failed because the family wasn't properly registered.

## Solution Implemented

### Key Changes in `/workspace/backend/myLubd/src/myappLubd/admin.py`

#### 1. Prevent Double Registration (Lines 648-655)
```python
# Check if fonts are already registered to avoid double registration
from reportlab.pdfbase.pdfmetrics import getRegisteredFontNames
registered_fonts = getRegisteredFontNames()

if reg_name not in registered_fonts:
    pdfmetrics.registerFont(TTFont(reg_name, reg))
if bold_name not in registered_fonts:
    pdfmetrics.registerFont(TTFont(bold_name, bold))
```

#### 2. Test Existing Family First (Lines 661-673)
```python
# First check if family is already working
from reportlab.lib.fonts import ps2tt
try:
    # Test if family already exists and works
    test_normal = ps2tt(family_name, 0, 0)
    test_bold = ps2tt(family_name, 1, 0)
    test_italic = ps2tt(family_name, 0, 1)
    test_bold_italic = ps2tt(family_name, 1, 1)
    # If we got here, family already registered and works
    family_registered = True
except:
    # Family doesn't exist or doesn't work, try to register it
    ...
```

#### 3. Proper Verification After Registration (Lines 685-701)
```python
# Verify registration succeeded by testing font family mapping
try:
    # Test all font variants in the family to ensure mapping works
    test_normal = ps2tt(family_name, 0, 0)  # normal
    test_bold = ps2tt(family_name, 1, 0)    # bold
    test_italic = ps2tt(family_name, 0, 1)  # italic
    test_bold_italic = ps2tt(family_name, 1, 1)  # bold-italic
    # If we got here, all mappings work
    family_registered = True
except Exception as verify_error:
    # Family mapping verification failed
    logger.warning(f"Thai font family mapping verification failed for {family_name}: {verify_error}")
    family_registered = False
```

#### 4. Fallback to Default Fonts (Lines 718-726)
If family registration fails, the code already has fallback logic:
```python
else:
    # Fallback: Font family not properly registered, use default fonts
    styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], fontSize=9, leading=11))
    styles['ThaiNormal'].allowMarkup = True  # Default fonts support markup
```

## How It Works

1. **Check if fonts are already registered** - Prevents double registration conflicts
2. **Test if family already works** - Uses the same `ps2tt` function that was failing to verify the family is usable
3. **Register family if needed** - Only if it doesn't already work
4. **Verify registration worked** - Tests all font variants (normal/bold/italic/boldItalic)
5. **Fallback gracefully** - If verification fails, uses default fonts instead of crashing

## Deployment Steps

### For Docker Environment
```bash
# Restart the backend container to reload the code
docker-compose restart backend
# OR
docker restart <backend-container-name>
```

### For Development Environment
```bash
# Restart Django development server
# Press Ctrl+C to stop the server
# Then run:
python manage.py runserver
```

### For Production (Gunicorn/uWSGI)
```bash
# Reload Gunicorn
sudo systemctl reload gunicorn
# OR
sudo supervisorctl restart gunicorn

# For uWSGI
sudo systemctl reload uwsgi
# OR touch the wsgi file to trigger reload
touch /path/to/wsgi.py
```

## Testing

After deployment, test the PDF export:

1. Go to `/admin/myappLubd/job/`
2. Select some jobs
3. Choose "Export selected jobs as PDF" action
4. Click "Go"

Expected behavior:
- PDF should generate successfully
- No ValueError about font family mapping
- Thai text should render correctly if fonts are available
- Default fonts should be used gracefully if Thai fonts fail to register

## Logging

The fix adds logging to help diagnose issues:

```python
logger.info(f"Thai font family {family_name} already registered and working")
logger.info(f"Thai font family {family_name} registered successfully")
logger.warning(f"Thai font family mapping verification failed for {family_name}: {verify_error}")
logger.warning(f"Thai font family registration failed for {family_name}: {e}")
```

Check Django logs for these messages to confirm proper operation.

## Files Modified

- `/workspace/backend/myLubd/src/myappLubd/admin.py` (Lines 645-707)

## Summary

This fix makes the PDF export robust by:
- ✅ Properly verifying font family registration works before using it
- ✅ Preventing double registration conflicts
- ✅ Gracefully falling back to default fonts if Thai fonts fail
- ✅ Using the same `ps2tt` function for verification that's used at runtime
- ✅ Adding detailed logging for troubleshooting

The PDF export will now work reliably whether Thai fonts are available or not.
