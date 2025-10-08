from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

User = get_user_model()

# Custom User Admin
class CustomUserAdmin(BaseUserAdmin):
    list_display = BaseUserAdmin.list_display + ('property_name', 'property_id')
    list_filter = BaseUserAdmin.list_filter + ('property_name',)
    search_fields = BaseUserAdmin.search_fields + ('property_name', 'property_id')
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Property Information', {'fields': ('property_name', 'property_id')}),
    )
    
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Property Information', {'fields': ('property_name', 'property_id')}),
    )

# Register our custom User admin (unregister first if already registered)
try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass
admin.site.register(User, CustomUserAdmin)

from django import forms
from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from datetime import timedelta
from django.http import HttpResponse
import csv
from io import BytesIO
from .models import (
    Property,
    Room,
    Topic,
    Job,
    JobImage,
    UserProfile,
    PreventiveMaintenance,
    Session,
    Machine,
    MaintenanceProcedure,
    MaintenanceChecklist,
    MaintenanceHistory,
    MaintenanceSchedule
)

# Monitoring admin removed to avoid recursion issues

# Custom User Admin to show Google OAuth information
class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'
    fields = ['positions', 'profile_image', 'property_name', 'property_id', 'google_id', 'email_verified', 'login_provider']

class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)
    list_display = ['username', 'email', 'first_name', 'last_name', 'property_name', 'get_property_id_display', 'get_google_info', 'is_staff', 'is_active', 'jobs_this_month', 'date_joined']
    list_filter = ['is_staff', 'is_superuser', 'is_active', 'groups', 'date_joined', 'property_name']
    search_fields = ['username', 'first_name', 'last_name', 'email', 'property_name', 'property_id']
    actions = ['export_users_csv', 'export_users_pdf']
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Property Information', {'fields': ('property_name', 'property_id')}),
    )
    
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Property Information', {'fields': ('property_name', 'property_id')}),
    )
    
    def get_google_info(self, obj):
        try:
            profile = obj.userprofile
            if profile.google_id:
                return f"Google OAuth ({profile.login_provider or 'Google'})"
            return "Local User"
        except UserProfile.DoesNotExist:
            return "No Profile"
    get_google_info.short_description = 'Auth Type'
    get_google_info.admin_order_field = 'userprofile__google_id'

    def get_property_id_display(self, obj):
        """Display the property_id from the User model, or from related Property if available"""
        if obj.property_id:
            return obj.property_id
        
        # If User.property_id is empty, try to get it from the related Property
        if obj.accessible_properties.exists():
            property_obj = obj.accessible_properties.first()
            return property_obj.property_id if property_obj else "-"
        
        return "-"
    get_property_id_display.short_description = 'Property ID'
    get_property_id_display.admin_order_field = 'property_id'

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        # Current month date range
        start_of_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Add enough days to guarantee moving to next month, then reset to day 1
        start_of_next_month = (start_of_month + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return queryset.annotate(
            jobs_this_month_count=Count(
                'maintenance_jobs',
                filter=Q(
                    maintenance_jobs__created_at__gte=start_of_month,
                    maintenance_jobs__created_at__lt=start_of_next_month
                )
            )
        )

    def jobs_this_month(self, obj):
        return getattr(obj, 'jobs_this_month_count', 0)
    jobs_this_month.short_description = 'Jobs (this month)'
    jobs_this_month.admin_order_field = 'jobs_this_month_count'

    def export_users_csv(self, request, queryset):
        # Prepare date range for current month
        start_of_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_of_next_month = (start_of_month + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        annotated_qs = queryset.annotate(
            jobs_this_month_count=Count(
                'maintenance_jobs',
                filter=Q(
                    maintenance_jobs__created_at__gte=start_of_month,
                    maintenance_jobs__created_at__lt=start_of_next_month
                )
            )
        ).order_by('username')

        year_month = start_of_month.strftime('%Y_%m')
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="users_jobs_{year_month}.csv"'

        writer = csv.writer(response)
        writer.writerow(['Username', 'Email', 'First name', 'Last name', 'Jobs (this month)'])
        for user in annotated_qs:
            writer.writerow([
                user.username,
                user.email,
                user.first_name,
                user.last_name,
                getattr(user, 'jobs_this_month_count', 0)
            ])
        return response
    export_users_csv.short_description = 'Export selected users to CSV (with jobs this month)'

    def export_users_pdf(self, request, queryset):
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas
            from reportlab.lib.units import inch
        except Exception:
            self.message_user(request, 'ReportLab is required for PDF export. Install with: pip install reportlab', level='error')
            return None

        start_of_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_of_next_month = (start_of_month + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        annotated_qs = queryset.annotate(
            jobs_this_month_count=Count(
                'maintenance_jobs',
                filter=Q(
                    maintenance_jobs__created_at__gte=start_of_month,
                    maintenance_jobs__created_at__lt=start_of_next_month
                )
            )
        ).order_by('username')

        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4

        title_text = f"Users - Jobs This Month ({start_of_month.strftime('%Y-%m')})"
        p.setFont('Helvetica-Bold', 14)
        p.drawString(72, height - 72, title_text)

        y = height - 100
        line_height = 16

        p.setFont('Helvetica', 10)
        header = ['Username', 'Email', 'First name', 'Last name', 'Jobs (this month)']
        p.drawString(72, y, ' | '.join(header))
        y -= line_height
        p.line(72, y + 4, width - 72, y + 4)
        y -= line_height

        for user in annotated_qs:
            row = [
                user.username,
                user.email or '',
                user.first_name or '',
                user.last_name or '',
                str(getattr(user, 'jobs_this_month_count', 0))
            ]
            row_text = ' | '.join(row)

            # wrap simple long lines if needed
            if len(row_text) > 110:
                # naive wrapping at 110 chars
                while len(row_text) > 110:
                    p.drawString(72, y, row_text[:110])
                    row_text = row_text[110:]
                    y -= line_height
                    if y < 72:
                        p.showPage()
                        p.setFont('Helvetica', 10)
                        y = height - 72
                if row_text:
                    p.drawString(72, y, row_text)
            else:
                p.drawString(72, y, row_text)

            y -= line_height
            if y < 72:
                p.showPage()
                p.setFont('Helvetica', 10)
                y = height - 72

        p.showPage()
        p.save()

        buffer.seek(0)
        year_month = start_of_month.strftime('%Y_%m')
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="users_jobs_{year_month}.pdf"'
        return response
    export_users_pdf.short_description = 'Export selected users to PDF (with jobs this month)'

# Re-register User admin
admin.site.unregister(User)
admin.site.register(User, UserAdmin)

# Add this new admin class for Machine
@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = [
        'machine_id', 
        'name', 
        'property_link', 
        'location', 
        'status', 
        'installation_date', 
        'last_maintenance_date',
        'next_maintenance_date'
    ]
    list_filter = ['status', 'property', 'created_at', 'installation_date']
    search_fields = ['machine_id', 'name', 'description', 'location']
    readonly_fields = ['machine_id', 'created_at', 'updated_at', 'next_maintenance_date']
    filter_horizontal = ['preventive_maintenances']
    
    fieldsets = (
        ('Machine Information', {
            'fields': ('machine_id', 'name', 'description', 'location', 'status')
        }),
        ('Property & Maintenance', {
            'fields': ('property', 'preventive_maintenances', 'installation_date', 'last_maintenance_date')
        }),
        ('Timestamps', {
            'classes': ('collapse',),
            'fields': ('created_at', 'updated_at')
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

    def next_maintenance_date(self, obj):
        next_date = obj.get_next_maintenance_date()
        if next_date:
            if next_date < timezone.now():
                return format_html('<span style="color: red;">{}</span>', next_date.strftime('%Y-%m-%d %H:%M'))
            return next_date.strftime('%Y-%m-%d %H:%M')
        return "No scheduled maintenance"
    next_maintenance_date.short_description = 'Next Maintenance'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('property').prefetch_related('preventive_maintenances')

    actions = ['schedule_maintenance']

    def schedule_maintenance(self, request, queryset):
        # This would ideally redirect to a custom view for scheduling maintenance
        # For simplicity, we'll just show a message here
        self.message_user(request, f"Selected {queryset.count()} machines for maintenance scheduling. Please use the preventive maintenance section to create schedules.")
    schedule_maintenance.short_description = "Schedule maintenance for selected machines"
# Custom form for Job admin with timestamp validation
class JobAdminForm(forms.ModelForm):
    class Meta:
        model = Job
        fields = '__all__'

    def clean(self):
        cleaned_data = super().clean()
        created_at = cleaned_data.get('created_at')
        updated_at = cleaned_data.get('updated_at')
        completed_at = cleaned_data.get('completed_at')
        status = cleaned_data.get('status')
        
        # Validate that created_at is not in the future
        if created_at and created_at > timezone.now():
            raise ValidationError("Created date cannot be in the future")
        
        # Validate that completed_at is not before created_at
        if completed_at and created_at and completed_at < created_at:
            raise ValidationError("Completed date cannot be before created date")
        
        # Validate that updated_at is not before created_at
        if updated_at and created_at and updated_at < created_at:
            raise ValidationError("Updated date cannot be before created date")
        
        # Validate that completed_at is not in the future when job is completed
        if status == 'completed' and completed_at and completed_at > timezone.now():
            raise ValidationError("Completed date cannot be in the future")
        
        return cleaned_data

# Inlines
class JobImageInline(admin.TabularInline):
    model = JobImage
    extra = 1
    readonly_fields = ['image_preview', 'uploaded_at']
    fields = ['image', 'image_preview', 'uploaded_by', 'uploaded_at']

    def image_preview(self, obj):
        if obj.image and hasattr(obj.image, 'url'):
            return format_html('<img src="{}" style="max-width: 100px; max-height: 100px;" />', obj.image.url)
        return "No Image"
    image_preview.short_description = 'Image Preview'

# Filters
class PropertyFilter(admin.SimpleListFilter):
    title = 'property'
    parameter_name = 'property'

    def lookups(self, request, model_admin):
        return [(str(p.id), p.name) for p in Property.objects.all().order_by('name')]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(rooms__properties__id=self.value()).distinct()
        return queryset

# ModelAdmins
@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    form = JobAdminForm
    list_display = ['job_id', 'get_description_display', 'get_status_display_colored', 'get_priority_display_colored', 'get_user_display', 'user_id', 'get_properties_display', 'get_timestamps_display', 'is_preventivemaintenance']
    list_filter = ['status', 'priority', 'is_defective', 'created_at', 'updated_at', 'is_preventivemaintenance', 'user', PropertyFilter]
    search_fields = ['job_id', 'description', 'user__username', 'updated_by__username', 'topics__title']
    readonly_fields = ['job_id', 'updated_by']
    filter_horizontal = ['rooms', 'topics']
    inlines = [JobImageInline]
    fieldsets = (
        ('Job Info', {
            'fields': ('job_id', 'description', 'remarks', 'status', 'priority', 'is_defective', 'is_preventivemaintenance')
        }),
        ('Assignment', {
            'fields': ('user', 'updated_by')
        }),
        ('Related Items', {
            'fields': ('rooms', 'topics')
        }),
        ('Timestamps (Editable)', {
            'fields': ('created_at', 'updated_at', 'completed_at'),
            'description': 'You can edit these timestamps. Created date should be the original job creation time, updated date should be the last modification time, and completed date should be when the job was finished.'
        }),
    )

    def get_topics_display(self, obj):
        return ", ".join([topic.title for topic in obj.topics.all()])
    get_topics_display.short_description = 'Topics'

    def get_user_display(self, obj):
        if obj.user:
            return f"{obj.user.username} ({obj.user.first_name} {obj.user.last_name})".strip()
        return "No User"
    get_user_display.short_description = 'User'
    get_user_display.admin_order_field = 'user__username'

    def get_updated_by_display(self, obj):
        if obj.updated_by:
            return f"{obj.updated_by.username} ({obj.updated_by.first_name} {obj.updated_by.last_name})".strip()
        return "No User"
    get_updated_by_display.short_description = 'Updated By'
    get_updated_by_display.admin_order_field = 'updated_by__username'

    def get_properties_display(self, obj):
        properties = []
        if obj.rooms.exists():
            for room in obj.rooms.all():
                for prop in room.properties.all():
                    prop_display = f"{prop.property_id} - {prop.name}"
                    if prop_display not in properties:
                        properties.append(prop_display)
        return ", ".join(properties) if properties else "No Properties"
    get_properties_display.short_description = 'Properties (ID - Name)'

    def get_description_display(self, obj):
        if obj.description:
            return obj.description[:50] + "..." if len(obj.description) > 50 else obj.description
        return "No Description"
    get_description_display.short_description = 'Description'

    def get_status_display_colored(self, obj):
        status_colors = {
            'pending': 'orange',
            'in_progress': 'blue',
            'waiting_sparepart': 'purple',
            'completed': 'green',
            'cancelled': 'red'
        }
        color = status_colors.get(obj.status, 'black')
        return format_html('<span style="color: {};">{}</span>', color, obj.get_status_display())
    get_status_display_colored.short_description = 'Status'
    get_status_display_colored.admin_order_field = 'status'

    def save_model(self, request, obj, form, change):
        if not obj.pk and not obj.user_id:
            obj.user = request.user
        
        if obj.pk:
            obj.updated_by = request.user
            
            # Handle timestamp updates with proper validation
            if 'created_at' in form.changed_data or 'updated_at' in form.changed_data or 'completed_at' in form.changed_data:
                # Use update_fields to bypass auto_now behavior for manual timestamp updates
                update_fields = ['updated_by']
                if 'created_at' in form.changed_data:
                    update_fields.append('created_at')
                if 'updated_at' in form.changed_data:
                    update_fields.append('updated_at')
                if 'completed_at' in form.changed_data:
                    update_fields.append('completed_at')
                
                # Save with specific update fields
                obj.save(update_fields=update_fields)
                return
        
        super().save_model(request, obj, form, change)

    def get_priority_display_colored(self, obj):
        priority_colors = {
            'low': 'green',
            'medium': 'orange',
            'high': 'red'
        }
        color = priority_colors.get(obj.priority, 'black')
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, obj.get_priority_display().title())
    get_priority_display_colored.short_description = 'Priority'
    get_priority_display_colored.admin_order_field = 'priority'

    def get_timestamps_display(self, obj):
        """Display timestamps in a compact, informative way"""
        created = obj.created_at.strftime('%Y-%m-%d %H:%M') if obj.created_at else 'N/A'
        updated = obj.updated_at.strftime('%Y-%m-%d %H:%M') if obj.updated_at else 'N/A'
        completed = obj.completed_at.strftime('%Y-%m-%d %H:%M') if obj.completed_at else 'N/A'
        
        return format_html(
            '<div style="font-size: 11px; line-height: 1.2;">'
            '<div><strong>Created:</strong> {}</div>'
            '<div><strong>Updated:</strong> {}</div>'
            '<div><strong>Completed:</strong> {}</div>'
            '</div>',
            created, updated, completed
        )
    get_timestamps_display.short_description = 'Timestamps'
    get_timestamps_display.admin_order_field = 'created_at'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'updated_by').prefetch_related('rooms__properties', 'topics')

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for instance in instances:
            if isinstance(instance, JobImage) and not instance.pk and not instance.uploaded_by_id:
                instance.uploaded_by = request.user
            instance.save()
        formset.save_m2m()

    # Admin actions for timestamp management and export
    actions = ['update_timestamps_to_now', 'reset_completed_timestamps', 'export_jobs_pdf']

    def update_timestamps_to_now(self, request, queryset):
        """Update selected jobs' timestamps to current time"""
        now = timezone.now()
        updated_count = 0
        
        for job in queryset:
            job.updated_at = now
            if job.status == 'completed' and not job.completed_at:
                job.completed_at = now
            job.save(update_fields=['updated_at', 'completed_at'])
            updated_count += 1
        
        self.message_user(request, f"Updated timestamps for {updated_count} jobs to current time.")
    update_timestamps_to_now.short_description = "Update timestamps to current time"

    def reset_completed_timestamps(self, request, queryset):
        """Reset completed timestamps for selected jobs"""
        updated_count = 0
        
        for job in queryset:
            if job.status == 'completed':
                job.completed_at = None
                job.save(update_fields=['completed_at'])
                updated_count += 1
        
        self.message_user(request, f"Reset completed timestamps for {updated_count} completed jobs.")
    reset_completed_timestamps.short_description = "Reset completed timestamps"

    def export_jobs_pdf(self, request, queryset):
        """Export selected/filtered jobs to a PDF with card-style rows matching the web Job PDF."""
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.lib.units import inch
            from reportlab.lib import colors
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont
        except Exception:
            self.message_user(request, 'ReportLab is required for PDF export. Install with: pip install reportlab', level='error')
            return None

        # Local imports for file handling
        import os
        from django.conf import settings
        from xml.sax.saxutils import escape as xml_escape

        # Prefetch related data to avoid N+1 queries
        qs = queryset.select_related('user').prefetch_related('rooms__properties', 'rooms', 'topics', 'job_images').order_by('created_at')

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
                        pdfmetrics.registerFont(TTFont(reg_name, reg))
                        pdfmetrics.registerFont(TTFont(bold_name, bold))
                        # Derive a family name (e.g., "Sarabun" from "Sarabun-Regular")
                        family_name = reg_name.rsplit('-', 1)[0] if '-' in reg_name else reg_name
                        try:
                            pdfmetrics.registerFontFamily(
                                family_name,
                                normal=reg_name,
                                bold=bold_name,
                                italic=reg_name,
                                boldItalic=bold_name,
                            )
                        except Exception:
                            # Family registration is best-effort; continue even if it fails
                            pass
                        thai_regular, thai_bold, thai_family = reg_name, bold_name, family_name
                        break
                except Exception:
                    # Try next candidate
                    continue

        register_thai_fonts()

        # Add Thai-capable styles
        if thai_regular:
            from reportlab.lib.styles import ParagraphStyle
            # Use the family for paragraph styles so inline <b> uses the Thai bold face
            base_family = thai_family or thai_regular
            styles.add(ParagraphStyle(name='ThaiTitle', parent=styles['Title'], fontName=thai_bold))
            styles.add(ParagraphStyle(name='ThaiHeading2', parent=styles['Heading2'], fontName=thai_bold))
            styles.add(ParagraphStyle(name='ThaiHeading3', parent=styles['Heading3'], fontName=thai_bold))
            styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], fontName=base_family, fontSize=9, leading=11, wordWrap='CJK'))
            styles.add(ParagraphStyle(name='ThaiSmall', parent=styles['Normal'], fontName=base_family, fontSize=8, leading=10, wordWrap='CJK'))
        else:
            # Fallback styles use default fonts
            from reportlab.lib.styles import ParagraphStyle
            styles.add(ParagraphStyle(name='ThaiTitle', parent=styles['Title']))
            styles.add(ParagraphStyle(name='ThaiHeading2', parent=styles['Heading2']))
            styles.add(ParagraphStyle(name='ThaiHeading3', parent=styles['Heading3']))
            styles.add(ParagraphStyle(name='ThaiNormal', parent=styles['Normal'], fontSize=9, leading=11))
            styles.add(ParagraphStyle(name='ThaiSmall', parent=styles['Normal'], fontSize=8, leading=10))
        story = []

        # Header
        now_display = timezone.now().strftime('%Y-%m-%d %H:%M')
        story.append(Paragraph("Jobs Report", styles['ThaiTitle']))
        story.append(Paragraph(f"Generated: {now_display}", styles['ThaiNormal']))
        story.append(Spacer(1, 10))

        # Layout helpers
        page_width, _page_height = A4
        usable_width = page_width - doc.leftMargin - doc.rightMargin

        # Column widths approx: image 20%, info 50% (split inside), status 30%
        col_widths = [usable_width * 0.20, usable_width * 0.50, usable_width * 0.30]

        header_font = thai_bold or 'Helvetica-Bold'
        body_font = thai_regular or 'Helvetica'

        def _escape_text(text):
            return xml_escape(text or '')

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

        # Color helpers for badges (approximate tinted backgrounds)
        status_bg_map = {
            'completed': colors.lightgreen,
            'in_progress': colors.lightblue,
            'pending': colors.lightgoldenrodyellow,
            'cancelled': colors.pink,
            'waiting_sparepart': colors.lavender,
        }
        status_text_map = {
            'completed': colors.green,
            'in_progress': colors.blue,
            'pending': colors.orange,
            'cancelled': colors.red,
            'waiting_sparepart': colors.purple,
        }
        priority_bg_map = {
            'high': colors.mistyrose,
            'medium': colors.bisque,
            'low': colors.honeydew,
        }
        priority_text_map = {
            'high': colors.red,
            'medium': colors.orange,
            'low': colors.green,
        }

        # Card renderer
        for job in qs:
            # Image cell
            img_path = _first_image_path(job)
            if img_path:
                try:
                    image_cell = Image(img_path, width=1.9*inch, height=1.35*inch)
                except Exception:
                    image_cell = Table([[Paragraph('No Image', styles['ThaiSmall'])]], colWidths=[1.9*inch], rowHeights=[1.35*inch])
                    image_cell.setStyle(TableStyle([
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('BACKGROUND', (0, 0), (-1, -1), colors.whitesmoke),
                        ('BOX', (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ]))
            else:
                image_cell = Table([[Paragraph('No Image', styles['ThaiSmall'])]], colWidths=[1.9*inch], rowHeights=[1.35*inch])
                image_cell.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BACKGROUND', (0, 0), (-1, -1), colors.whitesmoke),
                    ('BOX', (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ]))

            # Info column (two sub-columns)
            topics_str = ", ".join([t.title for t in job.topics.all()]) or 'N/A'
            rooms_str = ", ".join([r.name for r in job.rooms.all()]) or 'N/A'
            staff_str = job.user.get_full_name() if getattr(job.user, 'get_full_name', None) and job.user.get_full_name() else (job.user.username if job.user else 'N/A')

            left_info_rows = [
                [Paragraph(f"<b>Job ID:</b> #{_escape_text(str(job.job_id))}", styles['ThaiNormal'])],
                [Paragraph(f"<b>Topics:</b> {_escape_text(topics_str)}", styles['ThaiNormal'])],
                [Paragraph(f"<b>Description:</b> {_escape_text(job.description or '-')}", styles['ThaiNormal'])],
            ]
            right_info_rows = [
                [Paragraph(f"<b>Location:</b> {_escape_text(rooms_str)}", styles['ThaiNormal'])],
                [Paragraph(f"<b>Staff:</b> {_escape_text(staff_str)}", styles['ThaiNormal'])],
                [Paragraph(f"<b>Remarks:</b> {_escape_text(job.remarks or 'N/A')}", styles['ThaiNormal'])],
            ]

            left_info_table = Table(left_info_rows, colWidths=[col_widths[1] * 0.48])
            left_info_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTNAME', (0, 0), (-1, -1), body_font),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('LEADING', (0, 0), (-1, -1), 11),
            ]))

            right_info_table = Table(right_info_rows, colWidths=[col_widths[1] * 0.48])
            right_info_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTNAME', (0, 0), (-1, -1), body_font),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('LEADING', (0, 0), (-1, -1), 11),
            ]))

            info_table = Table([[left_info_table, right_info_table]], colWidths=[col_widths[1] * 0.5, col_widths[1] * 0.5])
            info_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))

            # Status/priority column
            status_key = (job.status or '').lower()
            priority_key = (job.priority or '').lower()
            status_label = job.get_status_display() if hasattr(job, 'get_status_display') else (job.status or '-')
            priority_label = job.get_priority_display().title() if hasattr(job, 'get_priority_display') and job.get_priority_display() else (job.priority or '-')

            status_badge = Table([[Paragraph(_escape_text(str(status_label)), styles['ThaiSmall'])]], colWidths=[col_widths[2] - 10])
            status_badge.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), status_bg_map.get(status_key, colors.whitesmoke)),
                ('TEXTCOLOR', (0, 0), (-1, -1), status_text_map.get(status_key, colors.grey)),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOX', (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))

            priority_badge = Table([[Paragraph(_escape_text(str(priority_label)), styles['ThaiSmall'])]], colWidths=[col_widths[2] - 10])
            priority_badge.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), priority_bg_map.get(priority_key, colors.whitesmoke)),
                ('TEXTCOLOR', (0, 0), (-1, -1), priority_text_map.get(priority_key, colors.grey)),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOX', (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))

            created_txt = job.created_at.strftime('%Y-%m-%d %H:%M') if job.created_at else ''
            updated_txt = job.updated_at.strftime('%Y-%m-%d %H:%M') if job.updated_at else ''
            completed_txt = job.completed_at.strftime('%Y-%m-%d %H:%M') if job.completed_at else ''

            status_table_rows = [
                [Paragraph('<b>Status:</b>', styles['ThaiSmall'])],
                [status_badge],
                [Spacer(1, 4)],
                [Paragraph('<b>Priority:</b>', styles['ThaiSmall'])],
                [priority_badge],
                [Spacer(1, 4)],
                [Paragraph(f"<b>Created:</b> {_escape_text(created_txt)}", styles['ThaiSmall'])],
                [Paragraph(f"<b>Updated:</b> {_escape_text(updated_txt)}", styles['ThaiSmall'])],
            ]
            if completed_txt:
                status_table_rows.append([Paragraph(f"<b>Completed:</b> {_escape_text(completed_txt)}", styles['ThaiSmall'])])

            status_table = Table(status_table_rows, colWidths=[col_widths[2] - 6])
            status_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))

            # Card container
            card = Table([[image_cell, info_table, status_table]], colWidths=col_widths)
            card.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BACKGROUND', (0, 0), (-1, -1), colors.white),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))

            story.append(card)
            # Separator line between cards
            sep = Table([['']], colWidths=[usable_width])
            sep.setStyle(TableStyle([
                ('LINEBELOW', (0, 0), (-1, -1), 0.3, colors.lightgrey),
            ]))
            story.append(sep)
            story.append(Spacer(1, 6))

        # Build PDF
        doc.build(story)
        buffer.seek(0)
        filename = f"jobs_{timezone.now().strftime('%Y_%m_%d')}.pdf"
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    export_jobs_pdf.short_description = "Export selected/filtered jobs to PDF"

