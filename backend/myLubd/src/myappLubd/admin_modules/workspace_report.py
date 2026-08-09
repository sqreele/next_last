import csv
import os
from io import BytesIO

from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html

from ..models import WorkspaceReport
from .filters import CreatedAtMonthFilter, create_month_filter

ReportDateMonthFilter = create_month_filter('report_date', 'Report Month', 'report_month')
DueDateMonthFilter = create_month_filter('due_date', 'Due Month', 'due_date_month')
CompletedDateMonthFilter = create_month_filter('completed_date', 'Completed Month', 'completed_date_month')

@admin.register(WorkspaceReport)
class WorkspaceReportAdmin(admin.ModelAdmin):
    """Admin interface for managing Workspace Reports with PDF export functionality"""
    list_per_page = 25
    list_display = [
        'report_id',
        'title',
        'get_topic_display_admin',
        'get_status_display_colored',
        'get_priority_display_colored',
        'property_link',
        'report_date',
        'due_date',
        'get_images_count',
        'created_by_link',
        'created_at',
    ]
    list_filter = [
        'status',
        'priority',
        'property',
        'topic',
        'report_date',
        ReportDateMonthFilter,
        'due_date',
        DueDateMonthFilter,
        'completed_date',
        CompletedDateMonthFilter,
        'created_at',
        CreatedAtMonthFilter,
        'created_by',
    ]
    search_fields = [
        'report_id',
        'title',
        'description',
        'custom_topic',
        'custom_text_1',
        'custom_text_2',
        'custom_text_3',
        'notes',
        'supplier',
        'topic__title',
        'property__name',
        'created_by__username',
    ]
    readonly_fields = [
        'report_id',
        'created_at',
        'updated_at',
        'image_1_preview',
        'image_2_preview',
        'image_3_preview',
        'image_4_preview',
        'image_5_preview',
        'image_6_preview',
        'image_7_preview',
        'image_8_preview',
        'image_9_preview',
        'image_10_preview',
        'image_11_preview',
        'image_12_preview',
        'image_13_preview',
        'image_14_preview',
        'image_15_preview',
    ]
    autocomplete_fields = ['topic', 'property', 'created_by', 'updated_by']
    date_hierarchy = 'report_date'
    
    fieldsets = (
        ('Report Information', {
            'fields': ('report_id', 'title', 'topic', 'custom_topic')
        }),
        ('Status & Priority', {
            'fields': ('status', 'priority')
        }),
        ('Description', {
            'fields': ('description',)
        }),
        ('Custom Fields', {
            'fields': (
                ('custom_text_1_label', 'custom_text_1'),
                ('custom_text_2_label', 'custom_text_2'),
                ('custom_text_3_label', 'custom_text_3'),
            ),
            'description': 'Customize the labels for each field. Use these for observations, recommendations, action items, etc.'
        }),
        ('Images (1-5)', {
            'fields': (
                ('image_1', 'image_1_caption', 'image_1_preview'),
                ('image_2', 'image_2_caption', 'image_2_preview'),
                ('image_3', 'image_3_caption', 'image_3_preview'),
                ('image_4', 'image_4_caption', 'image_4_preview'),
                ('image_5', 'image_5_caption', 'image_5_preview'),
            ),
            'description': 'Upload images 1-5 with optional captions for single-page PDF report.'
        }),
        ('Images (6-10)', {
            'fields': (
                ('image_6', 'image_6_caption', 'image_6_preview'),
                ('image_7', 'image_7_caption', 'image_7_preview'),
                ('image_8', 'image_8_caption', 'image_8_preview'),
                ('image_9', 'image_9_caption', 'image_9_preview'),
                ('image_10', 'image_10_caption', 'image_10_preview'),
            ),
            'classes': ('collapse',),
            'description': 'Additional images 6-10.'
        }),
        ('Images (11-15)', {
            'fields': (
                ('image_11', 'image_11_caption', 'image_11_preview'),
                ('image_12', 'image_12_caption', 'image_12_preview'),
                ('image_13', 'image_13_caption', 'image_13_preview'),
                ('image_14', 'image_14_caption', 'image_14_preview'),
                ('image_15', 'image_15_caption', 'image_15_preview'),
            ),
            'classes': ('collapse',),
            'description': 'Additional images 11-15.'
        }),
        ('Property & Supplier', {
            'fields': ('property', 'supplier')
        }),
        ('Dates', {
            'fields': ('report_date', 'due_date', 'completed_date')
        }),
        ('Additional Notes', {
            'fields': ('notes',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'updated_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    actions = [
        'export_reports_pdf',
        'export_reports_csv',
        'mark_as_completed',
        'mark_as_approved',
        'mark_as_pending_review',
        'export_single_report_pdf',
    ]
    
    # ========================================
    # Display Methods
    # ========================================
    
    def get_topic_display_admin(self, obj):
        """Display topic name (custom or from Topic model)"""
        if obj.custom_topic:
            return format_html('<span style="color: #666; font-style: italic;">{}</span>', obj.custom_topic)
        if obj.topic:
            link = reverse("admin:myappLubd_topic_change", args=[obj.topic.id])
            return format_html('<a href="{}">{}</a>', link, obj.topic.title)
        return format_html('<span style="color: #999;">No Topic</span>')
    get_topic_display_admin.short_description = 'Topic'
    get_topic_display_admin.admin_order_field = 'topic__title'
    
    def get_status_display_colored(self, obj):
        """Display status with color coding"""
        status_colors = {
            'draft': '#6c757d',           # grey
            'pending_review': '#fd7e14',   # orange
            'in_progress': '#0d6efd',      # blue
            'approved': '#198754',         # green
            'completed': '#20c997',        # teal
            'rejected': '#dc3545',         # red
            'archived': '#adb5bd',         # light grey
        }
        color = status_colors.get(obj.status, 'black')
        return format_html(
            '<span style="color: {}; font-weight: bold; padding: 2px 8px; border-radius: 3px; background-color: {}20;">{}</span>',
            color, color, obj.get_status_display()
        )
    get_status_display_colored.short_description = 'Status'
    get_status_display_colored.admin_order_field = 'status'
    
    def get_priority_display_colored(self, obj):
        """Display priority with color coding"""
        priority_colors = {
            'low': '#198754',      # green
            'medium': '#fd7e14',   # orange
            'high': '#dc3545',     # red
            'urgent': '#6f42c1',   # purple
        }
        color = priority_colors.get(obj.priority, 'black')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, obj.get_priority_display()
        )
    get_priority_display_colored.short_description = 'Priority'
    get_priority_display_colored.admin_order_field = 'priority'
    
    def property_link(self, obj):
        """Display property as link"""
        if obj.property:
            link = reverse("admin:myappLubd_property_change", args=[obj.property.id])
            return format_html('<a href="{}">{}</a>', link, obj.property.name)
        return format_html('<span style="color: #999;">No Property</span>')
    property_link.short_description = 'Property'
    property_link.admin_order_field = 'property__name'
    
    def created_by_link(self, obj):
        """Display created by user as link"""
        if obj.created_by:
            link = reverse("admin:myappLubd_user_change", args=[obj.created_by.id])
            return format_html('<a href="{}">{}</a>', link, obj.created_by.username)
        return format_html('<span style="color: #999;">Unknown</span>')
    created_by_link.short_description = 'Created By'
    created_by_link.admin_order_field = 'created_by__username'
    
    def get_images_count(self, obj):
        """Display count of uploaded images (up to 15)"""
        count = sum(1 for i in range(1, 16) if getattr(obj, f'image_{i}', None))
        if count > 0:
            return format_html(
                '<span style="color: #198754; font-weight: bold;">{} image{}</span>',
                count, 's' if count > 1 else ''
            )
        return format_html('<span style="color: #999;">No images</span>')
    get_images_count.short_description = 'Images'
    
    def image_1_preview(self, obj):
        return self._get_image_preview(obj, 1)
    image_1_preview.short_description = 'Preview 1'
    
    def image_2_preview(self, obj):
        return self._get_image_preview(obj, 2)
    image_2_preview.short_description = 'Preview 2'
    
    def image_3_preview(self, obj):
        return self._get_image_preview(obj, 3)
    image_3_preview.short_description = 'Preview 3'
    
    def image_4_preview(self, obj):
        return self._get_image_preview(obj, 4)
    image_4_preview.short_description = 'Preview 4'
    
    def image_5_preview(self, obj):
        return self._get_image_preview(obj, 5)
    image_5_preview.short_description = 'Preview 5'
    
    def image_6_preview(self, obj):
        return self._get_image_preview(obj, 6)
    image_6_preview.short_description = 'Preview 6'
    
    def image_7_preview(self, obj):
        return self._get_image_preview(obj, 7)
    image_7_preview.short_description = 'Preview 7'
    
    def image_8_preview(self, obj):
        return self._get_image_preview(obj, 8)
    image_8_preview.short_description = 'Preview 8'
    
    def image_9_preview(self, obj):
        return self._get_image_preview(obj, 9)
    image_9_preview.short_description = 'Preview 9'
    
    def image_10_preview(self, obj):
        return self._get_image_preview(obj, 10)
    image_10_preview.short_description = 'Preview 10'
    
    def image_11_preview(self, obj):
        return self._get_image_preview(obj, 11)
    image_11_preview.short_description = 'Preview 11'
    
    def image_12_preview(self, obj):
        return self._get_image_preview(obj, 12)
    image_12_preview.short_description = 'Preview 12'
    
    def image_13_preview(self, obj):
        return self._get_image_preview(obj, 13)
    image_13_preview.short_description = 'Preview 13'
    
    def image_14_preview(self, obj):
        return self._get_image_preview(obj, 14)
    image_14_preview.short_description = 'Preview 14'
    
    def image_15_preview(self, obj):
        return self._get_image_preview(obj, 15)
    image_15_preview.short_description = 'Preview 15'
    
    def _get_image_preview(self, obj, image_num):
        """Helper method to generate image preview HTML"""
        image = getattr(obj, f'image_{image_num}', None)
        if image and hasattr(image, 'url'):
            return format_html(
                '<img src="{}" style="max-width: 150px; max-height: 150px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />',
                image.url
            )
        return format_html('<span style="color: #999;">No image</span>')
    
    # ========================================
    # Query Optimization
    # ========================================
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'topic', 'property', 'created_by', 'updated_by'
        )
    
    # ========================================
    # Save Methods
    # ========================================
    
    def save_model(self, request, obj, form, change):
        if not change:  # New object
            if not obj.created_by:
                obj.created_by = request.user
        else:  # Existing object
            obj.updated_by = request.user
        super().save_model(request, obj, form, change)
    
    # ========================================
    # Admin Actions
    # ========================================
    
    def mark_as_completed(self, request, queryset):
        updated_count = queryset.update(
            status='completed',
            completed_date=timezone.now().date()
        )
        self.message_user(request, f"{updated_count} report(s) marked as completed.")
    mark_as_completed.short_description = "Mark selected reports as completed"
    
    def mark_as_approved(self, request, queryset):
        updated_count = queryset.update(status='approved')
        self.message_user(request, f"{updated_count} report(s) marked as approved.")
    mark_as_approved.short_description = "Mark selected reports as approved"
    
    def mark_as_pending_review(self, request, queryset):
        updated_count = queryset.update(status='pending_review')
        self.message_user(request, f"{updated_count} report(s) marked as pending review.")
    mark_as_pending_review.short_description = "Mark selected reports as pending review"
    
    def export_reports_csv(self, request, queryset):
        """Export selected/filtered reports to CSV"""
        qs = queryset.select_related('topic', 'property', 'created_by', 'updated_by').order_by('-report_date')
        
        filename = f"workspace_reports_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')  # BOM for Excel UTF-8 compatibility
        
        writer = csv.writer(response)
        writer.writerow([
            'Report ID',
            'Title',
            'Topic',
            'Custom Topic',
            'Status',
            'Priority',
            'Property',
            'Description',
            'Custom Text 1 Label',
            'Custom Text 1',
            'Custom Text 2 Label',
            'Custom Text 2',
            'Custom Text 3 Label',
            'Custom Text 3',
            'Report Date',
            'Due Date',
            'Completed Date',
            'Notes',
            'Images Count',
            'Created By',
            'Created At',
            'Updated By',
            'Updated At',
        ])
        
        for report in qs:
            images_count = sum(1 for i in range(1, 5) if getattr(report, f'image_{i}', None))
            writer.writerow([
                report.report_id or '',
                report.title or '',
                report.topic.title if report.topic else '',
                report.custom_topic or '',
                report.get_status_display(),
                report.get_priority_display(),
                report.property.name if report.property else '',
                report.description or '',
                report.custom_text_1_label or '',
                report.custom_text_1 or '',
                report.custom_text_2_label or '',
                report.custom_text_2 or '',
                report.custom_text_3_label or '',
                report.custom_text_3 or '',
                report.report_date.strftime('%Y-%m-%d') if report.report_date else '',
                report.due_date.strftime('%Y-%m-%d') if report.due_date else '',
                report.completed_date.strftime('%Y-%m-%d') if report.completed_date else '',
                report.notes or '',
                images_count,
                report.created_by.username if report.created_by else '',
                report.created_at.strftime('%Y-%m-%d %H:%M:%S') if report.created_at else '',
                report.updated_by.username if report.updated_by else '',
                report.updated_at.strftime('%Y-%m-%d %H:%M:%S') if report.updated_at else '',
            ])
        
        return response
    export_reports_csv.short_description = "Export selected reports to CSV"
    
    def export_reports_pdf(self, request, queryset):
        """Export selected/filtered reports to PDF (summary list)"""
        try:
            from reportlab.lib.pagesizes import A4, letter
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch, cm, mm
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image as RLImage
            from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        except ImportError:
            self.message_user(request, 'ReportLab is required for PDF export. Install with: pip install reportlab', level='error')
            return None
        
        qs = queryset.select_related('topic', 'property', 'created_by').order_by('-report_date')
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=1.5*cm,
            leftMargin=1.5*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Title'],
            fontSize=18,
            spaceAfter=20,
            textColor=colors.darkblue,
            alignment=TA_CENTER
        )
        header_style = ParagraphStyle(
            'Header',
            parent=styles['Heading2'],
            fontSize=12,
            spaceAfter=10,
            textColor=colors.darkblue
        )
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=9,
            spaceAfter=6
        )
        
        story = []
        
        # Title
        story.append(Paragraph("Workspace Reports Summary", title_style))
        story.append(Paragraph(f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}", normal_style))
        story.append(Spacer(1, 20))
        
        # Summary Statistics
        total_count = qs.count()
        status_counts = {}
        for report in qs:
            status = report.get_status_display()
            status_counts[status] = status_counts.get(status, 0) + 1
        
        summary_data = [['Status', 'Count']]
        for status, count in status_counts.items():
            summary_data.append([status, str(count)])
        summary_data.append(['Total', str(total_count)])
        
        summary_table = Table(summary_data, colWidths=[2*inch, 1*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 30))
        
        # Reports table
        story.append(Paragraph("Reports List", header_style))
        
        table_data = [['ID', 'Title', 'Topic', 'Status', 'Priority', 'Property', 'Date']]
        for report in qs:
            table_data.append([
                report.report_id or '',
                (report.title[:30] + '...') if len(report.title or '') > 30 else (report.title or ''),
                (report.get_topic_display()[:20] + '...') if len(report.get_topic_display()) > 20 else report.get_topic_display(),
                report.get_status_display(),
                report.get_priority_display(),
                (report.property.name[:15] + '...') if report.property and len(report.property.name) > 15 else (report.property.name if report.property else 'N/A'),
                report.report_date.strftime('%Y-%m-%d') if report.report_date else '',
            ])
        
        col_widths = [1.2*inch, 1.5*inch, 1*inch, 0.9*inch, 0.7*inch, 0.9*inch, 0.8*inch]
        table = Table(table_data, colWidths=col_widths)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.Color(0.95, 0.95, 0.95)]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(table)
        
        doc.build(story)
        buffer.seek(0)
        
        filename = f"workspace_reports_{timezone.now().strftime('%Y_%m_%d')}.pdf"
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    export_reports_pdf.short_description = "Export selected reports to PDF (summary)"
    
    def export_single_report_pdf(self, request, queryset):
        """Export a single detailed report to PDF - SINGLE PAGE layout with up to 15 images in a compact grid"""
        if queryset.count() > 1:
            self.message_user(request, 'Please select only one report for detailed PDF export.', level='warning')
            return None
        
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch, cm, mm
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
            from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
            from PIL import Image as PILImage
        except ImportError:
            self.message_user(request, 'ReportLab and Pillow are required for PDF export.', level='error')
            return None
        
        report = queryset.first()
        
        buffer = BytesIO()
        # Use minimal margins to maximize space for single-page layout
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=0.4*cm,
            leftMargin=0.4*cm,
            topMargin=0.4*cm,
            bottomMargin=0.3*cm
        )
        
        # A4 size: 210mm x 297mm = 595 x 842 points
        page_width = A4[0] - 0.8*cm  # Available width after margins
        
        styles = getSampleStyleSheet()
        
        # Ultra-compact styles for single-page layout with 15 images
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Title'],
            fontSize=12,
            spaceAfter=1,
            spaceBefore=0,
            textColor=colors.darkblue,
            alignment=TA_CENTER,
            leading=14
        )
        
        subtitle_style = ParagraphStyle(
            'Subtitle',
            parent=styles['Normal'],
            fontSize=8,
            spaceAfter=2,
            textColor=colors.grey,
            alignment=TA_CENTER
        )
        
        header_style = ParagraphStyle(
            'Header',
            parent=styles['Heading2'],
            fontSize=8,
            spaceAfter=1,
            spaceBefore=2,
            textColor=colors.darkblue,
            fontName='Helvetica-Bold'
        )
        
        value_style = ParagraphStyle(
            'Value',
            parent=styles['Normal'],
            fontSize=7,
            spaceAfter=1,
            leading=9
        )
        
        caption_style = ParagraphStyle(
            'Caption',
            parent=styles['Normal'],
            fontSize=7,
            alignment=TA_CENTER,
            textColor=colors.Color(0.3, 0.3, 0.3),
            spaceAfter=0,
            spaceBefore=0,
            leading=9,
            wordWrap='CJK'  # Enable word wrapping for better text flow
        )
        
        story = []
        
        # Compact Title with report ID on same line
        title_text = report.title[:50] + '...' if len(report.title or '') > 50 else (report.title or 'Untitled')
        story.append(Paragraph(f"Workspace Report: {title_text} ({report.report_id})", title_style))

        status_display = (report.get_status_display() or report.status or 'N/A')[:15]
        priority_display = (report.get_priority_display() or report.priority or 'N/A')[:15]
        topic_display = (report.topic.name if report.topic else 'N/A')[:15]
        if report.custom_topic:
            topic_display = report.custom_topic[:15]
        
        # Single-row compact info table with all key info
        info_data = [[
            Paragraph(f"<b>Status:</b> {status_display}", value_style),
            Paragraph(f"<b>Priority:</b> {priority_display}", value_style),
            Paragraph(f"<b>Property:</b> {report.property.name[:15] if report.property else 'N/A'}", value_style),
            Paragraph(f"<b>Topic:</b> {topic_display}", value_style),
            Paragraph(f"<b>Date:</b> {report.report_date.strftime('%Y-%m-%d') if report.report_date else 'N/A'}", value_style),
        ]]
        
        col_w = page_width / 5
        info_table = Table(info_data, colWidths=[col_w] * 5)
        info_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BACKGROUND', (0, 0), (-1, -1), colors.Color(0.96, 0.96, 0.98)),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ]))
        story.append(info_table)
        
        # Description (very truncated for single page)
        if report.description:
            desc_text = report.description[:150] + '...' if len(report.description) > 150 else report.description
            story.append(Paragraph(f"<b>Desc:</b> {desc_text}", value_style))
        
        # Images Section - Grid layout (5 columns x 3 rows = 15 images on single page)
        images = report.get_images()
        if images:
            story.append(Spacer(1, 3))
            story.append(Paragraph("Report Images", header_style))
            
            # Optimized grid dimensions for 15 images on single A4 page
            # A4 height: 842pt, margins: ~20pt, header: ~80pt, footer: ~15pt
            # Available for images: ~727pt
            # 3 rows of images + 3 rows of captions = 6 rows
            num_cols = 5
            cell_width = (page_width - 6) / num_cols  # Minimal gap between cells
            cell_img_width = cell_width - 2  # Minimal padding inside cell
            
            # Calculate optimal image height based on available space
            # Each row: image_height + 2pt padding + 22pt caption (2 lines) = image_height + 24pt
            # 3 rows * (image_height + 24) should fit in ~650pt (conservative)
            # So image_height = (650 / 3) - 24 = ~193pt max
            cell_img_height = 180  # Slightly reduced to allow more space for captions
            
            # Build image grid data
            image_grid = []
            image_captions = []
            current_row = []
            current_captions = []
            
            for idx, img_data in enumerate(images[:15]):  # Max 15 images
                image_field = img_data['image']
                caption = img_data['caption'] or f'#{idx + 1}'
                # Allow longer captions with word wrap (up to 40 chars for 2-line display)
                if len(caption) > 40:
                    caption = caption[:37] + '...'
                
                img_cell = None
                if image_field and hasattr(image_field, 'path'):
                    try:
                        jpeg_path = img_data.get('jpeg_path')
                        if jpeg_path:
                            img_path = os.path.join(settings.MEDIA_ROOT, jpeg_path)
                        else:
                            img_path = image_field.path
                        
                        if os.path.exists(img_path):
                            pil_img = PILImage.open(img_path)
                            img_w, img_h = pil_img.size
                            aspect = img_w / img_h
                            
                            # Calculate display dimensions to fit in cell (max fit)
                            if aspect > 1:  # Landscape
                                display_width = min(cell_img_width, cell_img_height * aspect)
                                display_height = display_width / aspect
                            else:  # Portrait or square
                                display_height = min(cell_img_height, cell_img_width / aspect)
                                display_width = display_height * aspect
                            
                            # Ensure we don't exceed cell bounds
                            if display_width > cell_img_width:
                                display_width = cell_img_width
                                display_height = display_width / aspect
                            if display_height > cell_img_height:
                                display_height = cell_img_height
                                display_width = display_height * aspect
                            
                            img_cell = RLImage(img_path, width=display_width, height=display_height)
                            pil_img.close()
                    except Exception as e:
                        img_cell = Paragraph(f'[{idx + 1}]', caption_style)
                
                if img_cell is None:
                    img_cell = Paragraph(f'[No Image {idx + 1}]', caption_style)
                
                current_row.append(img_cell)
                current_captions.append(Paragraph(caption, caption_style))
                
                # Complete row when we have 5 images
                if len(current_row) == num_cols:
                    image_grid.append(current_row)
                    image_captions.append(current_captions)
                    current_row = []
                    current_captions = []
            
            # Add remaining images in the last row
            if current_row:
                # Pad with empty cells to complete the row
                while len(current_row) < num_cols:
                    current_row.append('')
                    current_captions.append('')
                image_grid.append(current_row)
                image_captions.append(current_captions)
            
            # Create alternating image and caption rows
            grid_data = []
            for i, (img_row, cap_row) in enumerate(zip(image_grid, image_captions)):
                grid_data.append(img_row)
                grid_data.append(cap_row)
            
            if grid_data:
                # Define row heights: image rows taller, caption rows with space for 2 lines
                row_heights = []
                for i in range(len(grid_data)):
                    if i % 2 == 0:  # Image row
                        row_heights.append(cell_img_height + 2)
                    else:  # Caption row - increased to fit 2 lines of text
                        row_heights.append(22)
                
                grid_table = Table(
                    grid_data, 
                    colWidths=[cell_width] * num_cols,
                    rowHeights=row_heights
                )
                grid_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 1),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 1),
                    ('TOPPADDING', (0, 0), (-1, -1), 1),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                    ('BOX', (0, 0), (-1, -1), 0.5, colors.lightgrey),
                    ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.Color(0.92, 0.92, 0.92)),
                ]))
                story.append(grid_table)
        
        # Minimal footer
        story.append(Spacer(1, 2))
        footer_parts = [f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}"]
        if report.completed_date:
            footer_parts.append(f"Completed: {report.completed_date.strftime('%Y-%m-%d')}")
        if report.created_by:
            footer_parts.append(f"By: {report.created_by.username}")
        if report.supplier:
            footer_parts.append(f"Supplier: {report.supplier[:20]}")
        story.append(Paragraph(" | ".join(footer_parts), ParagraphStyle('Footer', parent=styles['Normal'], fontSize=6, textColor=colors.grey, alignment=TA_CENTER)))
        
        doc.build(story)
        buffer.seek(0)
        
        filename = f"report_{report.report_id}_{timezone.now().strftime('%Y%m%d')}_single.pdf"
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    export_single_report_pdf.short_description = "Export single report to PDF (1 page with 15 images)"
    
    # ========================================
    # Custom URLs for additional functionality
    # ========================================
    
    def get_urls(self):
        """Add custom URLs for report operations"""
        urls = super().get_urls()
        custom_urls = [
            path(
                '<int:object_id>/export-pdf/',
                self.admin_site.admin_view(self.export_report_pdf_view),
                name='workspacereport_export_pdf',
            ),
        ]
        return custom_urls + urls
    
    def export_report_pdf_view(self, request, object_id):
        """View to export a single report to PDF"""
        try:
            report = WorkspaceReport.objects.get(pk=object_id)
            queryset = WorkspaceReport.objects.filter(pk=object_id)
            return self.export_single_report_pdf(request, queryset)
        except WorkspaceReport.DoesNotExist:
            return HttpResponse("Report not found", status=404)
        except Exception as e:
            return HttpResponse(f"Error generating PDF: {str(e)}", status=500)
