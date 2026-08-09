import csv
import os
import re
from collections import Counter
from datetime import datetime
from io import BytesIO

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone


def _absolute_file_url(request, file_field):
    """Return an absolute URL for a file field so CSV exports can link images."""
    if not file_field or not hasattr(file_field, 'url'):
        return ''
    try:
        url = file_field.url
    except ValueError:
        return ''
    if request is not None:
        return request.build_absolute_uri(url)
    return url


def _spreadsheet_image_formula(image_url):
    """Return a spreadsheet IMAGE formula for apps that can render image URLs."""
    if not image_url:
        return ''
    escaped_url = image_url.replace('"', '""')
    return f'=IMAGE("{escaped_url}")'


def _image_export_note(image_count):
    """Explain how image data appears in CSV exports.

    CSV files are plain text and cannot contain embedded image binaries. The
    export includes both direct URLs and optional spreadsheet formulas instead,
    so users can either click the links or render the images in spreadsheet apps
    that support IMAGE formulas.
    """
    if image_count <= 0:
        return 'No images attached to this record.'
    if image_count == 1:
        return 'CSV cannot embed images; open the Image URL or use the IMAGE formula in a supported spreadsheet.'
    return f'CSV cannot embed images; {image_count} image URLs/formulas are separated by new lines.'



class UnsupportedExcelImagePreview(ValueError):
    """Raised when an upload should be exported as a URL instead of an XLSX preview."""


def _excel_image_for_export(image_path, drawing_image_cls):
    """Return an openpyxl image that is safe to save inside an XLSX file.

    openpyxl can instantiate previews for some upload formats that XLSX
    packaging cannot save reliably. Convert uncommon camera/phone formats to
    a small PNG preview before embedding them.
    """
    from io import BytesIO
    from PIL import Image as PILImage

    supported_formats = {'gif', 'jpeg', 'png'}
    supported_extensions = {'.gif', '.jpeg', '.jpg', '.png'}
    convertible_extensions = {'.bmp', '.jfif', '.webp'}

    image_extension = os.path.splitext(image_path)[1].lower()
    max_file_size = 5 * 1024 * 1024
    max_convert_pixels = 50_000_000

    # Reject formats that Pillow/openpyxl cannot package predictably before
    # decoding them, and avoid spending memory on oversized upload previews.
    if image_extension not in supported_extensions | convertible_extensions:
        raise UnsupportedExcelImagePreview(
            f'Unsupported Excel preview extension: {image_extension or "<none>"}'
        )
    if os.path.getsize(image_path) > max_file_size:
        raise UnsupportedExcelImagePreview('Image is too large for an Excel preview.')

    with PILImage.open(image_path) as pil_image:
        image_format = (pil_image.format or '').lower()
        if image_format in supported_formats and image_extension in supported_extensions:
            return drawing_image_cls(image_path), None

        width, height = pil_image.size
        if width * height > max_convert_pixels:
            pil_image.thumbnail((3000, 3000))

        # Use the first frame for multi-picture formats such as MPO. Convert to
        # an Excel-friendly color mode before saving as PNG.
        try:
            pil_image.seek(0)
        except EOFError:
            pass

        # Build only a small preview for Excel. Some phone/camera uploads can
        # be very large, and encoding the full image can exceed the gunicorn
        # request timeout while exporting.
        max_preview_size = (120, 90)
        converted = pil_image.copy()
        converted.thumbnail(max_preview_size)
        if converted.mode not in ('RGB', 'RGBA'):
            converted = converted.convert('RGB')

        buffer = BytesIO()
        buffer.name = 'image.png'
        converted.save(buffer, format='PNG', optimize=False)
        buffer.seek(0)
        return drawing_image_cls(buffer), buffer