@admin.register(JobImage)
class JobImageAdmin(admin.ModelAdmin):
    list_display = ('image_preview', 'job_link', 'uploaded_by', 'uploaded_at')
    list_filter = ('uploaded_at', 'uploaded_by')
    search_fields = ('job__job_id', 'uploaded_by__username')
    readonly_fields = ('image_preview', 'uploaded_at')
    raw_id_fields = ('job', 'uploaded_by')

    def image_preview(self, obj):
        if obj.image and hasattr(obj.image, 'url'):
            return format_html('<img src="{}" style="max-width: 100px; max-height: 100px;" />', obj.image.url)
        return "No Image"
    image_preview.short_description = 'Image Preview'

    def job_link(self, obj):
        if obj.job:
            from django.urls import reverse
            link = reverse("admin:myappLubd_job_change", args=[obj.job.id])
            return format_html('<a href="{}">{}</a>', link, obj.job.job_id)
        return "No Associated Job"
    job_link.short_description = 'Job'
    job_link.admin_order_field = 'job'

    def save_model(self, request, obj, form, change):
        if not obj.pk and not obj.uploaded_by_id:
            obj.uploaded_by = request.user
        super().save_model(request, obj, form, change)

@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ['property_id', 'name', 'created_at', 'get_users_count', 'is_preventivemaintenance']
    search_fields = ['property_id', 'name', 'description']
    list_filter = ['created_at', 'is_preventivemaintenance']
    filter_horizontal = ['users']
    readonly_fields = ['property_id', 'created_at']
    
    fieldsets = (
        ('Property Information', {
            'fields': ('property_id', 'name', 'description', 'is_preventivemaintenance')
        }),
        ('Users', {
            'fields': ('users',)
        }),
        ('Timestamps', {
            'classes': ('collapse',),
            'fields': ('created_at',)
        }),
    )

    def get_users_count(self, obj):
        return obj.users.count()
    get_users_count.short_description = 'Assigned Users'

