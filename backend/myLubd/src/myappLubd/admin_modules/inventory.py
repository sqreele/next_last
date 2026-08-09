import base64
import csv
import os
import re
from io import BytesIO

import qrcode
from django.conf import settings
from django.contrib import admin
from django.db.models import Q
from django.http import HttpResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html, format_html_join

from ..models import Inventory, InventoryUsage
from .filters import (
    CreatedAtMonthFilter,
    ExpiryDateMonthFilter,
    LastRestockedMonthFilter,
    UpdatedAtMonthFilter,
)

@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_per_page = 27
    list_display = [
        'image_preview',
        'item_id',
        'name',
        'category',
        'quantity',
        'unit',
        'min_quantity',
        'status',
        'property_link',
        'room_link',
        'last_job_by_user',
        'last_pm_by_user',
        'job_links',
        'pm_links',
        'location',
        'unit_price',
        'last_restocked',
        'expiry_date',
        'created_by',
        'created_at',
        'updated_at'
    ]
    list_filter = [
        'status',
        'category',
        'property',
        'room',
        ('jobs', admin.RelatedOnlyFieldListFilter),
        ('preventive_maintenances', admin.RelatedOnlyFieldListFilter),
        'created_at',
        CreatedAtMonthFilter,
        'updated_at',
        UpdatedAtMonthFilter,
        'last_restocked',
        LastRestockedMonthFilter,
        'expiry_date',
        ExpiryDateMonthFilter,
    ]
    search_fields = [
        'item_id',
        'name',
        'description',
        'location',
        'supplier',
        'supplier_contact',
        'property__name',
        'property__property_id',
        'room__name',
        'room__room_id',
        'jobs__job_id',
        'preventive_maintenances__pm_id'
    ]
    readonly_fields = [
        'item_id',
        'created_at',
        'updated_at',
        'status_display',
        'qr_code_preview',
        'image_preview_large'
    ]
    raw_id_fields = ['property', 'room', 'created_by']
    filter_horizontal = ['jobs', 'preventive_maintenances']
    
    fieldsets = (
        ('Item Information', {
            'fields': ('item_id', 'name', 'description', 'category', 'status', 'status_display')
        }),
        ('Item Image', {
            'fields': ('image', 'image_preview_large'),
            'description': 'Upload an image of the inventory item'
        }),
        ('Quantity & Pricing', {
            'fields': ('quantity', 'min_quantity', 'max_quantity', 'unit', 'unit_price')
        }),
        ('Location & Storage', {
            'fields': ('property', 'room', 'location', 'expiry_date')
        }),
        ('Related Jobs & Maintenance', {
            'fields': ('jobs', 'preventive_maintenances'),
            'description': 'Link this inventory item to jobs or preventive maintenance tasks'
        }),
        ('Supplier Information', {
            'fields': ('supplier', 'supplier_contact', 'last_restocked')
        }),
        ('Additional Notes', {
            'fields': ('notes',)
        }),
        ('QR Code', {
            'fields': ('qr_code_preview',),
            'description': 'QR code for quick access to this inventory item\'s details page'
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at')
        }),
    )
    
    def property_link(self, obj):
        if obj.property:
            from django.urls import reverse
            link = reverse("admin:myappLubd_property_change", args=[obj.property.id])
            return format_html('<a href="{}">{}</a>', link, obj.property.name)
        return "No Property"
    property_link.short_description = 'Property'
    property_link.admin_order_field = 'property'
    
    def room_link(self, obj):
        if obj.room:
            try:
                from django.urls import reverse
                # Room model uses room_id as primary key, not id
                room_pk = obj.room.room_id
                if room_pk:
                    link = reverse("admin:myappLubd_room_change", args=[room_pk])
                    return format_html('<a href="{}">{}</a>', link, obj.room.name)
            except (AttributeError, ValueError, TypeError):
                pass
        return "No Room"
    room_link.short_description = 'Room'
    room_link.admin_order_field = 'room__room_id'
    
    def image_preview(self, obj):
        """Display small image preview in list view"""
        if obj.image and hasattr(obj.image, 'url'):
            return format_html(
                '<img src="{}" style="max-width: 50px; max-height: 50px; object-fit: cover; border-radius: 4px;" />',
                obj.image.url
            )
        return format_html('<span style="color: #999;">No Image</span>')
    image_preview.short_description = 'Image'
    
    def image_preview_large(self, obj):
        """Display larger image preview in detail view"""
        if obj.image and hasattr(obj.image, 'url'):
            return format_html(
                '<img src="{}" style="max-width: 400px; max-height: 400px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />',
                obj.image.url
            )
        return format_html('<p style="color: #999;">No image uploaded</p>')
    image_preview_large.short_description = 'Image Preview'
    
    def job_links(self, obj):
        jobs = obj.jobs.all()
        total_jobs = jobs.count()
        if total_jobs == 0:
            return "No Jobs"
        
        display_jobs = list(jobs[:3])
        links = [
            format_html(
                '<a href="{}">{}</a>',
                reverse("admin:myappLubd_job_change", args=[job.id]),
                job.job_id
            )
            for job in display_jobs
        ]
        
        remaining = total_jobs - len(display_jobs)
        if remaining > 0:
            links.append(format_html('<span style="color:#999;">+{} more</span>', remaining))
        
        return format_html_join(', ', '{}', ((link,) for link in links))
    job_links.short_description = 'Jobs'
    
    def pm_links(self, obj):
        pms = obj.preventive_maintenances.all()
        total_pms = pms.count()
        if total_pms == 0:
            return "No PMs"
        
        display_pms = list(pms[:3])
        links = [
            format_html(
                '<a href="{}">{}</a>',
                reverse("admin:myappLubd_preventivemaintenance_change", args=[pm.id]),
                pm.pm_id
            )
            for pm in display_pms
        ]
        
        remaining = total_pms - len(display_pms)
        if remaining > 0:
            links.append(format_html('<span style="color:#999;">+{} more</span>', remaining))
        
        return format_html_join(', ', '{}', ((link,) for link in links))
    pm_links.short_description = 'Preventive Maintenance'
    
    def last_job_by_user(self, obj):
        """Show the last job that used this inventory item, filtered by current user"""
        if not hasattr(self, '_request_user'):
            return "N/A"
        
        user = self._request_user
        if not user:
            return "N/A"
        
        user_job = obj.jobs.filter(user=user).order_by('-updated_at').first()
        if user_job:
            link = reverse("admin:myappLubd_job_change", args=[user_job.id])
            job_name = user_job.description[:30] + "..." if len(user_job.description) > 30 else user_job.description
            return format_html(
                '<a href="{}" title="{}">{} ({})</a>',
                link,
                user_job.description,
                user_job.job_id,
                job_name
            )
        
        from .models import Inventory
        last_inventory = (
            Inventory.objects.filter(
                jobs__user=user,
                item_id=obj.item_id
            )
            .order_by('-updated_at')
            .prefetch_related('jobs')
            .first()
        )
        
        if last_inventory:
            related_job = (
                last_inventory.jobs.filter(user=user)
                .order_by('-updated_at')
                .first()
            )
            if related_job:
                link = reverse("admin:myappLubd_job_change", args=[related_job.id])
                job_name = related_job.description[:30] + "..." if len(related_job.description) > 30 else related_job.description
                return format_html(
                    '<a href="{}" title="{}">{} ({})</a>',
                    link,
                    related_job.description,
                    related_job.job_id,
                    job_name
                )
        
        return "No job"
    last_job_by_user.short_description = 'Last Job (My User)'
    
    def last_pm_by_user(self, obj):
        """Show the last PM that used this inventory item, filtered by current user"""
        if not hasattr(self, '_request_user'):
            return "N/A"
        
        user = self._request_user
        if not user:
            return "N/A"
        
        pm_qs = obj.preventive_maintenances.filter(
            Q(assigned_to=user) | Q(created_by=user)
        ).order_by('-updated_at')
        pm = pm_qs.first()
        if pm:
            link = reverse("admin:myappLubd_preventivemaintenance_change", args=[pm.id])
            pm_title = pm.pmtitle[:30] + "..." if len(pm.pmtitle) > 30 else pm.pmtitle
            return format_html(
                '<a href="{}" title="{}">{} ({})</a>',
                link,
                pm.pmtitle,
                pm.pm_id,
                pm_title
            )
        
        from .models import Inventory
        last_inventory = (
            Inventory.objects.filter(
                preventive_maintenances__isnull=False,
                item_id=obj.item_id
            )
            .filter(
                Q(preventive_maintenances__assigned_to=user) |
                Q(preventive_maintenances__created_by=user)
            )
            .order_by('-updated_at')
            .prefetch_related('preventive_maintenances')
            .first()
        )
        
        if last_inventory:
            pm = (
                last_inventory.preventive_maintenances.filter(
                    Q(assigned_to=user) | Q(created_by=user)
                )
                .order_by('-updated_at')
                .first()
            )
            if pm:
                link = reverse("admin:myappLubd_preventivemaintenance_change", args=[pm.id])
                pm_title = pm.pmtitle[:30] + "..." if len(pm.pmtitle) > 30 else pm.pmtitle
                return format_html(
                    '<a href="{}" title="{}">{} ({})</a>',
                    link,
                    pm.pmtitle,
                    pm.pm_id,
                    pm_title
                )
        
        return "No PM"
    last_pm_by_user.short_description = 'Last PM (My User)'
    
    def status_display(self, obj):
        """Display status with color coding"""
        status_colors = {
            'available': 'green',
            'low_stock': 'orange',
            'out_of_stock': 'red',
            'reserved': 'blue',
            'maintenance': 'purple'
        }
        color = status_colors.get(obj.status, 'black')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display()
        )
    status_display.short_description = 'Status'
    
    def get_queryset(self, request):
        # Store request user for use in list_display methods
        self._request_user = request.user
        return (
            super()
            .get_queryset(request)
            .select_related('property', 'room', 'created_by')
            .prefetch_related(
                'jobs__user',
                'preventive_maintenances__assigned_to',
                'preventive_maintenances__created_by'
            )
        )
    
    def get_inventory_url(self, obj):
        """Generate the frontend URL for this inventory item"""
        if not obj or not obj.item_id:
            return ''
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3000')
        # Link to inventory page with search parameter for item_id
        return f"{frontend_url}/dashboard/inventory?search={obj.item_id}"
    
    def qr_code_preview(self, obj):
        """Display QR code preview in admin"""
        if not obj or not obj.item_id:
            return format_html('<p style="color: #999;">Save the inventory item first to generate QR code</p>')
        
        try:
            inventory_url = self.get_inventory_url(obj)
            if not inventory_url:
                return format_html('<p style="color: #999;">Unable to generate QR code</p>')
            
            # Generate QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            qr.add_data(inventory_url)
            qr.make(fit=True)
            
            # Create image
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Convert to base64 for display
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            img_str = base64.b64encode(buffer.getvalue()).decode()
            
            # Generate download link
            download_url = reverse('admin:inventory_qr_code_download', args=[obj.pk])
            
            return format_html(
                '<div style="text-align: center; padding: 20px;">'
                '<img src="data:image/png;base64,{}" style="max-width: 200px; border: 2px solid #ddd; padding: 10px; background: white;" /><br/>'
                '<p style="margin-top: 10px; font-size: 11px; color: #666; word-break: break-all;">{}</p>'
                '<a href="{}" style="display: inline-block; margin-top: 10px; padding: 8px 16px; background: #417690; color: white; text-decoration: none; border-radius: 4px;">Download QR Code</a>'
                '</div>',
                img_str,
                inventory_url,
                download_url
            )
        except Exception as e:
            return format_html('<p style="color: red;">Error generating QR code: {}</p>', str(e))
    qr_code_preview.short_description = 'QR Code'
    
    def get_urls(self):
        """Add custom URL for QR code download"""
        urls = super().get_urls()
        custom_urls = [
            path(
                '<int:object_id>/qr-code/download/',
                self.admin_site.admin_view(self.download_qr_code),
                name='inventory_qr_code_download',
            ),
        ]
        return custom_urls + urls
    
    def download_qr_code(self, request, object_id):
        """Download QR code as PNG file"""
        try:
            inventory = Inventory.objects.get(pk=object_id)
            inventory_url = self.get_inventory_url(inventory)
            
            if not inventory_url:
                return HttpResponse("Unable to generate QR code: Invalid inventory URL", status=400)
            
            # Generate QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            qr.add_data(inventory_url)
            qr.make(fit=True)
            
            # Create image
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Save to BytesIO
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            buffer.seek(0)
            
            # Create HTTP response
            response = HttpResponse(buffer.getvalue(), content_type='image/png')
            response['Content-Disposition'] = f'attachment; filename="inventory-{inventory.item_id}-qr-code.png"'
            return response
        except Inventory.DoesNotExist:
            return HttpResponse("Inventory item not found", status=404)
        except Exception as e:
            return HttpResponse(f"Error generating QR code: {str(e)}", status=500)
    
    def save_model(self, request, obj, form, change):
        if not obj.pk and not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
    
    actions = ['mark_as_available', 'mark_as_low_stock', 'mark_as_out_of_stock', 'export_inventory_csv', 'export_inventory_pdf']
    
    def export_inventory_pdf(self, request, queryset):
        """Export selected/filtered inventory items to PDF with image, dates, quantities, status, and last update user."""
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.lib import colors
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont
        except Exception:
            self.message_user(request, 'ReportLab is required for PDF export. Install with: pip install reportlab', level='error')
            return None

        import os
        from django.conf import settings
        from xml.sax.saxutils import escape as xml_escape

        # Prefetch related data to avoid N+1 queries
        qs = queryset.select_related('property', 'room', 'created_by').prefetch_related(
            'jobs__user',
            'jobs__updated_by',
            'preventive_maintenances__assigned_to',
            'preventive_maintenances__created_by'
        ).order_by('item_id')

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
                (
                    os.path.join(getattr(settings, 'STATIC_ROOT', ''), 'fonts', 'Sarabun-Regular.ttf'),
                    os.path.join(getattr(settings, 'STATIC_ROOT', ''), 'fonts', 'Sarabun-Bold.ttf'),
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                (
                    '/app/static/fonts/Sarabun-Regular.ttf',
                    '/app/static/fonts/Sarabun-Bold.ttf',
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                (
                    '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf',
                    '/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf',
                    'NotoSansThai-Regular',
                    'NotoSansThai-Bold'
                ),
                (
                    os.path.join(base_dir, 'static', 'fonts', 'Sarabun-Regular.ttf'),
                    os.path.join(base_dir, 'static', 'fonts', 'Sarabun-Bold.ttf'),
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
                (
                    os.path.join(project_root, 'static_volume', 'fonts', 'Sarabun-Regular.ttf'),
                    os.path.join(project_root, 'static_volume', 'fonts', 'Sarabun-Bold.ttf'),
                    'Sarabun-Regular',
                    'Sarabun-Bold'
                ),
            ]
            for reg, bold, reg_name, bold_name in candidates:
                try:
                    if reg and bold and os.path.isfile(reg) and os.path.isfile(bold):
                        from reportlab.pdfbase.pdfmetrics import getRegisteredFontNames
                        registered_fonts = getRegisteredFontNames()
                        
                        if reg_name not in registered_fonts:
                            pdfmetrics.registerFont(TTFont(reg_name, reg))
                        if bold_name not in registered_fonts:
                            pdfmetrics.registerFont(TTFont(bold_name, bold))
                        
                        family_name = reg_name.rsplit('-', 1)[0] if '-' in reg_name else reg_name
                        
                        try:
                            pdfmetrics.getFont(reg_name)
                            pdfmetrics.getFont(bold_name)
                            try:
                                pdfmetrics.registerFontFamily(
                                    family_name,
                                    normal=reg_name,
                                    bold=bold_name,
                                    italic=reg_name,
                                    boldItalic=bold_name,
                                )
                            except Exception:
                                pass
                        except Exception:
                            pass
                        
                        thai_regular, thai_bold = reg_name, bold_name
                        thai_family = family_name
                        break
                except Exception:
                    continue

        register_thai_fonts()

        # Add Thai-capable styles
        if thai_regular and thai_bold:
            styles.add(ParagraphStyle(name='ThaiTitle', parent=styles['Title'], fontName=thai_bold))
            styles.add(ParagraphStyle(name='ThaiHeading2', parent=styles['Heading2'], fontName=thai_bold))
            styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], fontName=thai_regular, fontSize=9, leading=11, wordWrap='CJK'))
            styles.add(ParagraphStyle(name='ThaiSmall', parent=styles['Normal'], fontName=thai_regular, fontSize=8, leading=10, wordWrap='CJK'))
            styles['ThaiNormal'].allowMarkup = False
            styles['ThaiSmall'].allowMarkup = False
        else:
            styles.add(ParagraphStyle(name='ThaiTitle', parent=styles['Title']))
            styles.add(ParagraphStyle(name='ThaiHeading2', parent=styles['Heading2']))
            styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], fontSize=9, leading=11))
            styles.add(ParagraphStyle(name='ThaiSmall', parent=styles['Normal'], fontSize=8, leading=10))
            styles['ThaiNormal'].allowMarkup = True
            styles['ThaiSmall'].allowMarkup = True

        story = []

        def _escape_text(text):
            return xml_escape(str(text) if text else '')

        def _make_paragraph(text, style, allow_markup=None):
            if allow_markup is None:
                allow_markup = getattr(style, 'allowMarkup', True)
            if not allow_markup:
                import re
                text = re.sub(r'<[^>]+>', '', text)
            return Paragraph(text, style)

        # Layout helpers
        page_width, _page_height = A4
        usable_width = page_width - doc.leftMargin - doc.rightMargin

        # Header
        now_display = timezone.now().strftime('%Y-%m-%d %H:%M')
        story.append(Paragraph("Part Inventory Report", styles['ThaiTitle']))
        story.append(_make_paragraph(f"Generated: {now_display}", styles['ThaiNormal']))
        story.append(Spacer(1, 12))

        # Statistics Section
        total_items = qs.count()
        available = qs.filter(status='available').count()
        low_stock = qs.filter(status='low_stock').count()
        out_of_stock = qs.filter(status='out_of_stock').count()
        reserved = qs.filter(status='reserved').count()

        # Statistics header
        metadata_data = [
            [
                _make_paragraph(f"<b>Total Items:</b> {total_items}", styles['ThaiSmall']),
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
        ]))
        story.append(metadata_table)
        story.append(Spacer(1, 10))

        # Statistics boxes
        stat_data = [
            [
                _make_paragraph(f"<b>{available}</b><br/><font size='8'>Available</font>", styles['ThaiSmall']),
                _make_paragraph(f"<b>{low_stock}</b><br/><font size='8'>Low Stock</font>", styles['ThaiSmall']),
                _make_paragraph(f"<b>{out_of_stock}</b><br/><font size='8'>Out of Stock</font>", styles['ThaiSmall']),
                _make_paragraph(f"<b>{reserved}</b><br/><font size='8'>Reserved</font>", styles['ThaiSmall']),
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
        ]))
        story.append(stat_table)
        story.append(Spacer(1, 15))

        # Column widths: image 18%, info 42%, status/dates 40%
        col_widths = [usable_width * 0.18, usable_width * 0.42, usable_width * 0.40]

        body_font = thai_regular or 'Helvetica'

        # Status colors
        status_bg_map = {
            'available': colors.Color(0.09, 0.64, 0.29, alpha=0.15),      # green
            'low_stock': colors.Color(0.92, 0.35, 0.05, alpha=0.15),      # orange
            'out_of_stock': colors.Color(0.86, 0.15, 0.15, alpha=0.15),   # red
            'reserved': colors.Color(0.15, 0.39, 0.92, alpha=0.15),       # blue
            'maintenance': colors.Color(0.49, 0.23, 0.93, alpha=0.15),    # purple
        }
        status_text_map = {
            'available': colors.Color(0.09, 0.64, 0.29),
            'low_stock': colors.Color(0.92, 0.35, 0.05),
            'out_of_stock': colors.Color(0.86, 0.15, 0.15),
            'reserved': colors.Color(0.15, 0.39, 0.92),
            'maintenance': colors.Color(0.49, 0.23, 0.93),
        }

        def _get_item_image_path(item):
            """Get the image path for an inventory item"""
            if item.image and hasattr(item.image, 'path'):
                img_path = item.image.path
                if os.path.isfile(img_path):
                    return img_path
            return None

        def _get_user_display_name(user):
            """Get the display name for a user, preferring full name over username"""
            if not user:
                return None
            # Try to get full name first
            full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
            if full_name:
                return full_name
            # Fallback to username only if it doesn't look like an OAuth2 ID
            if user.username and not user.username.startswith(('google-oauth2_', 'auth0|')):
                return user.username
            # If username is an OAuth2 ID and we have email, use email prefix
            if user.email:
                return user.email.split('@')[0]
            return user.username

        def _get_last_update_user(item):
            """Get the display name of the last user who updated this item via Job, PM, or created_by"""
            last_user = None
            last_time = None
            
            # Check jobs - prefer updated_by, fallback to user
            last_job = item.jobs.order_by('-updated_at').first()
            if last_job:
                job_user = last_job.updated_by or last_job.user
                if job_user:
                    last_user = _get_user_display_name(job_user)
                    last_time = last_job.updated_at
            
            # Check PMs
            last_pm = item.preventive_maintenances.order_by('-updated_at').first()
            if last_pm:
                pm_user = last_pm.assigned_to or last_pm.created_by
                if pm_user and (last_time is None or (last_pm.updated_at and last_pm.updated_at > last_time)):
                    last_user = _get_user_display_name(pm_user)
            
            # Fallback to the inventory item's created_by if no job/PM user found
            if not last_user and item.created_by:
                last_user = _get_user_display_name(item.created_by)
            
            return last_user or 'N/A'

        # Card renderer for each inventory item
        for item_index, item in enumerate(qs):
            # Image cell
            img_width = col_widths[0] - 12
            img_height = 70
            img_path = _get_item_image_path(item)
            if img_path:
                try:
                    image_cell = Image(img_path, width=img_width, height=img_height)
                except Exception:
                    image_cell = Table([[Paragraph('No Image', styles['ThaiSmall'])]], colWidths=[img_width], rowHeights=[img_height])
                    image_cell.setStyle(TableStyle([
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('BACKGROUND', (0, 0), (-1, -1), colors.Color(0.95, 0.96, 0.97)),
                    ]))
            else:
                image_cell = Table([[Paragraph('No Image', styles['ThaiSmall'])]], colWidths=[img_width], rowHeights=[img_height])
                image_cell.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BACKGROUND', (0, 0), (-1, -1), colors.Color(0.95, 0.96, 0.97)),
                ]))

            # Info column
            item_name = item.name or 'Unnamed'
            item_desc = (item.description[:80] + '...') if item.description and len(item.description) > 80 else (item.description or '')
            category = item.get_category_display() if hasattr(item, 'get_category_display') else item.category or ''
            property_name = item.property.name if item.property else 'N/A'
            room_name = item.room.name if item.room else 'N/A'
            location = item.location or 'N/A'

            info_rows = [
                [_make_paragraph(f"<font color='#6b7280' size='7'><b>Item ID:</b></font>", styles['ThaiSmall'])],
                [_make_paragraph(f"{_escape_text(str(item.item_id))}", styles['ThaiNormal'])],
                [Spacer(1, 2)],
                [_make_paragraph(f"<font color='#6b7280' size='7'><b>Name:</b></font>", styles['ThaiSmall'])],
                [_make_paragraph(f"{_escape_text(item_name)}", styles['ThaiNormal'])],
                [Spacer(1, 2)],
                [_make_paragraph(f"<font color='#6b7280' size='7'><b>Category:</b></font>", styles['ThaiSmall'])],
                [_make_paragraph(f"{_escape_text(category)}", styles['ThaiNormal'])],
            ]

            if item_desc:
                info_rows.extend([
                    [Spacer(1, 2)],
                    [_make_paragraph(f"<font color='#6b7280' size='7'><b>Description:</b></font>", styles['ThaiSmall'])],
                    [_make_paragraph(f"{_escape_text(item_desc)}", styles['ThaiNormal'])],
                ])

            info_rows.extend([
                [Spacer(1, 2)],
                [_make_paragraph(f"<font color='#6b7280' size='7'><b>Location:</b></font>", styles['ThaiSmall'])],
                [_make_paragraph(f"{_escape_text(property_name)} / {_escape_text(room_name)}", styles['ThaiNormal'])],
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

            # Status/dates column
            status_key = (item.status or '').lower()
            status_label = item.get_status_display().upper().replace('_', ' ') if hasattr(item, 'get_status_display') else (item.status or 'UNKNOWN').upper().replace('_', ' ')

            # Status badge
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
            ]))

            # Date/quantity formatting
            created_txt = item.created_at.strftime('%m/%d/%Y %H:%M') if item.created_at else 'N/A'
            updated_txt = item.updated_at.strftime('%m/%d/%Y %H:%M') if item.updated_at else 'N/A'
            min_qty = item.min_quantity if item.min_quantity is not None else 0
            max_qty = item.max_quantity if item.max_quantity is not None else 0
            current_qty = item.quantity if item.quantity is not None else 0
            last_update_user = _get_last_update_user(item)

            status_table_rows = [
                [_make_paragraph('<font color="#6b7280" size="7"><b>Status:</b></font>', styles['ThaiSmall'])],
                [status_badge],
                [Spacer(1, 3)],
                [_make_paragraph('<font color="#6b7280" size="7"><b>Quantity (Current / Min / Max):</b></font>', styles['ThaiSmall'])],
                [_make_paragraph(f'<font size="8">{current_qty} / {min_qty} / {max_qty}</font>', styles['ThaiNormal'])],
                [Spacer(1, 3)],
                [_make_paragraph('<font color="#6b7280" size="7"><b>Date Created:</b></font>', styles['ThaiSmall'])],
                [_make_paragraph(f'<font size="7">{_escape_text(created_txt)}</font>', styles['ThaiSmall'])],
                [Spacer(1, 3)],
                [_make_paragraph('<font color="#6b7280" size="7"><b>Last Updated:</b></font>', styles['ThaiSmall'])],
                [_make_paragraph(f'<font size="7">{_escape_text(updated_txt)}</font>', styles['ThaiSmall'])],
                [Spacer(1, 3)],
                [_make_paragraph('<font color="#6b7280" size="7"><b>Last Update By:</b></font>', styles['ThaiSmall'])],
                [_make_paragraph(f'<font size="7">{_escape_text(last_update_user)}</font>', styles['ThaiSmall'])],
            ]

            status_table = Table(status_table_rows, colWidths=[col_widths[2] - 12])
            status_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))

            # Card container with alternating backgrounds
            row_bg_color = colors.white if item_index % 2 == 0 else colors.Color(0.98, 0.98, 0.99)

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
            # Separator line between cards
            sep = Table([['']], colWidths=[usable_width])
            sep.setStyle(TableStyle([
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.Color(0.9, 0.91, 0.92)),
            ]))
            story.append(sep)
            story.append(Spacer(1, 8))

        # Build PDF
        doc.build(story)
        buffer.seek(0)
        filename = f"part_inventory_{timezone.now().strftime('%Y_%m_%d')}.pdf"
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    export_inventory_pdf.short_description = "Export selected/filtered inventory items to PDF"
    
    def export_inventory_csv(self, request, queryset):
        """Export selected/filtered inventory items to CSV"""
        qs = queryset.select_related('property', 'room', 'created_by').prefetch_related('jobs', 'preventive_maintenances').order_by('item_id')
        
        filename = f"inventory_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'Item ID',
            'Name',
            'Description',
            'Category',
            'Quantity',
            'Min Quantity',
            'Max Quantity',
            'Unit',
            'Unit Price',
            'Status',
            'Property',
            'Property ID',
            'Room',
            'Room ID',
            'Job ID',
            'PM ID',
            'Location',
            'Supplier',
            'Supplier Contact',
            'Last Restocked',
            'Expiry Date',
            'Notes',
            'Created By',
            'Created By Email',
            'Created At',
            'Updated At',
        ])
        
        for item in qs:
            writer.writerow([
                item.item_id or '',
                item.name or '',
                item.description or '',
                item.get_category_display() if hasattr(item, 'get_category_display') else item.category or '',
                item.quantity or 0,
                item.min_quantity or 0,
                item.max_quantity or 0,
                item.unit or '',
                item.unit_price or 0,
                item.get_status_display() if hasattr(item, 'get_status_display') else item.status or '',
                item.property.name if item.property else '',
                item.property.property_id if item.property else '',
                item.room.name if item.room else '',
                item.room.room_id if item.room else '',
                ', '.join(item.jobs.values_list('job_id', flat=True)),
                ', '.join(item.preventive_maintenances.values_list('pm_id', flat=True)),
                item.location or '',
                item.supplier or '',
                item.supplier_contact or '',
                item.last_restocked.strftime('%Y-%m-%d %H:%M:%S') if item.last_restocked else '',
                item.expiry_date.strftime('%Y-%m-%d') if item.expiry_date else '',
                item.notes or '',
                item.created_by.username if item.created_by else '',
                item.created_by.email if item.created_by else '',
                item.created_at.strftime('%Y-%m-%d %H:%M:%S') if item.created_at else '',
                item.updated_at.strftime('%Y-%m-%d %H:%M:%S') if item.updated_at else '',
            ])
        
        return response
    export_inventory_csv.short_description = "Export selected/filtered inventory items to CSV"