class JobExportMixin:
    """Job admin PDF, CSV, Excel, and export-image behavior."""

    floor_filter_class = None

    def export_jobs_pdf(self, request, queryset):
        """Export selected/filtered jobs to a PDF with card-style rows matching the web Job PDF."""
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        # Local imports for file handling
        import os
        from django.conf import settings
        from xml.sax.saxutils import escape as xml_escape

        # Prefetch related data to avoid N+1 queries
        qs = queryset.select_related('user', 'area', 'area__property').prefetch_related('rooms__properties', 'rooms', 'topics', 'job_images').order_by('created_at')

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=48, bottomMargin=36)
        styles = getSampleStyleSheet()

        # ---------------------------------
        # Thai font registration (if present)
        # ---------------------------------
        thai_regular = None
        thai_bold = None
        thai_family = None

        def register_thai_fonts():
            nonlocal thai_regular, thai_bold, thai_family
            if thai_regular and thai_bold:
                return
            base_dir = getattr(settings, 'BASE_DIR', '')
            project_root = os.path.dirname(base_dir) if base_dir else ''
            candidates = [
                # Image-level fonts are copied before Docker mounts /app/static as a volume.
                (
                    '/usr/local/share/fonts/mylubd/Sarabun-Regular.ttf',
                    '/usr/local/share/fonts/mylubd/Sarabun-Bold.ttf',
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                # Collected static root (Docker runtime mounts to /app/static)
                (
                    os.path.join(getattr(settings, 'STATIC_ROOT', ''), 'fonts', 'Sarabun-Regular.ttf'),
                    os.path.join(getattr(settings, 'STATIC_ROOT', ''), 'fonts', 'Sarabun-Bold.ttf'),
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                # Common container path for static files (explicit)
                (
                    '/app/static/fonts/Sarabun-Regular.ttf',
                    '/app/static/fonts/Sarabun-Bold.ttf',
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                # Noto Sans Thai (common on servers)
                (
                    '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf',
                    '/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf',
                    'NotoSansThai-Regular',
                    'NotoSansThai-Bold'
                ),
                # TH Sarabun New (common in Thailand)
                (
                    '/usr/share/fonts/truetype/thai/THSarabunNew.ttf',
                    '/usr/share/fonts/truetype/thai/THSarabunNewBold.ttf',
                    'THSarabunNew',
                    'THSarabunNew-Bold'
                ),
                # Project fonts directories
                (
                    os.path.join(base_dir, 'static', 'fonts', 'NotoSansThai-Regular.ttf'),
                    os.path.join(base_dir, 'static', 'fonts', 'NotoSansThai-Bold.ttf'),
                    'NotoSansThai-Regular',
                    'NotoSansThai-Bold'
                ),
                (
                    os.path.join(base_dir, 'fonts', 'NotoSansThai-Regular.ttf'),
                    os.path.join(base_dir, 'fonts', 'NotoSansThai-Bold.ttf'),
                    'NotoSansThai-Regular',
                    'NotoSansThai-Bold'
                ),
                # Sarabun (Thai) - commonly used in our frontend
                (
                    os.path.join(project_root, 'static_volume', 'fonts', 'Sarabun-Regular.ttf'),
                    os.path.join(project_root, 'static_volume', 'fonts', 'Sarabun-Bold.ttf'),
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                (
                    os.path.join(base_dir, 'static', 'fonts', 'Sarabun-Regular.ttf'),
                    os.path.join(base_dir, 'static', 'fonts', 'Sarabun-Bold.ttf'),
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                (
                    os.path.join(base_dir, 'fonts', 'Sarabun-Regular.ttf'),
                    os.path.join(base_dir, 'fonts', 'Sarabun-Bold.ttf'),
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                # Static volume (mounted) fonts: backend/static_volume/fonts
                (
                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(base_dir))), 'static_volume', 'fonts', 'Sarabun-Regular.ttf'),
                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(base_dir))), 'static_volume', 'fonts', 'Sarabun-Bold.ttf'),
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                (
                    os.path.join(base_dir, 'static', 'fonts', 'THSarabunNew.ttf'),
                    os.path.join(base_dir, 'static', 'fonts', 'THSarabunNew-Bold.ttf'),
                    'THSarabunNew',
                    'THSarabunNew-Bold'
                ),
                (
                    os.path.join(base_dir, 'fonts', 'THSarabunNew.ttf'),
                    os.path.join(base_dir, 'fonts', 'THSarabunNew-Bold.ttf'),
                    'THSarabunNew',
                    'THSarabunNew-Bold'
                ),
            ]
            for reg, bold, reg_name, bold_name in candidates:
                try:
                    if reg and bold and os.path.isfile(reg) and os.path.isfile(bold):
                        # Check if fonts are already registered to avoid double registration
                        from reportlab.pdfbase.pdfmetrics import getRegisteredFontNames
                        registered_fonts = getRegisteredFontNames()
                        
                        if reg_name not in registered_fonts:
                            pdfmetrics.registerFont(TTFont(reg_name, reg))
                        if bold_name not in registered_fonts:
                            pdfmetrics.registerFont(TTFont(bold_name, bold))
                        
                        # Derive a family name (e.g., "Sarabun" from "Sarabun-Regular")
                        family_name = reg_name.rsplit('-', 1)[0] if '-' in reg_name else reg_name
                        family_registered = False
                        
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
                        # Always record faces; only record family if registered
                        thai_regular, thai_bold = reg_name, bold_name
                        thai_family = family_name if family_registered else None
                        break
                except Exception:
                    # Try next candidate
                    continue

        register_thai_fonts()

        # Add Thai-capable styles
        from reportlab.lib.styles import ParagraphStyle
        if thai_regular and thai_bold:
            # Use individual font names instead of family to avoid mapping errors in ReportLab 4.x
            # This prevents "Can't map determine family/bold/italic" errors
            styles.add(ParagraphStyle(name='ThaiTitle', parent=styles['Title'], fontName=thai_bold))
            styles.add(ParagraphStyle(name='ThaiHeading2', parent=styles['Heading2'], fontName=thai_bold))
            styles.add(ParagraphStyle(name='ThaiHeading3', parent=styles['Heading3'], fontName=thai_bold))
            styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], fontName=thai_regular, fontSize=9, leading=11, wordWrap='CJK'))
            styles.add(ParagraphStyle(name='ThaiSmall', parent=styles['Normal'], fontName=thai_regular, fontSize=8, leading=10, wordWrap='CJK'))
            # Use individual fonts - no inline bold/italic markup to avoid family mapping
            styles['ThaiNormal'].allowMarkup = False
            styles['ThaiSmall'].allowMarkup = False
        else:
            # Fallback: Font not available, use default fonts
            styles.add(ParagraphStyle(name='ThaiTitle', parent=styles['Title']))
            styles.add(ParagraphStyle(name='ThaiHeading2', parent=styles['Heading2']))
            styles.add(ParagraphStyle(name='ThaiHeading3', parent=styles['Heading3']))
            styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], fontSize=9, leading=11))
            styles.add(ParagraphStyle(name='ThaiSmall', parent=styles['Normal'], fontSize=8, leading=10))
            styles['ThaiNormal'].allowMarkup = True  # Default fonts support markup
            styles['ThaiSmall'].allowMarkup = True
        story = []

        # Helper functions
        def _escape_text(text):
            return xml_escape(text or '')
        
        def _make_paragraph(text, style, allow_markup=None):
            """Create a paragraph, handling markup safety based on font family registration."""
            if allow_markup is None:
                allow_markup = getattr(style, 'allowMarkup', True)
            if not allow_markup:
                # Strip HTML tags if markup is not safe (font family not registered)
                import re
                text = re.sub(r'<[^>]+>', '', text)
            return Paragraph(text, style)

        # Layout helpers
        page_width, _page_height = A4
        usable_width = page_width - doc.leftMargin - doc.rightMargin

        # Header
        now_display = timezone.now().strftime('%Y-%m-%d %H:%M')
        story.append(Paragraph("Jobs Report", styles['ThaiTitle']))
        story.append(_make_paragraph(f"Generated: {now_display}", styles['ThaiNormal']))
        story.append(Spacer(1, 12))

        # Statistics Section (like frontend)
        total_jobs = qs.count()
        completed = qs.filter(status='completed').count()
        in_progress = qs.filter(status='in_progress').count()
        pending = qs.filter(status='pending').count()
        high_priority = qs.filter(priority='high').count()
        
        # Statistics header with metadata
        metadata_data = [
            [
                _make_paragraph(f"<b>Total Jobs:</b> {total_jobs}", styles['ThaiSmall']),
                _make_paragraph(f"<b>Date:</b> {now_display}", styles['ThaiSmall']),
            ]
        ]
        metadata_table = Table(metadata_data, colWidths=[usable_width * 0.5, usable_width * 0.5])
        metadata_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.Color(0.95, 0.97, 0.99)),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.Color(0.42, 0.45, 0.5)),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('ROUNDEDCORNERS', (0, 0), (-1, -1), [5, 5, 5, 5]),
        ]))
        story.append(metadata_table)
        story.append(Spacer(1, 10))
        
        # Statistics boxes (like frontend)
        stat_data = [
            [
                _make_paragraph(f"<b>{completed}</b><br/><font size='8'>Completed</font>", styles['ThaiSmall']),
                _make_paragraph(f"<b>{in_progress}</b><br/><font size='8'>In Progress</font>", styles['ThaiSmall']),
                _make_paragraph(f"<b>{pending}</b><br/><font size='8'>Pending</font>", styles['ThaiSmall']),
                _make_paragraph(f"<b>{high_priority}</b><br/><font size='8'>High Priority</font>", styles['ThaiSmall']),
            ]
        ]
        stat_widths = [usable_width * 0.25] * 4
        stat_table = Table(stat_data, colWidths=stat_widths)
        stat_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.Color(0.94, 0.96, 0.98)),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.Color(0.06, 0.09, 0.16)),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('ROUNDEDCORNERS', (0, 0), (-1, -1), [8, 8, 8, 8]),
        ]))
        story.append(stat_table)
        story.append(Spacer(1, 15))

        # Column widths matching frontend: image 20%, info 45%, status 35%
        col_widths = [usable_width * 0.20, usable_width * 0.45, usable_width * 0.35]

        header_font = thai_bold or 'Helvetica-Bold'
        body_font = thai_regular or 'Helvetica'

        def _first_image_path(job_obj):
            for img in job_obj.job_images.all():
                img_path = None
                if getattr(img, 'jpeg_path', None):
                    img_path = os.path.join(settings.MEDIA_ROOT, img.jpeg_path)
                elif getattr(img, 'image', None) and hasattr(img.image, 'path'):
                    img_path = img.image.path
                if img_path and os.path.isfile(img_path):
                    return img_path
            return None

        # Color helpers matching frontend (using RGB values from frontend)
        # Status colors: #16a34a (green), #2563eb (blue), #ea580c (orange), #dc2626 (red), #7c3aed (purple)
        status_bg_map = {
            'completed': colors.Color(0.09, 0.64, 0.29, alpha=0.15),      # #16a34a with 15% opacity
            'in_progress': colors.Color(0.15, 0.39, 0.92, alpha=0.15),    # #2563eb with 15% opacity
            'pending': colors.Color(0.92, 0.35, 0.05, alpha=0.15),        # #ea580c with 15% opacity
            'cancelled': colors.Color(0.86, 0.15, 0.15, alpha=0.15),      # #dc2626 with 15% opacity
            'waiting_sparepart': colors.Color(0.49, 0.23, 0.93, alpha=0.15), # #7c3aed with 15% opacity
        }
        status_text_map = {
            'completed': colors.Color(0.09, 0.64, 0.29),      # #16a34a (green)
            'in_progress': colors.Color(0.15, 0.39, 0.92),    # #2563eb (blue)
            'pending': colors.Color(0.92, 0.35, 0.05),        # #ea580c (orange)
            'cancelled': colors.Color(0.86, 0.15, 0.15),      # #dc2626 (red)
            'waiting_sparepart': colors.Color(0.49, 0.23, 0.93), # #7c3aed (purple)
        }
        # Priority colors: #dc2626 (red), #ea580c (orange), #16a34a (green)
        priority_bg_map = {
            'high': colors.Color(0.86, 0.15, 0.15, alpha=0.15),     # #dc2626 with 15% opacity
            'medium': colors.Color(0.92, 0.35, 0.05, alpha=0.15),   # #ea580c with 15% opacity
            'low': colors.Color(0.09, 0.64, 0.29, alpha=0.15),      # #16a34a with 15% opacity
        }
        priority_text_map = {
            'high': colors.Color(0.86, 0.15, 0.15),     # #dc2626 (red)
            'medium': colors.Color(0.92, 0.35, 0.05),   # #ea580c (orange)
            'low': colors.Color(0.09, 0.64, 0.29),      # #16a34a (green)
        }

        # Card renderer
        for job_index, job in enumerate(qs):
            # Image cell - use proportional sizing matching frontend
            img_width = col_widths[0] - 12
            img_height = 80  # Fixed height like frontend
            img_path = _first_image_path(job)
            if img_path:
                try:
                    image_cell = Image(img_path, width=img_width, height=img_height)
                except Exception:
                    image_cell = Table([[Paragraph('No Image', styles['ThaiSmall'])]], colWidths=[img_width], rowHeights=[img_height])
                    image_cell.setStyle(TableStyle([
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('BACKGROUND', (0, 0), (-1, -1), colors.Color(0.95, 0.96, 0.97)),
                        ('ROUNDEDCORNERS', (0, 0), (-1, -1), [4, 4, 4, 4]),
                    ]))
            else:
                image_cell = Table([[Paragraph('No Image', styles['ThaiSmall'])]], colWidths=[img_width], rowHeights=[img_height])
                image_cell.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BACKGROUND', (0, 0), (-1, -1), colors.Color(0.95, 0.96, 0.97)),
                    ('ROUNDEDCORNERS', (0, 0), (-1, -1), [4, 4, 4, 4]),
                ]))

            # Info column - single column like frontend
            staff_str = job.user.get_full_name() if getattr(job.user, 'get_full_name', None) and job.user.get_full_name() else (job.user.username if job.user else 'N/A')
            description_truncated = (job.description[:100] + '...') if job.description and len(job.description) > 100 else (job.description or 'No description')
            remarks_truncated = (job.remarks[:80] + '...') if job.remarks and len(job.remarks) > 80 else (job.remarks or '')
            topics_str = ", ".join([t.title for t in job.topics.all()]) or 'N/A'

            info_rows = [
                [_make_paragraph(f"<font color='#6b7280' size='7'><b>Job ID:</b></font>", styles['ThaiSmall'])],
                [_make_paragraph(f"{_escape_text(str(job.job_id))}", styles['ThaiNormal'])],
                [Spacer(1, 2)],
                [_make_paragraph(f"<font color='#6b7280' size='7'><b>Topics:</b></font>", styles['ThaiSmall'])],
                [_make_paragraph(f"{_escape_text(topics_str)}", styles['ThaiNormal'])],
                [Spacer(1, 2)],
                [_make_paragraph(f"<font color='#6b7280' size='7'><b>Description:</b></font>", styles['ThaiSmall'])],
                [_make_paragraph(f"{_escape_text(description_truncated)}", styles['ThaiNormal'])],
            ]
            
            if remarks_truncated:
                info_rows.extend([
                    [Spacer(1, 2)],
                    [_make_paragraph(f"<font color='#6b7280' size='7'><b>Remarks:</b></font>", styles['ThaiSmall'])],
                    [_make_paragraph(f"{_escape_text(remarks_truncated)}", styles['ThaiNormal'])],
                ])
            
            info_rows.extend([
                [Spacer(1, 2)],
                [_make_paragraph(f"<font color='#6b7280' size='7'><b>Defect by:</b></font>", styles['ThaiSmall'])],
                [_make_paragraph(f"{_escape_text(staff_str)}", styles['ThaiNormal'])],
            ])

            info_table = Table(info_rows, colWidths=[col_widths[1] - 12])
            info_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTNAME', (0, 0), (-1, -1), body_font),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('LEADING', (0, 0), (-1, -1), 11),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))

            # Status/priority column - matching frontend layout
            status_key = (job.status or '').lower()
            priority_key = (job.priority or '').lower()
            status_label = job.get_status_display().upper().replace('_', ' ') if hasattr(job, 'get_status_display') else (job.status or 'UNKNOWN').upper().replace('_', ' ')
            priority_label = (job.priority or 'NORMAL').upper()

            # Status badge with frontend styling
            status_badge_para = Paragraph(
                f"<font color='{status_text_map.get(status_key, colors.grey).hexval()}'><b>{_escape_text(status_label)}</b></font>",
                styles['ThaiSmall']
            )
            status_badge = Table([[status_badge_para]], colWidths=[col_widths[2] - 16])
            status_badge.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), status_bg_map.get(status_key, colors.Color(0.96, 0.96, 0.96))),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('ROUNDEDCORNERS', (0, 0), (-1, -1), [3, 3, 3, 3]),
            ]))

            # Priority badge with frontend styling
            priority_badge_para = Paragraph(
                f"<font color='{priority_text_map.get(priority_key, colors.grey).hexval()}'><b>{_escape_text(priority_label)}</b></font>",
                styles['ThaiSmall']
            )
            priority_badge = Table([[priority_badge_para]], colWidths=[col_widths[2] - 16])
            priority_badge.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), priority_bg_map.get(priority_key, colors.Color(0.96, 0.96, 0.96))),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('ROUNDEDCORNERS', (0, 0), (-1, -1), [3, 3, 3, 3]),
            ]))

            # Date formatting like frontend
            created_txt = job.created_at.strftime('%m/%d/%Y %H:%M') if job.created_at else 'N/A'
            completed_txt = job.completed_at.strftime('%m/%d/%Y %H:%M') if job.completed_at else ''
            location = self._job_location_parts(job)

            # Build status table rows with Location at the top
            status_table_rows = [
                [_make_paragraph('<font color="#6b7280" size="7"><b>Rooms:</b></font>', styles['ThaiSmall'])],
                [_make_paragraph(f'<font size="8">{_escape_text(location["rooms"])}</font>', styles['ThaiNormal'])],
                [Spacer(1, 2)],
                [_make_paragraph('<font color="#6b7280" size="7"><b>Area:</b></font>', styles['ThaiSmall'])],
                [_make_paragraph(f'<font size="8">{_escape_text(location["area"])}</font>', styles['ThaiNormal'])],
                [Spacer(1, 2)],
                [_make_paragraph('<font color="#6b7280" size="7"><b>Floor:</b></font>', styles['ThaiSmall'])],
                [_make_paragraph(f'<font size="8">{_escape_text(location["floor"])}</font>', styles['ThaiNormal'])],
                [Spacer(1, 3)],
            ]
            
            # Status
            status_table_rows.extend([
                [_make_paragraph('<font color="#6b7280" size="7"><b>Status:</b></font>', styles['ThaiSmall'])],
                [status_badge],
                [Spacer(1, 3)],
            ])
            
            # Priority
            status_table_rows.extend([
                [_make_paragraph('<font color="#6b7280" size="7"><b>Priority:</b></font>', styles['ThaiSmall'])],
                [priority_badge],
                [Spacer(1, 3)],
            ])
            
            # Created date
            status_table_rows.extend([
                [_make_paragraph('<font color="#6b7280" size="7"><b>Created:</b></font>', styles['ThaiSmall'])],
                [_make_paragraph(f'<font size="7">{_escape_text(created_txt)}</font>', styles['ThaiSmall'])],
            ])
            
            # Completed date (if exists)
            if completed_txt:
                status_table_rows.extend([
                    [Spacer(1, 2)],
                    [_make_paragraph('<font color="#6b7280" size="7"><b>Completed:</b></font>', styles['ThaiSmall'])],
                    [_make_paragraph(f'<font size="7">{_escape_text(completed_txt)}</font>', styles['ThaiSmall'])],
                ])

            status_table = Table(status_table_rows, colWidths=[col_widths[2] - 12])
            status_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))

            # Card container with alternating backgrounds like frontend
            row_bg_color = colors.white if job_index % 2 == 0 else colors.Color(0.98, 0.98, 0.99)  # #f8f9fa for alternating
            
            card = Table([[image_cell, info_table, status_table]], colWidths=col_widths)
            card.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BACKGROUND', (0, 0), (-1, -1), row_bg_color),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ]))

            story.append(card)
            # Separator line between cards (subtle like frontend)
            sep = Table([['']], colWidths=[usable_width])
            sep.setStyle(TableStyle([
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.Color(0.9, 0.91, 0.92)),  # #e5e7eb
            ]))
            story.append(sep)
            story.append(Spacer(1, 8))

        # Build PDF
        doc.build(story)
        buffer.seek(0)
        filename = f"jobs_{timezone.now().strftime('%Y_%m_%d')}.pdf"
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    export_jobs_pdf.short_description = "Export selected/filtered jobs to PDF"

    def export_jobs_chart_pdf(self, request, queryset):
        """Export dashboard-style charts for selected/filtered jobs to PDF."""
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics.charts.piecharts import Pie
        from reportlab.graphics.charts.barcharts import VerticalBarChart

        qs = queryset.select_related('user', 'area', 'area__property').prefetch_related('rooms', 'topics').order_by('created_at')
        total_jobs = qs.count()

        status_counts = Counter(job.status for job in qs)
        status_labels = [
            ('pending', 'Pending', colors.orange),
            ('in_progress', 'In Progress', colors.blue),
            ('completed', 'Completed', colors.green),
            ('waiting_sparepart', 'Waiting Sparepart', colors.purple),
            ('cancelled', 'Cancelled', colors.red),
        ]
        status_data = []
        status_names = []
        status_colors = []
        for key, label, color in status_labels:
            count = status_counts.get(key, 0)
            if count:
                status_data.append(count)
                status_names.append(f"{label} ({count})")
                status_colors.append(color)

        month_counts = Counter()
        for job in qs:
            if job.created_at:
                month_key = timezone.localtime(job.created_at).strftime('%Y-%m')
                month_counts[month_key] += 1
        month_keys = sorted(month_counts.keys())
        month_labels = [datetime.strptime(m, '%Y-%m').strftime('%b %Y') for m in month_keys]
        month_values = [month_counts[m] for m in month_keys]

        topic_counts = Counter()
        room_counts = Counter()
        area_counts = Counter()
        floor_counts = Counter()
        for job in qs:
            for topic in job.topics.all():
                topic_counts[topic.title] += 1
            for room in job.rooms.all():
                room_counts[room.name] += 1
                floor = self.floor_filter_class._floor_from_room_name(room.name)
                if floor:
                    floor_counts[floor] += 1
            if job.area:
                area_counts[job.area.name] += 1

        top_topics = topic_counts.most_common(10)
        top_rooms = room_counts.most_common(10)
        top_areas = area_counts.most_common(10)
        top_floors = floor_counts.most_common(10)

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=48, bottomMargin=36)
        styles = getSampleStyleSheet()
        story = []

        title = Paragraph("Job Analytics Dashboard", styles['Title'])
        story.append(title)
        story.append(Paragraph(f"Total jobs: {total_jobs}", styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

        if status_data:
            story.append(Paragraph("Jobs by Status", styles['Heading2']))
            drawing = Drawing(400, 220)
            pie = Pie()
            pie.x = 150
            pie.y = 20
            pie.width = 200
            pie.height = 200
            pie.data = status_data
            pie.labels = status_names
            pie.simpleLabels = 1
            for index, color in enumerate(status_colors):
                pie.slices[index].fillColor = color
            drawing.add(pie)
            story.append(drawing)
            story.append(Spacer(1, 0.2 * inch))
        else:
            story.append(Paragraph("No status data available for the selected jobs.", styles['Normal']))
            story.append(Spacer(1, 0.2 * inch))

        if month_values:
            story.append(Paragraph("Jobs Created by Month", styles['Heading2']))
            chart_width = 430
            chart_height = 200
            drawing = Drawing(chart_width, chart_height)
            bar_chart = VerticalBarChart()
            bar_chart.x = 40
            bar_chart.y = 30
            bar_chart.height = 150
            bar_chart.width = 360
            bar_chart.data = [month_values]
            bar_chart.valueAxis.valueMin = 0
            bar_chart.valueAxis.valueMax = max(month_values) + 1
            bar_chart.valueAxis.valueStep = max(1, int((bar_chart.valueAxis.valueMax) / 5))
            bar_chart.categoryAxis.categoryNames = month_labels
            bar_chart.categoryAxis.labels.boxAnchor = 'ne'
            bar_chart.categoryAxis.labels.angle = 45
            bar_chart.bars[0].fillColor = colors.HexColor('#3b82f6')
            drawing.add(bar_chart)
            story.append(drawing)
            story.append(Spacer(1, 0.2 * inch))
        else:
            story.append(Paragraph("No monthly data available for the selected jobs.", styles['Normal']))
            story.append(Spacer(1, 0.2 * inch))

        story.append(PageBreak())
        story.append(Paragraph("Top Topics, Rooms, Areas & Floors", styles['Heading2']))

        topics_table_data = [['Topic', 'Jobs']]
        for name, count in top_topics:
            topics_table_data.append([name, str(count)])
        if len(topics_table_data) == 1:
            topics_table_data.append(['No topics available', '0'])

        rooms_table_data = [['Room', 'Jobs']]
        for name, count in top_rooms:
            rooms_table_data.append([name, str(count)])
        if len(rooms_table_data) == 1:
            rooms_table_data.append(['No rooms available', '0'])

        areas_table_data = [['Area', 'Jobs']]
        for name, count in top_areas:
            areas_table_data.append([name, str(count)])
        if len(areas_table_data) == 1:
            areas_table_data.append(['No areas available', '0'])

        floors_table_data = [['Floor', 'Jobs']]
        for name, count in top_floors:
            floors_table_data.append([name, str(count)])
        if len(floors_table_data) == 1:
            floors_table_data.append(['No floors available', '0'])

        topics_table = Table(topics_table_data, colWidths=[3.5 * inch, 1 * inch])
        rooms_table = Table(rooms_table_data, colWidths=[3.5 * inch, 1 * inch])
        areas_table = Table(areas_table_data, colWidths=[3.5 * inch, 1 * inch])
        floors_table = Table(floors_table_data, colWidths=[3.5 * inch, 1 * inch])

        table_style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ])
        topics_table.setStyle(table_style)
        rooms_table.setStyle(table_style)
        areas_table.setStyle(table_style)
        floors_table.setStyle(table_style)

        story.append(Paragraph("Top Topics", styles['Heading3']))
        story.append(topics_table)
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph("Top Rooms", styles['Heading3']))
        story.append(rooms_table)
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph("Top Areas", styles['Heading3']))
        story.append(areas_table)
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph("Top Floors", styles['Heading3']))
        story.append(floors_table)

        doc.build(story)
        buffer.seek(0)
        filename = f"job_dashboard_charts_{timezone.now().strftime('%Y_%m_%d')}.pdf"
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    export_jobs_chart_pdf.short_description = "Export selected/filtered jobs dashboard charts to PDF"

    def export_jobs_csv(self, request, queryset):
        """Export selected/filtered jobs to CSV"""
        import csv
        from django.utils import timezone
        
        # Prefetch related data to avoid N+1 queries
        qs = queryset.select_related('user', 'area', 'area__property').prefetch_related('rooms__properties', 'rooms', 'topics', 'job_images').order_by('created_at')
        
        # Create the HttpResponse object with CSV header
        filename = f"jobs_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        writer = csv.writer(response)
        
        # Write header row
        writer.writerow([
            'Job ID',
            'Description',
            'Status',
            'Priority',
            'Defect by',
            'Topics',
            'Rooms (Room Type - Room Name)',
            'Area',
            'Floor',
            'Properties',
            'Remarks',
            'Is Defective',
            'Is Preventive Maintenance',
            'Created At',
            'Updated At',
            'Completed At',
            'Image URLs',
            'Image Formulas (Excel/Google Sheets)',
            'Image Export Notes',
        ])
        
        # Write data rows
        for job in qs:
            # Get user info
            user_info = ''
            if job.user:
                user_info = f"{job.user.username}"
                if job.user.first_name or job.user.last_name:
                    user_info += f" ({job.user.first_name} {job.user.last_name})".strip()
            
            # Get topics
            topics = ", ".join([t.title for t in job.topics.all()])
            
            # Get rooms, area, and floor using the same location helper as the admin/PDF views
            rooms = ", ".join([f"{r.room_type} - {r.name}" for r in job.rooms.all()])
            location = self._job_location_parts(job)
            area = location['area'] if location['area'] != '-' else ''
            floor = location['floor'] if location['floor'] != '-' else ''
            
            # Get properties
            properties = []
            if job.rooms.exists():
                for room in job.rooms.all():
                    for prop in room.properties.all():
                        prop_display = f"{prop.property_id} - {prop.name}"
                        if prop_display not in properties:
                            properties.append(prop_display)
            if job.area and job.area.property:
                prop_display = f"{job.area.property.property_id} - {job.area.property.name}"
                if prop_display not in properties:
                    properties.append(prop_display)
            properties_str = ", ".join(properties)
            
            # Format dates
            created_at = job.created_at.strftime('%Y-%m-%d %H:%M:%S') if job.created_at else ''
            updated_at = job.updated_at.strftime('%Y-%m-%d %H:%M:%S') if job.updated_at else ''
            completed_at = job.completed_at.strftime('%Y-%m-%d %H:%M:%S') if job.completed_at else ''
            
            # Get status display
            status = job.get_status_display() if hasattr(job, 'get_status_display') else job.status
            priority = job.get_priority_display() if hasattr(job, 'get_priority_display') else job.priority

            # CSV files cannot embed binary images, so include absolute image URLs
            # plus IMAGE formulas for spreadsheet apps that support rendering them.
            image_urls = [
                _absolute_file_url(request, image.image)
                for image in job.job_images.all()
                if image.image
            ]
            image_urls = [url for url in image_urls if url]
            image_formulas = [_spreadsheet_image_formula(url) for url in image_urls]
            
            writer.writerow([
                job.job_id,
                job.description or '',
                status,
                priority,
                user_info,
                topics,
                rooms,
                area,
                floor,
                properties_str,
                job.remarks or '',
                'Yes' if job.is_defective else 'No',
                'Yes' if job.is_preventivemaintenance else 'No',
                created_at,
                updated_at,
                completed_at,
                '\n'.join(image_urls),
                '\n'.join(image_formulas),
                _image_export_note(len(image_urls)),
            ])
        
        return response
    export_jobs_csv.short_description = "Export selected/filtered jobs to CSV"

    def export_jobs_google_sheets_csv(self, request, queryset):
        """Export jobs as a Google Sheets-friendly CSV with IMAGE formulas."""
        response = self.export_jobs_csv(request, queryset)
        response['Content-Disposition'] = response['Content-Disposition'].replace('jobs_', 'jobs_google_sheets_')
        return response
    export_jobs_google_sheets_csv.short_description = "Export selected/filtered jobs to Google Sheets CSV"

    def export_jobs_excel(self, request, queryset):
        """Export selected/filtered jobs to Excel and embed the first job image."""
        import importlib

        openpyxl = importlib.import_module('openpyxl')
        drawing_image = importlib.import_module('openpyxl.drawing.image')
        get_column_letter = importlib.import_module('openpyxl.utils').get_column_letter

        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = 'Jobs'

        qs = list(queryset.select_related('user', 'area', 'area__property').prefetch_related(
            'rooms__properties', 'rooms', 'topics', 'job_images'
        ).order_by('created_at'))
        max_image_count = max(
            (sum(1 for image in job.job_images.all() if image.image) for job in qs),
            default=0,
        )
        image_preview_headers = [
            f'Image Preview {index}' for index in range(1, max_image_count + 1)
        ] or ['Image Preview']

        headers = [
            'Job ID', 'Description', 'Status', 'Priority', 'Defect by',
            'Topics', 'Rooms (Room Type - Room Name)', 'Area', 'Floor',
            'Properties', 'Remarks', 'Is Defective', 'Is Preventive Maintenance',
            'Created At', 'Updated At', 'Completed At', *image_preview_headers, 'Image URLs',
            'Image Export Notes',
        ]
        sheet.append(headers)
        sheet.freeze_panes = 'A2'
        sheet.row_dimensions[1].height = 24

        image_columns = [
            headers.index(image_preview_header) + 1
            for image_preview_header in image_preview_headers
        ]
        image_url_column = headers.index('Image URLs') + 1
        note_column = headers.index('Image Export Notes') + 1
        for image_column in image_columns:
            sheet.column_dimensions[get_column_letter(image_column)].width = 22
        sheet.column_dimensions[get_column_letter(image_url_column)].width = 55
        sheet.column_dimensions[get_column_letter(note_column)].width = 55

        converted_image_buffers = []

        for row_index, job in enumerate(qs, start=2):
            user_info = ''
            if job.user:
                user_info = f"{job.user.username}"
                if job.user.first_name or job.user.last_name:
                    user_info += f" ({job.user.first_name} {job.user.last_name})".strip()

            topics = ", ".join([t.title for t in job.topics.all()])
            rooms = ", ".join([f"{r.room_type} - {r.name}" for r in job.rooms.all()])
            location = self._job_location_parts(job)
            area = location['area'] if location['area'] != '-' else ''
            floor = location['floor'] if location['floor'] != '-' else ''

            properties = []
            if job.rooms.exists():
                for room in job.rooms.all():
                    for prop in room.properties.all():
                        prop_display = f"{prop.property_id} - {prop.name}"
                        if prop_display not in properties:
                            properties.append(prop_display)
            if job.area and job.area.property:
                prop_display = f"{job.area.property.property_id} - {job.area.property.name}"
                if prop_display not in properties:
                    properties.append(prop_display)

            created_at = job.created_at.strftime('%Y-%m-%d %H:%M:%S') if job.created_at else ''
            updated_at = job.updated_at.strftime('%Y-%m-%d %H:%M:%S') if job.updated_at else ''
            completed_at = job.completed_at.strftime('%Y-%m-%d %H:%M:%S') if job.completed_at else ''
            status = job.get_status_display() if hasattr(job, 'get_status_display') else job.status
            priority = job.get_priority_display() if hasattr(job, 'get_priority_display') else job.priority

            images = [image for image in job.job_images.all() if image.image]
            image_urls = [_absolute_file_url(request, image.image) for image in images]
            image_urls = [url for url in image_urls if url]

            image_preview_values = ['Embedded' if image_index < len(images) else '' for image_index in range(len(image_preview_headers))]
            if not images:
                image_preview_values[0] = 'No image'

            sheet.append([
                job.job_id, job.description or '', status, priority, user_info,
                topics, rooms, area, floor, ", ".join(properties), job.remarks or '',
                'Yes' if job.is_defective else 'No',
                'Yes' if job.is_preventivemaintenance else 'No',
                created_at, updated_at, completed_at,
                *image_preview_values,
                '\n'.join(image_urls),
                _image_export_note(len(image_urls)),
            ])
            sheet.row_dimensions[row_index].height = 90 if images else 22

            for image_index, job_image in enumerate(images):
                if image_index >= len(image_columns):
                    break
                image_column = image_columns[image_index]
                if not hasattr(job_image.image, 'path') or not os.path.exists(job_image.image.path):
                    sheet.cell(row=row_index, column=image_column).value = 'Image URL only (file not available)'
                    continue
                try:
                    excel_image, converted_buffer = _excel_image_for_export(job_image.image.path, drawing_image.Image)
                    if converted_buffer is not None:
                        # openpyxl reads image data while saving, so keep the
                        # converted in-memory PNG alive until workbook.save().
                        converted_image_buffers.append(converted_buffer)
                    excel_image.width = 120
                    excel_image.height = 90
                    sheet.add_image(excel_image, f'{get_column_letter(image_column)}{row_index}')
                except Exception:
                    # Keep the admin action usable if an individual upload is
                    # unreadable/corrupt while still exporting the URL.
                    sheet.cell(row=row_index, column=image_column).value = 'Image URL only (unsupported Excel preview)'

        for column_index, header in enumerate(headers, start=1):
            if column_index not in {*image_columns, image_url_column, note_column}:
                sheet.column_dimensions[get_column_letter(column_index)].width = min(max(len(header) + 2, 14), 35)

        buffer = BytesIO()
        workbook.save(buffer)
        buffer.seek(0)

        filename = f"jobs_{timezone.now().strftime('%Y_%m_%d_%H%M')}.xlsx"
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    export_jobs_excel.short_description = "Export selected/filtered jobs to Excel with image previews"


class JobImageExportMixin:
    """JobImage admin export behavior."""

    def export_jobimages_csv(self, request, queryset):
        """Export selected/filtered job images to CSV"""
        qs = queryset.select_related('job', 'uploaded_by').order_by('uploaded_at')
        
        filename = f"job_images_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Job ID',
            'Image URL',
            'Image Formula (Excel/Google Sheets)',
            'Image Export Note',
            'Uploaded By',
            'Uploaded By Email',
            'Uploaded At',
        ])
        
        for img in qs:
            writer.writerow([
                img.id,
                img.job.job_id if img.job else '',
                _absolute_file_url(request, img.image),
                _spreadsheet_image_formula(_absolute_file_url(request, img.image)),
                _image_export_note(1 if _absolute_file_url(request, img.image) else 0),
                img.uploaded_by.username if img.uploaded_by else '',
                img.uploaded_by.email if img.uploaded_by else '',
                img.uploaded_at.strftime('%Y-%m-%d %H:%M:%S') if img.uploaded_at else '',
            ])
        
        return response
    export_jobimages_csv.short_description = "Export selected/filtered job images to CSV"