class HasPreventiveMaintenanceFilter(admin.SimpleListFilter):
    title = 'has preventive maintenance job'
    parameter_name = 'has_pm_job'

    def lookups(self, request, model_admin):
        return (
            ('yes', 'Yes'),
            ('no', 'No'),
        )

    def queryset(self, request, queryset):
        if self.value() == 'yes':
            return queryset.filter(jobs__is_preventivemaintenance=True).distinct()
        if self.value() == 'no':
            return queryset.exclude(jobs__is_preventivemaintenance=True).distinct()
        return queryset

@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ['room_id', 'name', 'room_type', 'is_active', 'created_at', 'get_properties_display']
    list_filter = ['room_type', 'is_active', 'created_at', HasPreventiveMaintenanceFilter]
    search_fields = ['name', 'room_type', 'properties__name']
    filter_horizontal = ['properties']
    readonly_fields = ['room_id', 'created_at']
    actions = ['activate_rooms', 'deactivate_rooms']

    def get_properties_display(self, obj):
        return ", ".join([f"{prop.property_id} - {prop.name}" for prop in obj.properties.all()])
    get_properties_display.short_description = 'Properties (ID - Name)'

    def activate_rooms(self, request, queryset):
        updated_count = queryset.update(is_active=True)
        self.message_user(request, f"{updated_count} rooms have been activated.")
    activate_rooms.short_description = "Activate selected rooms"

    def deactivate_rooms(self, request, queryset):
        updated_count = queryset.update(is_active=False)
        self.message_user(request, f"{updated_count} rooms have been deactivated.")
    deactivate_rooms.short_description = "Deactivate selected rooms"

