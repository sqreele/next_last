# Thai Font Markup Error Fix

## Summary

Fixed the "Can't map determine family/bold/italic for Sarabun" error when exporting PDFs from Django admin.

**Date**: October 8, 2025  
**Error**: `ValueError: Can't map determine family/bold/italic for sarabun`  
**File Modified**: `/home/sqreele/next_last/backend/myLubd/src/myappLubd/admin.py`

---

## The Problem

When exporting jobs to PDF in Django admin, the following error occurred:

```
ValueError at /admin/myappLubd/job/
paragraph text '<para>Generated: 2025-10-08 13:57</para>' caused exception 
error with style name=ThaiNormal Can't map determine family/bold/italic for sarabun
```

### Root Cause

The issue was caused by using **inline HTML markup** (`<b>`, `<font>`, etc.) with a **font family name** in ReportLab 4.x:

1. The code registered individual Thai fonts: `Sarabun-Regular`, `Sarabun-Bold`
2. It tried to register a font family: `Sarabun`
3. Paragraph styles used the family name with `allowMarkup = True`
4. When ReportLab encountered inline markup like `<b>text</b>`, it tried to map to `Sarabun-Bold`
5. **ReportLab 4.x's font family mapping doesn't work reliably**, causing the error

---

## The Solution

### Changed Font Strategy (Lines 715-734)

**Before** (Using Font Family - BROKEN):
```python
if thai_regular and thai_family:
    # Font family is properly registered, we can use it with inline markup
    styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], 
                             fontName=thai_family,  # Using family name
                             fontSize=9, leading=11, wordWrap='CJK'))
    styles['ThaiNormal'].allowMarkup = True  # CAUSES ERROR!
```

**After** (Using Individual Fonts - FIXED):
```python
if thai_regular and thai_bold:
    # Use individual font names instead of family to avoid mapping errors
    styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], 
                             fontName=thai_regular,  # Using specific font
                             fontSize=9, leading=11, wordWrap='CJK'))
    styles['ThaiNormal'].allowMarkup = False  # Disable markup to avoid family mapping
```

### Key Changes

1. **Use Individual Font Names**: Changed from `thai_family` to `thai_regular`/`thai_bold`
2. **Disable Inline Markup**: Set `allowMarkup = False` for Thai font styles
3. **Strip HTML Tags**: The existing `_make_paragraph()` helper automatically strips HTML tags when `allowMarkup = False`

---

## How It Works Now

### Font Registration Flow

1. ✅ Register individual fonts: `Sarabun-Regular`, `Sarabun-Bold`
2. ✅ Create styles using individual font names (not family)
3. ✅ Disable markup for Thai fonts
4. ✅ Helper function strips HTML tags before creating paragraphs

### Markup Handling

The `_make_paragraph()` helper function (lines 741-749) handles this automatically:

```python
def _make_paragraph(text, style, allow_markup=None):
    """Create a paragraph, handling markup safety based on font family registration."""
    if allow_markup is None:
        allow_markup = getattr(style, 'allowMarkup', True)
    if not allow_markup:
        # Strip HTML tags if markup is not safe (font family not registered)
        import re
        text = re.sub(r'<[^>]+>', '', text)
    return Paragraph(text, style)
```

### Example

**Input Text**:
```python
_make_paragraph(f"<b>Job ID:</b> #{job.job_id}", styles['ThaiNormal'])
```

**With Thai Fonts**:
- `allowMarkup = False`
- HTML tags are stripped: `"Job ID: #12345"`
- Uses `Sarabun-Regular` font
- ✅ **No Error**

**With Default Fonts** (fallback):
- `allowMarkup = True`
- HTML tags preserved: `"<b>Job ID:</b> #12345"`
- Uses `Helvetica` with bold variants
- ✅ **Works Fine**

---

## Trade-offs

### What We Lost

❌ **No inline bold/italic** with Thai fonts (e.g., `<b>bold</b>` tags are stripped)

### What We Gained

✅ **PDF export works reliably** with Thai fonts  
✅ **No ReportLab mapping errors**  
✅ **Clean, readable Thai text** (Sarabun font)  
✅ **Automatic fallback** to default fonts if Thai fonts unavailable

---

## Alternative Solutions Considered

### Option 1: Use Separate Bold Paragraphs (NOT IMPLEMENTED)
Create separate paragraphs for bold text:
```python
# Instead of: "<b>Job ID:</b> #12345"
Paragraph("Job ID:", bold_style)  # Separate paragraph
Paragraph(f"#{job.job_id}", normal_style)
```
**Rejected**: Too complex, harder to maintain

### Option 2: Fix Font Family Registration (NOT WORKING)
Try to make font family mapping work in ReportLab 4.x
**Rejected**: Already attempted, ReportLab 4.x has breaking changes

### Option 3: Downgrade to ReportLab 3.x (NOT RECOMMENDED)
Use older version with working family mapping
**Rejected**: Security concerns, missing features

---

## Status

- ✅ No linter errors
- ✅ Backend restarted successfully
- ✅ PDF export now works without errors
- ✅ Thai fonts display correctly (without bold markup)

---

## Testing

1. Go to Django Admin: `http://localhost:8000/admin/`
2. Navigate to **Jobs**
3. Select some jobs
4. Click **"Export selected/filtered jobs to PDF"**
5. ✅ PDF should generate successfully with Thai text in Sarabun font

---

## Related Issues

- **ReportLab 4.x ps2tt() Fix**: See `REPORTLAB_4X_PS2TT_FIX.md`
- **Admin PDF Layout Update**: See `ADMIN_PDF_LAYOUT_UPDATE.md`
- **Room Filter**: See `ADMIN_ROOM_FILTER_ADDED.md`

---

## Technical Notes

### ReportLab 4.x Font Family Mapping

In ReportLab 3.x:
```python
# This worked:
pdfmetrics.registerFontFamily('Sarabun', 
                             normal='Sarabun-Regular',
                             bold='Sarabun-Bold')
# And then: fontName='Sarabun' with inline <b> tags
```

In ReportLab 4.x:
```python
# Font family registration exists but mapping is unreliable
# Safer to use individual font names directly
```

### Why This Happens

ReportLab needs to map:
- `Sarabun` + `<b>` → `Sarabun-Bold`
- `Sarabun` + `<i>` → `Sarabun-Italic`

The mapping mechanism changed in ReportLab 4.x and is less reliable, especially with custom TrueType fonts.

---

**Result**: PDF export now works reliably with Thai fonts in Django admin! 🎉

