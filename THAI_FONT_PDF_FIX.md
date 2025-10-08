# Thai Font PDF Generation Fix

## Problem
ValueError when generating PDF reports in Django admin:
```
ValueError at /admin/myappLubd/job/
paragraph text '<para>Generated: 2025-10-08 11:38</para>' caused exception 
error with style name=ThaiNormal 
Can't map determine family/bold/italic for sarabun
```

## Root Cause
The error occurred when:
1. Thai fonts (Sarabun) were registered as individual font faces (`Sarabun-Regular`, `Sarabun-Bold`)
2. Font family registration failed or was incomplete
3. The code used individual font face names instead of family names in paragraph styles
4. When ReportLab encountered inline markup tags like `<b>`, it tried to map the font to bold/italic variants
5. Since a font face (not family) was used, ReportLab couldn't determine the bold/italic mappings

## Solution Implemented

### 1. Improved Font Family Registration (`admin.py` lines 648-680)
- Font faces are registered first (`Sarabun-Regular`, `Sarabun-Bold`)
- Font family is registered with proper mappings:
  - `normal` → `Sarabun-Regular`
  - `bold` → `Sarabun-Bold`
  - `italic` → `Sarabun-Regular` (fallback)
  - `boldItalic` → `Sarabun-Bold` (fallback)
- Added verification to ensure fonts are retrievable after registration
- Added error logging for debugging font registration failures

### 2. Safe Font Usage (`admin.py` lines 677-698)
- **If font family is properly registered**: Use the family name in styles, allowing inline markup
- **If font family registration fails**: Fall back to default fonts entirely to avoid mapping errors
- This prevents the "Can't map determine family/bold/italic" error

### 3. Safe Paragraph Creation (`admin.py` lines 715-723)
- Added `_make_paragraph()` helper function (defined early in the function)
- Strips HTML tags from text when font family doesn't support markup
- Ensures paragraphs are created safely regardless of font registration status

### 4. Updated All Paragraph Calls
- All `Paragraph()` calls using `ThaiNormal` or `ThaiSmall` styles now use `_make_paragraph()`
- This includes:
  - Generated timestamp (line 728)
  - Job information fields (lines 818-825)
  - Status information (lines 886-896)

## Key Changes

### Before
```python
# Could fail if family not registered
base_family = thai_family or thai_regular
styles.add(ParagraphStyle(name='ThaiNormal', fontName=base_family, ...))
Paragraph(f"<b>Job ID:</b> #{job_id}", styles['ThaiNormal'])
```

### After
```python
# Only use Thai fonts if family is properly registered
if thai_regular and thai_family:
    styles.add(ParagraphStyle(name='ThaiNormal', fontName=thai_family, ...))
else:
    # Fall back to default fonts
    styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], ...))

# Safe paragraph creation
_make_paragraph(f"<b>Job ID:</b> #{job_id}", styles['ThaiNormal'])
```

## Testing
The fix ensures:
1. ✅ PDF generation works when Thai fonts are properly registered
2. ✅ PDF generation falls back to default fonts when registration fails
3. ✅ No "Can't map determine family/bold/italic" errors
4. ✅ Inline markup (`<b>` tags) works correctly
5. ✅ No syntax or linter errors

## Files Modified
- `/workspace/backend/myLubd/src/myappLubd/admin.py`

## Additional Notes
- The fix is backward compatible
- Font files must exist at one of the registered paths (e.g., `/app/static/fonts/Sarabun-Regular.ttf`)
- If Thai fonts are not available, the system gracefully falls back to default fonts
- Added logging to help debug font registration issues in production