@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ['title', 'get_jobs_count']
    search_fields = ['title', 'description']
    list_filter = [HasPreventiveMaintenanceFilter]

    def get_jobs_count(self, obj):
        return obj.jobs.count()
    get_jobs_count.short_description = 'Associated Jobs'

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user_link', 'positions', 'user_property_name', 'user_property_id', 'get_properties_display', 'profile_image_preview']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'positions', 'properties__name', 'properties__property_id']
    filter_horizontal = ['properties']
    raw_id_fields = ['user']
    readonly_fields = [
        'profile_image_preview', 'google_id', 'email_verified', 
        'access_token', 'refresh_token', 'login_provider'
    ]
    fieldsets = (
        (None, {'fields': ('user', 'positions', 'profile_image', 'profile_image_preview')}),
        ('Accessible Properties', {'fields': ('properties',)}),
        ('Google Authentication Details', {
            'classes': ('collapse',),
            'fields': ('google_id', 'email_verified', 'access_token', 'refresh_token', 'login_provider'),
        }),
    )

    def user_link(self, obj):
        return obj.user.username
    user_link.short_description = 'User'

    def profile_image_preview(self, obj):
        if obj.profile_image and hasattr(obj.profile_image, 'url'):
            return format_html('<img src="{}" style="max-width: 100px; max-height: 100px; border-radius: 50%;" />', obj.profile_image.url)
        return "No Image"
    profile_image_preview.short_description = 'Profile Image'
    
    def user_property_name(self, obj):
        return obj.user.property_name if obj.user.property_name else "-"
    user_property_name.short_description = 'Property Name'
    
    def user_property_id(self, obj):
        """Display the property_id from the User model, or from related Property if available"""
        if obj.user.property_id:
            return obj.user.property_id
        
        # If User.property_id is empty, try to get it from the related Property
        if obj.user.accessible_properties.exists():
            property_obj = obj.user.accessible_properties.first()
            return property_obj.property_id if property_obj else "-"
        
        return "-"
    user_property_id.short_description = 'User Property ID'
    
    def profile_property_name(self, obj):
        return obj.property_name if obj.property_name else "-"
    profile_property_name.short_description = 'Profile Property Name'
    
    def profile_property_id(self, obj):
        """Display the property_id from the UserProfile model, or from related Property if available"""
        if obj.property_id:
            return obj.property_id
        
        # If UserProfile.property_id is empty, try to get it from the related Property
        if obj.properties.exists():
            property_obj = obj.properties.first()
            return property_obj.property_id if property_obj else "-"
        
        return "-"
    profile_property_id.short_description = 'Profile Property ID'

    def get_properties_display(self, obj):
        """Display properties from the ManyToManyField relationship"""
        if obj.properties.exists():
            return ", ".join([f"{prop.property_id} - {prop.name}" for prop in obj.properties.all()])
        return "No Properties"
    get_properties_display.short_description = 'Properties (ID - Name)'