@admin.register(InventoryUsage)
class InventoryUsageAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = [
        'inventory', 'property', 'quantity', 'source', 'job',
        'preventive_maintenance', 'total_cost', 'consumed_by', 'consumed_at'
    ]
    list_filter = ['source', 'property', 'consumed_at', 'created_at']
    search_fields = [
        'inventory__item_id', 'inventory__name', 'property__name',
        'job__job_id', 'preventive_maintenance__pm_id', 'notes',
        'consumed_by__username', 'consumed_by__email',
    ]
    readonly_fields = ['total_cost', 'created_at']
    autocomplete_fields = ['inventory', 'property', 'job', 'preventive_maintenance', 'consumed_by']
    
    def mark_as_available(self, request, queryset):
        updated_count = queryset.update(status='available')
        self.message_user(request, f"{updated_count} inventory items marked as available.")
    mark_as_available.short_description = "Mark selected items as available"
    
    def mark_as_low_stock(self, request, queryset):
        updated_count = queryset.update(status='low_stock')
        self.message_user(request, f"{updated_count} inventory items marked as low stock.")
    mark_as_low_stock.short_description = "Mark selected items as low stock"
    
    def mark_as_out_of_stock(self, request, queryset):
        updated_count = queryset.update(status='out_of_stock')
        self.message_user(request, f"{updated_count} inventory items marked as out of stock.")
    mark_as_out_of_stock.short_description = "Mark selected items as out of stock"

