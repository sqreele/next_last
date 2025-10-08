# ReportLab 4.x ps2tt() Function Fix

## Issue

You were seeing this warning in your Django logs:

```
WARNING 2025-10-08 20:19:40,973 admin Thai font family mapping verification failed for Sarabun: ps2tt() takes 1 positional argument but 3 were given
```

## Root Cause

The code in `admin.py` was written for **ReportLab 3.x** API, but your container is running **ReportLab 4.4.4**, which has a different function signature:

- **ReportLab 3.x**: `ps2tt(family_name, bold, italic)` - takes 3 arguments
- **ReportLab 4.x**: `ps2tt(psfn)` - takes only 1 argument

The font verification code was calling `ps2tt(family_name, 0, 0)` which worked in ReportLab 3.x but fails in ReportLab 4.x.

## Solution

Updated `/home/sqreele/next_last/backend/myLubd/src/myappLubd/admin.py` to use the **ReportLab 4.x compatible API**:

### Before (Lines 660-707):
```python
# First check if family is already working
from reportlab.lib.fonts import ps2tt
try:
    # Test if family already exists and works
    test_normal = ps2tt(family_name, 0, 0)
    test_bold = ps2tt(family_name, 1, 0)
    test_italic = ps2tt(family_name, 0, 1)
    test_bold_italic = ps2tt(family_name, 1, 1)
    # ... rest of the code
```

### After (Lines 660-690):
```python
# First check if family is already registered
import logging
logger = logging.getLogger(__name__)

# Check if fonts are already registered by trying to get them
try:
    # Test if individual fonts exist
    pdfmetrics.getFont(reg_name)
    pdfmetrics.getFont(bold_name)
    
    # Try to register the font family
    # Note: registerFontFamily doesn't error if already registered
    try:
        pdfmetrics.registerFontFamily(
            family_name,
            normal=reg_name,
            bold=bold_name,
            italic=reg_name,      # use regular for italic fallback
            boldItalic=bold_name, # use bold for bold-italic fallback
        )
        family_registered = True
        logger.info(f"Thai font family {family_name} registered successfully")
    except Exception as e:
        # Family registration failed, but individual fonts work
        logger.warning(f"Thai font family registration failed for {family_name}: {e}")
        family_registered = False
except Exception as e:
    # Fonts don't exist or aren't registered
    logger.warning(f"Thai fonts not available ({reg_name}, {bold_name}): {e}")
    family_registered = False
```

## Changes Made

1. **Removed** the `ps2tt()` function calls (incompatible with ReportLab 4.x)
2. **Added** `pdfmetrics.getFont()` to verify font registration (ReportLab 4.x compatible)
3. **Simplified** the verification logic to just check if fonts exist
4. **Improved** error messages to be more informative

## Verification

After restarting the container, the warning no longer appears:

```bash
# Before fix:
WARNING 2025-10-08 20:19:40,973 admin Thai font family mapping verification failed for Sarabun: ps2tt() takes 1 positional argument but 3 were given

# After fix:
(No warnings - clean startup)
```

## Result

✅ **The warning is now fixed!** The Thai font registration works correctly with ReportLab 4.x.

The PDF export functionality will continue to work as expected, with proper Thai font support when the Sarabun fonts are available.

## Technical Details

### ReportLab Version Check
```bash
docker exec django-backend python -c "import reportlab; print('ReportLab version:', reportlab.Version)"
# Output: ReportLab version: 4.4.4
```

### Function Signature Check
```bash
docker exec django-backend python -c "from reportlab.lib.fonts import ps2tt; import inspect; print('ps2tt signature:', inspect.signature(ps2tt))"
# Output: ps2tt signature: (psfn)
```

## Related Files

- **Modified**: `/home/sqreele/next_last/backend/myLubd/src/myappLubd/admin.py` (lines 660-690)
- **ReportLab Version**: 4.4.4 (specified in `requirements.txt` as `reportlab>=3.6.0`)

## Recommendations

If you want to ensure compatibility only with ReportLab 4.x going forward, you can update `requirements.txt`:

```txt
reportlab>=4.0.0,<5.0.0
```

This will prevent accidental downgrades to ReportLab 3.x in the future.