@admin.register(PreventiveMaintenance)
class PreventiveMaintenanceAdmin(admin.ModelAdmin):
    list_display = (
        'pm_id',
        'pmtitle',
        'get_topics_display',
        'scheduled_date',
        'completed_date',
        'frequency',
        'next_due_date',
        'get_status_display',
        'created_by_user',
        'get_machines_display',
        'get_properties_display',
    )
    list_filter = (
        'frequency',
        ('completed_date', admin.EmptyFieldListFilter),
        'scheduled_date',
        'next_due_date',
    )
    search_fields = ('pm_id', 'notes', 'pmtitle', 'topics__title')
    date_hierarchy = 'scheduled_date'
    filter_horizontal = ['topics']
    readonly_fields = ('pm_id', 'next_due_date', 'before_image_preview', 'after_image_preview')
    fieldsets = (
        ('Identification', {
            'fields': ('pm_id', 'pmtitle', 'created_by')
        }),
        ('Schedule', {
            'fields': ('scheduled_date', 'frequency', 'custom_days', 'completed_date', 'next_due_date')
        }),
        ('Documentation & Images', {
            'fields': ('procedure', 'notes', 'before_image', 'before_image_preview', 'after_image', 'after_image_preview')
        }),
        ('Related Items', {
            'fields': ('topics',)
        }),
    )
    actions = ['mark_completed']

    def get_topics_display(self, obj):
        return ", ".join([topic.title for topic in obj.topics.all()])
    get_topics_display.short_description = 'Topics'

    def get_properties_display(self, obj):
        properties = []
        if obj.job and obj.job.rooms.exists():
            for room in obj.job.rooms.all():
                for prop in room.properties.all():
                    prop_display = f"{prop.property_id} - {prop.name}"
                    if prop_display not in properties:
                        properties.append(prop_display)
        return ", ".join(properties) if properties else "No Properties"
    get_properties_display.short_description = 'Properties (ID - Name)'

    def get_status_display(self, obj):
        if obj.completed_date:
            return format_html('<span style="color: green;">Completed</span>')
        elif obj.scheduled_date and obj.scheduled_date < timezone.now():
            return format_html('<span style="color: red;">Overdue</span>')
        elif obj.next_due_date and obj.next_due_date < timezone.now():
            return format_html('<span style="color: orange;">Next Due Overdue</span>')
        return format_html('<span style="color: blue;">Scheduled</span>')
    get_status_display.short_description = 'Status'
    get_status_display.admin_order_field = 'completed_date'

    def created_by_user(self, obj):
        return obj.created_by.username if obj.created_by else "N/A"
    created_by_user.short_description = 'Created By'
    created_by_user.admin_order_field = 'created_by'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('created_by').prefetch_related('topics')

    def save_model(self, request, obj, form, change):
        if not obj.pk and not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def mark_completed(self, request, queryset):
        now = timezone.now()
        updated_count = 0
        for pm in queryset:
            if not pm.completed_date:
                pm.completed_date = now
                pm.calculate_next_due_date()
                pm.save()
                updated_count += 1
        self.message_user(request, f"{updated_count} preventive maintenance tasks marked as completed.")
    mark_completed.short_description = "Mark selected tasks as completed"

    def before_image_preview(self, obj):
        if obj.before_image and hasattr(obj.before_image, 'url'):
            return format_html('<img src="{}" style="max-width: 100px; max-height: 100px;" />', obj.before_image.url)
        return "No Before Image"
    before_image_preview.short_description = 'Before Image Preview'

    def after_image_preview(self, obj):
        if obj.after_image and hasattr(obj.after_image, 'url'):
            return format_html('<img src="{}" style="max-width: 100px; max-height: 100px;" />', obj.after_image.url)
        return "No After Image"
    after_image_preview.short_description = 'After Image Preview'
    def get_machines_display(self, obj):
        return ", ".join([machine.name for machine in obj.machines.all()])
    get_machines_display.short_description = 'Machines'

@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ('user', 'session_token_short', 'expires_at', 'created_at', 'is_expired_status')
    search_fields = ('user__username', 'session_token')
    list_filter = ('expires_at', 'created_at')
    readonly_fields = ('user', 'session_token', 'access_token', 'refresh_token', 'expires_at', 'created_at')
    raw_id_fields = ('user',)

    fieldsets = (
        ('Session Info', {'fields': ('user', 'session_token', 'expires_at', 'created_at')}),
        ('Tokens (Read-Only)', {'classes': ('collapse',), 'fields': ('access_token', 'refresh_token')}),
    )

    def session_token_short(self, obj):
        return f"{obj.session_token[:20]}..." if obj.session_token else "N/A"
    session_token_short.short_description = 'Session Token (Short)'

    def is_expired_status(self, obj):
        return obj.is_expired()
    is_expired_status.boolean = True
    is_expired_status.short_description = 'Is Expired'


@admin.register(MaintenanceProcedure)
class MaintenanceProcedureAdmin(admin.ModelAdmin):
    list_display = ['name', 'estimated_duration', 'created_at', 'updated_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Procedure Information', {
            'fields': ('name', 'description', 'steps', 'estimated_duration')
        }),
        ('Requirements', {
            'fields': ('required_tools', 'safety_notes')
        }),
        ('Timestamps', {
            'classes': ('collapse',),
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(MaintenanceChecklist)
class MaintenanceChecklistAdmin(admin.ModelAdmin):
    list_display = ['maintenance', 'item', 'is_completed', 'completed_by', 'completed_at', 'order']
    list_filter = ['is_completed', 'completed_at', 'order']
    search_fields = ['item', 'maintenance__pm_id', 'maintenance__pmtitle']
    readonly_fields = ['completed_at']
    
    fieldsets = (
        ('Checklist Item', {
            'fields': ('maintenance', 'item', 'description', 'order')
        }),
        ('Completion', {
            'fields': ('is_completed', 'completed_by', 'completed_at')
        }),
    )


@admin.register(MaintenanceHistory)
class MaintenanceHistoryAdmin(admin.ModelAdmin):
    list_display = ['maintenance', 'action', 'performed_by', 'timestamp']
    list_filter = ['action', 'timestamp', 'performed_by']
    search_fields = ['maintenance__pm_id', 'action', 'notes', 'performed_by__username']
    readonly_fields = ['timestamp']
    
    fieldsets = (
        ('History Record', {
            'fields': ('maintenance', 'action', 'notes')
        }),
        ('Performer', {
            'fields': ('performed_by', 'timestamp')
        }),
    )


@admin.register(MaintenanceSchedule)
class MaintenanceScheduleAdmin(admin.ModelAdmin):
    list_display = ['maintenance', 'is_recurring', 'next_occurrence', 'last_occurrence', 'total_occurrences', 'is_active']
    list_filter = ['is_recurring', 'is_active', 'next_occurrence', 'last_occurrence']
    search_fields = ['maintenance__pm_id', 'maintenance__pmtitle']
    readonly_fields = ['total_occurrences']
    
    fieldsets = (
        ('Schedule Information', {
            'fields': ('maintenance', 'is_recurring', 'next_occurrence', 'last_occurrence')
        }),
        ('Recurrence Pattern', {
            'fields': ('recurrence_pattern', 'is_active')
        }),
        ('Statistics', {
            'classes': ('collapse',),
            'fields': ('total_occurrences',)
        }),
    )
