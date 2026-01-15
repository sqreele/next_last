import os
from django.contrib import admin
from django.utils.html import format_html, format_html_join
from django.utils import timezone
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

User = get_user_model()

# Custom User Admin
class CustomUserAdmin(BaseUserAdmin):
    list_per_page = 25
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
from django.db import models
from datetime import timedelta
from django.http import HttpResponse
from django.urls import reverse, path
from django.conf import settings
import csv
from io import BytesIO
import qrcode
import base64
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
    MaintenanceTaskImage,
    MaintenanceChecklist,
    MaintenanceHistory,
    MaintenanceSchedule,
    UtilityConsumption,
    Inventory,
    WorkspaceReport
)

# Custom Date Joined Month Filter for Admin
class DateJoinedMonthFilter(admin.SimpleListFilter):
    title = 'date joined (month)'
    parameter_name = 'date_joined_month'

    def lookups(self, request, model_admin):
        # Generate lookups for the last 12 months using standard library
        from datetime import datetime
        
        lookups = []
        current_date = datetime.now()
        
        for i in range(12):
            # Calculate month offset
            year = current_date.year
            month = current_date.month - i
            while month <= 0:
                month += 12
                year -= 1
            
            month_key = f'{year}-{month:02d}'
            month_label = datetime(year, month, 1).strftime('%B %Y')
            lookups.append((month_key, month_label))
        
        return lookups

    def queryset(self, request, queryset):
        if self.value():
            year, month = self.value().split('-')
            return queryset.filter(
                date_joined__year=int(year),
                date_joined__month=int(month)
            )
        return queryset

# Custom User Admin to show Google OAuth information
class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'
    fields = ['positions', 'profile_image', 'property_name', 'property_id', 'google_id', 'email_verified', 'login_provider']

class UserAdmin(BaseUserAdmin):
    list_per_page = 25
    inlines = (UserProfileInline,)
    list_display = ['username', 'email', 'first_name', 'last_name', 'property_name', 'get_property_id_display', 'get_google_info', 'is_staff', 'is_active', 'jobs_this_month', 'date_joined']
    list_filter = ['is_staff', 'is_superuser', 'is_active', 'groups', 'date_joined', DateJoinedMonthFilter, 'property_name']
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


# ========================================
# Month Filters - Filter by month for date fields
# ========================================
# Note: Moved here to ensure filters are defined before ModelAdmin classes that use them

def create_month_filter(date_field, filter_title=None, param_name=None):
    """
    Factory function to create a month filter for any date field.
    Usage: CreatedAtMonthFilter = create_month_filter('created_at', 'Created Month', 'created_month')
    """
    class MonthFilter(admin.SimpleListFilter):
        title = filter_title or f'{date_field.replace("_", " ").title()} Month'
        parameter_name = param_name or f'{date_field}_month'

        def lookups(self, request, model_admin):
            # Get distinct year-month combinations from the database
            from django.db.models.functions import TruncMonth
            from django.db.models import Count
            
            try:
                # Get all distinct months from the date field
                queryset = model_admin.get_queryset(request)
                dates = (
                    queryset
                    .exclude(**{f'{date_field}__isnull': True})
                    .annotate(month=TruncMonth(date_field))
                    .values('month')
                    .annotate(count=Count('id'))
                    .order_by('-month')
                )
                
                months = []
                for entry in dates:
                    if entry['month']:
                        month_str = entry['month'].strftime('%Y-%m')
                        month_display = entry['month'].strftime('%B %Y')
                        months.append((month_str, f"{month_display} ({entry['count']})"))
                
                return months
            except Exception:
                return []

        def queryset(self, request, queryset):
            if self.value():
                try:
                    year, month = self.value().split('-')
                    return queryset.filter(**{
                        f'{date_field}__year': int(year),
                        f'{date_field}__month': int(month)
                    })
                except (ValueError, TypeError):
                    pass
            return queryset
    
    return MonthFilter


# Pre-defined month filters for common date fields
CreatedAtMonthFilter = create_month_filter('created_at', 'Created Month', 'created_month')
UpdatedAtMonthFilter = create_month_filter('updated_at', 'Updated Month', 'updated_month')
UploadedAtMonthFilter = create_month_filter('uploaded_at', 'Uploaded Month', 'uploaded_month')
ScheduledDateMonthFilter = create_month_filter('scheduled_date', 'Scheduled Month', 'scheduled_month')
CompletedDateMonthFilter = create_month_filter('completed_date', 'Completed Month', 'completed_month')
DueDateMonthFilter = create_month_filter('next_due_date', 'Due Date Month', 'due_month')
LastRestockedMonthFilter = create_month_filter('last_restocked', 'Restocked Month', 'restocked_month')
ExpiryDateMonthFilter = create_month_filter('expiry_date', 'Expiry Month', 'expiry_month')
InstallationDateMonthFilter = create_month_filter('installation_date', 'Installation Month', 'installation_month')
LastMaintenanceDateMonthFilter = create_month_filter('last_maintenance_date', 'Last Maintenance Month', 'last_maintenance_month')
CompletedAtMonthFilter = create_month_filter('completed_at', 'Completed Month', 'completed_month')
TimestampMonthFilter = create_month_filter('timestamp', 'Timestamp Month', 'timestamp_month')
NextOccurrenceMonthFilter = create_month_filter('next_occurrence', 'Next Occurrence Month', 'next_occurrence_month')
LastOccurrenceMonthFilter = create_month_filter('last_occurrence', 'Last Occurrence Month', 'last_occurrence_month')
ExpiresAtMonthFilter = create_month_filter('expires_at', 'Expires Month', 'expires_month')


# Add this new admin class for Machine
@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = [
        'machine_id', 
        'name', 
        'brand',
        'category',
        'serial_number',
        'property_link', 
        'location', 
        'status',
        'group_id',
        'installation_date', 
        'last_maintenance_date',
        'next_maintenance_date',
        'task_count',
        'procedure_count',
        'get_group_ids'
    ]
    list_filter = ['status', 'category', 'brand', 'property', 'group_id', 'created_at', CreatedAtMonthFilter, 'installation_date', InstallationDateMonthFilter]
    search_fields = ['machine_id', 'name', 'brand', 'serial_number', 'description', 'location', 'group_id']
    readonly_fields = ['created_at', 'updated_at', 'next_maintenance_date', 'qr_code_preview', 'maintenance_procedures_display', 'get_group_ids']  # Removed machine_id - now editable
    filter_horizontal = ['preventive_maintenances']
    
    fieldsets = (
        ('Equipment Information', {
            'fields': ('machine_id', 'name', 'brand', 'category', 'serial_number', 'description', 'location', 'status', 'group_id')
        }),
        ('Property & Maintenance', {
            'fields': ('property', 'preventive_maintenances', 'maintenance_procedures_display', 'get_group_ids', 'installation_date', 'last_maintenance_date')
        }),
        ('QR Code', {
            'fields': ('qr_code_preview',),
            'description': 'QR code for quick access to this machine\'s details page'
        }),
        ('Timestamps', {
            'classes': ('collapse',),
            'fields': ('created_at', 'updated_at')
        }),
    )
    
    def task_count(self, obj):
        """Display the number of maintenance tasks for this equipment"""
        # maintenance_tasks relationship removed - equipment no longer linked to task templates
        return 0
    task_count.short_description = 'Tasks'

    def procedure_count(self, obj):
        """Display the number of maintenance procedure templates assigned to this machine"""
        try:
            return obj.maintenance_procedures.count()
        except (AttributeError, Exception) as e:
            # Handle case where migration hasn't been applied or table doesn't exist
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Could not count maintenance_procedures for machine {obj.id}: {e}")
            return 0
    procedure_count.short_description = 'Procedure Templates'

    def get_group_ids(self, obj):
        """Display unique group_id values from machine's own group_id and related maintenance procedures"""
        group_ids = set()
        
        # Add machine's own group_id if it exists
        if obj.group_id:
            group_ids.add(obj.group_id)
        
        # Add group_ids from related maintenance procedures
        try:
            procedure_group_ids = obj.maintenance_procedures.values_list('group_id', flat=True).distinct()
            for gid in procedure_group_ids:
                if gid:  # Filter out None values
                    group_ids.add(gid)
        except (AttributeError, Exception) as e:
            # Handle case where migration hasn't been applied or table doesn't exist
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Could not fetch maintenance_procedures group_ids for machine {obj.id}: {e}")
            pass
        
        if group_ids:
            # Format as badges for better visibility
            badges = [format_html('<span style="background-color: #e3f2fd; color: #1976d2; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-right: 4px; display: inline-block;">{}</span>', gid) for gid in sorted(group_ids)]
            return format_html(''.join(badges))
        return format_html('<span style="color: #999;">No task groups</span>')
    get_group_ids.short_description = 'All Task Groups'

    def maintenance_procedures_display(self, obj):
        """Display linked maintenance procedures as read-only"""
        if obj.pk:
            try:
                procedures = obj.maintenance_procedures.all()
                if procedures.exists():
                    from django.urls import reverse
                    links = []
                    for proc in procedures:
                        url = reverse("admin:myappLubd_maintenanceprocedure_change", args=[proc.pk])
                        links.append(format_html('<a href="{}">{}</a>', url, proc.name))
                    return format_html('<br>'.join(links))
                return 'No maintenance procedures assigned'
            except Exception as e:
                # Handle case where migration hasn't been applied or table doesn't exist
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Could not fetch maintenance_procedures for machine {obj.id}: {e}")
                return format_html('<span style="color: orange;">Error loading procedures</span>')
        return 'Save the machine first to assign maintenance procedures'
    maintenance_procedures_display.short_description = 'Maintenance Procedures'

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
        """Get queryset with optimizations, handling potential migration issues"""
        try:
            return super().get_queryset(request).select_related('property').prefetch_related('preventive_maintenances', 'maintenance_procedures')
        except Exception as e:
            # Fallback if maintenance_procedures relationship doesn't exist yet
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Could not prefetch maintenance_procedures in MachineAdmin: {e}")
            return super().get_queryset(request).select_related('property').prefetch_related('preventive_maintenances')

    def get_machine_url(self, obj):
        """Generate the frontend URL for this machine"""
        if not obj or not obj.machine_id:
            return ''
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3000')
        return f"{frontend_url}/dashboard/machines/{obj.machine_id}"

    def qr_code_preview(self, obj):
        """Display QR code preview in admin"""
        if not obj or not obj.machine_id:
            return format_html('<p style="color: #999;">Save the machine first to generate QR code</p>')
        
        try:
            machine_url = self.get_machine_url(obj)
            if not machine_url:
                return format_html('<p style="color: #999;">Unable to generate QR code</p>')
            
            # Generate QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            qr.add_data(machine_url)
            qr.make(fit=True)
            
            # Create image
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Convert to base64 for display
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            img_str = base64.b64encode(buffer.getvalue()).decode()
            
            # Generate download link
            download_url = reverse('admin:machine_qr_code_download', args=[obj.pk])
            
            return format_html(
                '<div style="text-align: center; padding: 20px;">'
                '<img src="data:image/png;base64,{}" style="max-width: 200px; border: 2px solid #ddd; padding: 10px; background: white;" /><br/>'
                '<p style="margin-top: 10px; font-size: 11px; color: #666; word-break: break-all;">{}</p>'
                '<a href="{}" style="display: inline-block; margin-top: 10px; padding: 8px 16px; background: #417690; color: white; text-decoration: none; border-radius: 4px;">Download QR Code</a>'
                '</div>',
                img_str,
                machine_url,
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
                name='machine_qr_code_download',
            ),
        ]
        return custom_urls + urls

    def download_qr_code(self, request, object_id):
        """Download QR code as PNG file"""
        try:
            machine = Machine.objects.get(pk=object_id)
            machine_url = self.get_machine_url(machine)
            
            if not machine_url:
                return HttpResponse("Unable to generate QR code: Invalid machine URL", status=400)
            
            # Generate QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            qr.add_data(machine_url)
            qr.make(fit=True)
            
            # Create image
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Save to BytesIO
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            buffer.seek(0)
            
            # Create HTTP response
            response = HttpResponse(buffer.getvalue(), content_type='image/png')
            response['Content-Disposition'] = f'attachment; filename="machine-{machine.machine_id}-qr-code.png"'
            return response
            
        except Machine.DoesNotExist:
            return HttpResponse("Machine not found", status=404)
        except Exception as e:
            return HttpResponse(f"Error generating QR code: {str(e)}", status=500)

    actions = ['schedule_maintenance', 'download_qr_codes', 'export_machines_csv']

    def export_machines_csv(self, request, queryset):
        """Export selected/filtered machines to CSV"""
        qs = queryset.select_related('property').prefetch_related('preventive_maintenances', 'maintenance_procedures').order_by('machine_id')
        
        filename = f"machines_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')  # BOM for Excel UTF-8 compatibility
        
        writer = csv.writer(response)
        writer.writerow([
            'Machine ID',
            'Name',
            'Brand',
            'Category',
            'Serial Number',
            'Description',
            'Location',
            'Status',
            'Group ID',
            'Property',
            'Property ID',
            'Installation Date',
            'Last Maintenance Date',
            'Next Maintenance Date',
            'Created At',
            'Updated At',
        ])
        
        for machine in qs:
            writer.writerow([
                machine.machine_id or '',
                machine.name or '',
                machine.brand or '',
                machine.category or '',
                machine.serial_number or '',
                machine.description or '',
                machine.location or '',
                machine.get_status_display() if hasattr(machine, 'get_status_display') else machine.status or '',
                machine.group_id or '',
                machine.property.name if machine.property else '',
                machine.property.property_id if machine.property else '',
                machine.installation_date.strftime('%Y-%m-%d') if machine.installation_date else '',
                machine.last_maintenance_date.strftime('%Y-%m-%d %H:%M:%S') if machine.last_maintenance_date else '',
                machine.get_next_maintenance_date().strftime('%Y-%m-%d %H:%M:%S') if machine.get_next_maintenance_date() else '',
                machine.created_at.strftime('%Y-%m-%d %H:%M:%S') if machine.created_at else '',
                machine.updated_at.strftime('%Y-%m-%d %H:%M:%S') if machine.updated_at else '',
            ])
        
        return response
    export_machines_csv.short_description = "Export selected/filtered machines to CSV"

    def schedule_maintenance(self, request, queryset):
        # This would ideally redirect to a custom view for scheduling maintenance
        # For simplicity, we'll just show a message here
        self.message_user(request, f"Selected {queryset.count()} machines for maintenance scheduling. Please use the preventive maintenance section to create schedules.")
    schedule_maintenance.short_description = "Schedule maintenance for selected machines"

    def download_qr_codes(self, request, queryset):
        """Download QR codes for selected machines as a zip file"""
        try:
            import zipfile
            from django.http import HttpResponse
            
            buffer = BytesIO()
            with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for machine in queryset:
                    if not machine.machine_id:
                        continue
                    
                    machine_url = self.get_machine_url(machine)
                    if not machine_url:
                        continue
                    
                    # Generate QR code
                    qr = qrcode.QRCode(
                        version=1,
                        error_correction=qrcode.constants.ERROR_CORRECT_H,
                        box_size=10,
                        border=4,
                    )
                    qr.add_data(machine_url)
                    qr.make(fit=True)
                    
                    # Create image
                    img = qr.make_image(fill_color="black", back_color="white")
                    
                    # Save to BytesIO
                    img_buffer = BytesIO()
                    img.save(img_buffer, format='PNG')
                    img_buffer.seek(0)
                    
                    # Add to zip
                    zip_file.writestr(f"machine-{machine.machine_id}-qr-code.png", img_buffer.getvalue())
            
            buffer.seek(0)
            response = HttpResponse(buffer.getvalue(), content_type='application/zip')
            response['Content-Disposition'] = 'attachment; filename="machine-qr-codes.zip"'
            return response
            
        except Exception as e:
            self.message_user(request, f"Error generating QR codes: {str(e)}", level='error')
    download_qr_codes.short_description = "Download QR codes for selected machines"
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

class RoomFilter(admin.SimpleListFilter):
    title = 'room'
    parameter_name = 'room'

    def lookups(self, request, model_admin):
        return [(str(r.room_id), r.name) for r in Room.objects.all().order_by('name')]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(rooms__room_id=self.value()).distinct()
        return queryset

class TopicFilter(admin.SimpleListFilter):
    title = 'topic'
    parameter_name = 'topic'

    def lookups(self, request, model_admin):
        return [(str(t.id), t.title) for t in Topic.objects.all().order_by('title')]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(topics__id=self.value()).distinct()
        return queryset

# Filters specifically for JobImage admin
class JobImagePropertyFilter(admin.SimpleListFilter):
    title = 'property'
    parameter_name = 'property'

    def lookups(self, request, model_admin):
        return [(str(p.id), p.name) for p in Property.objects.all().order_by('name')]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(job__rooms__properties__id=self.value()).distinct()
        return queryset

class JobImageRoomFilter(admin.SimpleListFilter):
    title = 'room'
    parameter_name = 'room'

    def lookups(self, request, model_admin):
        return [(str(r.room_id), r.name) for r in Room.objects.all().order_by('name')]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(job__rooms__room_id=self.value()).distinct()
        return queryset

class JobImageTopicFilter(admin.SimpleListFilter):
    title = 'topic'
    parameter_name = 'topic'

    def lookups(self, request, model_admin):
        return [(str(t.id), t.title) for t in Topic.objects.all().order_by('title')]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(job__topics__id=self.value()).distinct()
        return queryset


# ModelAdmins
@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_per_page = 25
    form = JobAdminForm
    list_display = ['job_id', 'get_description_display', 'get_status_display_colored', 'get_priority_display_colored', 'get_user_display', 'user_id', 'get_properties_display', 'get_inventory_items_display', 'get_timestamps_display', 'is_preventivemaintenance']
    list_filter = ['status', 'priority', 'is_defective', 'created_at', CreatedAtMonthFilter, 'updated_at', UpdatedAtMonthFilter, 'is_preventivemaintenance', 'user', PropertyFilter, RoomFilter, TopicFilter]
    search_fields = ['job_id', 'description', 'user__username', 'updated_by__username', 'topics__title']
    readonly_fields = ['job_id', 'updated_by', 'inventory_items_display']
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
        ('Inventory Used', {
            'fields': ('inventory_items_display',),
            'description': 'Inventory items linked to this job'
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

    def get_inventory_items_display(self, obj):
        """Display inventory items used in this job"""
        inventory_items = obj.inventory_items.all()
        if not inventory_items.exists():
            return format_html('<span style="color: #999;">No inventory items</span>')
        
        items_list = []
        for item in inventory_items:
            link = reverse("admin:myappLubd_inventory_change", args=[item.id])
            items_list.append(
                format_html(
                    '<a href="{}">{} - {} (Qty: {})</a>',
                    link,
                    item.item_id,
                    item.name,
                    item.quantity
                )
            )
        return format_html('<br>'.join(items_list))
    get_inventory_items_display.short_description = 'Inventory Used'
    
    def inventory_items_display(self, obj):
        """Display inventory items in detail view"""
        return self.get_inventory_items_display(obj)
    inventory_items_display.short_description = 'Inventory Items Used'
    
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
    actions = ['update_timestamps_to_now', 'reset_completed_timestamps', 'export_jobs_pdf', 'export_jobs_csv']

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
            # Include both room type and name
            rooms_list = [f"{r.room_type} - {r.name}" for r in job.rooms.all()]
            rooms_str = ", ".join(rooms_list) if rooms_list else 'N/A'

            # Build status table rows with Location at the top
            status_table_rows = []
            
            # Location first (if available)
            if rooms_str != 'N/A':
                status_table_rows.extend([
                    [_make_paragraph('<font color="#6b7280" size="7"><b>Location:</b></font>', styles['ThaiSmall'])],
                    [_make_paragraph(f'<font size="8">{_escape_text(rooms_str)}</font>', styles['ThaiNormal'])],
                    [Spacer(1, 3)],
                ])
            
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

    def export_jobs_csv(self, request, queryset):
        """Export selected/filtered jobs to CSV"""
        import csv
        from django.utils import timezone
        
        # Prefetch related data to avoid N+1 queries
        qs = queryset.select_related('user').prefetch_related('rooms__properties', 'rooms', 'topics', 'job_images').order_by('created_at')
        
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
            'Location (Room Type - Room Name)',
            'Properties',
            'Remarks',
            'Is Defective',
            'Is Preventive Maintenance',
            'Created At',
            'Updated At',
            'Completed At',
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
            
            # Get rooms with type
            rooms = ", ".join([f"{r.room_type} - {r.name}" for r in job.rooms.all()])
            
            # Get properties
            properties = []
            if job.rooms.exists():
                for room in job.rooms.all():
                    for prop in room.properties.all():
                        prop_display = f"{prop.property_id} - {prop.name}"
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
            
            writer.writerow([
                job.job_id,
                job.description or '',
                status,
                priority,
                user_info,
                topics,
                rooms,
                properties_str,
                job.remarks or '',
                'Yes' if job.is_defective else 'No',
                'Yes' if job.is_preventivemaintenance else 'No',
                created_at,
                updated_at,
                completed_at,
            ])
        
        return response
    export_jobs_csv.short_description = "Export selected/filtered jobs to CSV"

@admin.register(JobImage)
class JobImageAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ('image_preview', 'job_link', 'uploaded_by', 'uploaded_at')
    list_filter = (
        'uploaded_at',
        UploadedAtMonthFilter,
        'uploaded_by',
        JobImagePropertyFilter,
        JobImageRoomFilter,
        JobImageTopicFilter,
    )
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
    
    actions = ['export_jobimages_csv']
    
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
            'Uploaded By',
            'Uploaded By Email',
            'Uploaded At',
        ])
        
        for img in qs:
            writer.writerow([
                img.id,
                img.job.job_id if img.job else '',
                img.image.url if img.image and hasattr(img.image, 'url') else '',
                img.uploaded_by.username if img.uploaded_by else '',
                img.uploaded_by.email if img.uploaded_by else '',
                img.uploaded_at.strftime('%Y-%m-%d %H:%M:%S') if img.uploaded_at else '',
            ])
        
        return response
    export_jobimages_csv.short_description = "Export selected/filtered job images to CSV"

@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['property_id', 'name', 'created_at', 'get_users_count', 'is_preventivemaintenance']
    search_fields = ['property_id', 'name', 'description']
    list_filter = ['created_at', CreatedAtMonthFilter, 'is_preventivemaintenance']
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
    
    actions = ['export_properties_csv']
    
    def export_properties_csv(self, request, queryset):
        """Export selected/filtered properties to CSV"""
        qs = queryset.prefetch_related('users').order_by('property_id')
        
        filename = f"properties_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'Property ID',
            'Name',
            'Description',
            'Is Preventive Maintenance',
            'Assigned Users',
            'User Count',
            'Created At',
        ])
        
        for prop in qs:
            users = ", ".join([f"{u.username} ({u.email})" for u in prop.users.all()])
            writer.writerow([
                prop.property_id or '',
                prop.name or '',
                prop.description or '',
                'Yes' if prop.is_preventivemaintenance else 'No',
                users,
                prop.users.count(),
                prop.created_at.strftime('%Y-%m-%d %H:%M:%S') if prop.created_at else '',
            ])
        
        return response
    export_properties_csv.short_description = "Export selected/filtered properties to CSV"

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
    list_per_page = 25
    list_display = ['room_id', 'name', 'room_type', 'is_active', 'created_at', 'get_properties_display']
    list_filter = ['room_type', 'is_active', 'created_at', CreatedAtMonthFilter, HasPreventiveMaintenanceFilter]
    search_fields = ['name', 'room_type', 'properties__name']
    filter_horizontal = ['properties']
    readonly_fields = ['room_id', 'created_at']
    actions = ['activate_rooms', 'deactivate_rooms', 'export_rooms_csv']

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
    
    def export_rooms_csv(self, request, queryset):
        """Export selected/filtered rooms to CSV"""
        qs = queryset.prefetch_related('properties').order_by('room_id')
        
        filename = f"rooms_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'Room ID',
            'Name',
            'Room Type',
            'Is Active',
            'Properties',
            'Created At',
        ])
        
        for room in qs:
            properties = ", ".join([f"{p.property_id} - {p.name}" for p in room.properties.all()])
            writer.writerow([
                room.room_id or '',
                room.name or '',
                room.room_type or '',
                'Yes' if room.is_active else 'No',
                properties,
                room.created_at.strftime('%Y-%m-%d %H:%M:%S') if room.created_at else '',
            ])
        
        return response
    export_rooms_csv.short_description = "Export selected/filtered rooms to CSV"

@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['title', 'get_jobs_count']
    search_fields = ['title', 'description']
    list_filter = [HasPreventiveMaintenanceFilter]

    def get_jobs_count(self, obj):
        return obj.jobs.count()
    get_jobs_count.short_description = 'Associated Jobs'
    
    actions = ['export_topics_csv']
    
    def export_topics_csv(self, request, queryset):
        """Export selected/filtered topics to CSV"""
        qs = queryset.prefetch_related('jobs').order_by('title')
        
        filename = f"topics_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Title',
            'Description',
            'Associated Jobs Count',
        ])
        
        for topic in qs:
            writer.writerow([
                topic.id,
                topic.title or '',
                topic.description or '',
                topic.jobs.count(),
            ])
        
        return response
    export_topics_csv.short_description = "Export selected/filtered topics to CSV"

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['user_link', 'positions', 'user_property_name', 'user_property_id', 'get_properties_display', 'email_notifications_enabled', 'profile_image_preview']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'positions', 'properties__name', 'properties__property_id']
    list_filter = ['email_notifications_enabled', 'properties']
    filter_horizontal = ['properties']
    raw_id_fields = ['user']
    readonly_fields = [
        'profile_image_preview', 'google_id', 'email_verified', 
        'access_token', 'refresh_token', 'login_provider'
    ]
    fieldsets = (
        (None, {'fields': ('user', 'positions', 'profile_image', 'profile_image_preview')}),
        ('Email Settings', {'fields': ('email_notifications_enabled',)}),
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
    
    actions = ['export_userprofiles_csv']
    
    def export_userprofiles_csv(self, request, queryset):
        """Export selected/filtered user profiles to CSV"""
        qs = queryset.select_related('user').prefetch_related('properties').order_by('user__username')
        
        filename = f"user_profiles_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'User',
            'Username',
            'Email',
            'Positions',
            'User Property Name',
            'User Property ID',
            'Properties',
            'Google ID',
            'Email Verified',
            'Login Provider',
        ])
        
        for profile in qs:
            properties = ", ".join([f"{p.property_id} - {p.name}" for p in profile.properties.all()])
            writer.writerow([
                profile.user.username if profile.user else '',
                profile.user.username if profile.user else '',
                profile.user.email if profile.user else '',
                profile.positions or '',
                profile.user.property_name if profile.user else '',
                profile.user.property_id if profile.user else '',
                properties,
                profile.google_id or '',
                'Yes' if profile.email_verified else 'No',
                profile.login_provider or '',
            ])
        
        return response
    export_userprofiles_csv.short_description = "Export selected/filtered user profiles to CSV"

@admin.register(PreventiveMaintenance)
class PreventiveMaintenanceAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = (
        'pm_id',
        'pmtitle',
        'get_topics_display',
        'scheduled_date',
        'completed_date',
        # 'frequency',  # Removed - defaults to monthly
        'next_due_date',
        'get_status_display',
        'get_assigned_to_display',
        'created_by_user',
        'get_machines_display',
        'get_properties_display',
        'get_inventory_items_display',
        'get_task_template_display',
    )
    list_filter = (
        # 'frequency',  # Removed - defaults to monthly
        ('completed_date', admin.EmptyFieldListFilter),
        CompletedDateMonthFilter,
        'scheduled_date',
        ScheduledDateMonthFilter,
        'next_due_date',
        DueDateMonthFilter,
        'procedure_template',
    )
    search_fields = ('pm_id', 'notes', 'pmtitle', 'topics__title')
    date_hierarchy = 'scheduled_date'
    filter_horizontal = ['topics']
    readonly_fields = ('pm_id', 'next_due_date', 'before_image_preview', 'after_image_preview', 'inventory_items_display')
    fieldsets = (
        ('Identification', {
            'fields': ('pm_id', 'pmtitle', 'created_by', 'assigned_to')
        }),
        ('Schedule', {
            'fields': ('scheduled_date', 'completed_date', 'next_due_date')
        }),
        ('Task Template', {
            'fields': ('procedure_template',),
            'description': 'Link this maintenance to a reusable task template (optional)'
        }),
        ('Advanced', {
            'classes': ('collapse',),
            'fields': ('frequency', 'custom_days'),
            'description': 'Advanced scheduling options (defaults to monthly)'
        }),
        ('Documentation & Images', {
            'fields': ('procedure', 'notes', 'before_image', 'before_image_preview', 'after_image', 'after_image_preview')
        }),
        ('Related Items', {
            'fields': ('topics',)
        }),
        ('Inventory Used', {
            'fields': ('inventory_items_display',),
            'description': 'Inventory items linked to this preventive maintenance'
        }),
    )
    actions = ['mark_completed', 'export_pm_csv']

    def get_topics_display(self, obj):
        return ", ".join([topic.title for topic in obj.topics.all()])
    get_topics_display.short_description = 'Topics'

    def get_properties_display(self, obj):
        properties = []
        
        # Get properties through job->rooms->properties relationship
        if obj.job and obj.job.rooms.exists():
            for room in obj.job.rooms.all():
                for prop in room.properties.all():
                    prop_display = f"{prop.property_id} - {prop.name}"
                    if prop_display not in properties:
                        properties.append(prop_display)
        
        # Get properties through machines->property relationship
        if obj.machines.exists():
            for machine in obj.machines.all():
                if machine.property:
                    prop_display = f"{machine.property.property_id} - {machine.property.name}"
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

    def get_assigned_to_display(self, obj):
        if obj.assigned_to:
            full_name = obj.assigned_to.get_full_name()
            if full_name:
                return format_html('<span style="color: #0284c7;">{}</span>', full_name)
            return format_html('<span style="color: #0284c7;">{}</span>', obj.assigned_to.username)
        return format_html('<span style="color: #9ca3af;">Unassigned</span>')
    get_assigned_to_display.short_description = 'Assigned To'
    get_assigned_to_display.admin_order_field = 'assigned_to'

    def created_by_user(self, obj):
        return obj.created_by.username if obj.created_by else "N/A"
    created_by_user.short_description = 'Created By'
    created_by_user.admin_order_field = 'created_by'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('created_by', 'assigned_to', 'procedure_template').prefetch_related(
            'topics', 'machines__property', 'job__rooms__properties'
        )

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

    def export_pm_csv(self, request, queryset):
        """Export selected/filtered preventive maintenance records to CSV"""
        import csv
        from django.utils import timezone
        
        # Prefetch related data to avoid N+1 queries
        qs = queryset.select_related(
            'created_by', 'assigned_to', 'procedure_template'
        ).prefetch_related('topics', 'machines__property').order_by('scheduled_date')
        
        # Create the HttpResponse object with CSV header
        filename = f"preventive_maintenance_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        # Add BOM for Excel UTF-8 compatibility
        response.write('\ufeff')
        
        writer = csv.writer(response)
        
        # Write header row
        writer.writerow([
            'PM ID',
            'Title',
            'Scheduled Date',
            'Completed Date',
            'Status',
            'Frequency',
            'Custom Days',
            'Next Due Date',
            'Assigned To',
            'Assigned Email',
            'Created By',
            'Creator Email',
            'Task Template',
            'Machines',
            'Properties',
            'Topics',
            'Procedure',
            'Notes',
            'Has Before Image',
            'Has After Image',
        ])
        
        # Write data rows
        for pm in qs:
            # Get status
            if pm.completed_date:
                status = 'Completed'
            elif pm.scheduled_date and pm.scheduled_date < timezone.now():
                status = 'Overdue'
            else:
                status = 'Scheduled'
            
            # Get assigned user info
            assigned_to = ''
            assigned_email = ''
            if pm.assigned_to:
                assigned_to = pm.assigned_to.get_full_name() or pm.assigned_to.username
                assigned_email = pm.assigned_to.email or ''
            
            # Get created by info
            created_by = ''
            creator_email = ''
            if pm.created_by:
                created_by = pm.created_by.get_full_name() or pm.created_by.username
                creator_email = pm.created_by.email or ''
            
            # Get topics
            topics = ", ".join([t.title for t in pm.topics.all()])
            
            # Get machines
            machines = ", ".join([f"{m.name} ({m.machine_id})" for m in pm.machines.all()])
            
            # Get properties
            properties = []
            if pm.machines.exists():
                for machine in pm.machines.all():
                    if machine.property:
                        prop_display = f"{machine.property.property_id} - {machine.property.name}"
                        if prop_display not in properties:
                            properties.append(prop_display)
            properties_str = ", ".join(properties)
            
            # Get task template
            task_template = ''
            if pm.procedure_template:
                task_template = f"{pm.procedure_template.name} (ID: {pm.procedure_template.id})"
            
            # Format dates
            scheduled_date = pm.scheduled_date.strftime('%Y-%m-%d %H:%M:%S') if pm.scheduled_date else ''
            completed_date = pm.completed_date.strftime('%Y-%m-%d %H:%M:%S') if pm.completed_date else ''
            next_due_date = pm.next_due_date.strftime('%Y-%m-%d %H:%M:%S') if pm.next_due_date else ''
            
            writer.writerow([
                pm.pm_id,
                pm.pmtitle or '',
                scheduled_date,
                completed_date,
                status,
                pm.frequency,
                pm.custom_days or '',
                next_due_date,
                assigned_to,
                assigned_email,
                created_by,
                creator_email,
                task_template,
                machines,
                properties_str,
                topics,
                pm.procedure or '',
                pm.notes or '',
                'Yes' if pm.before_image else 'No',
                'Yes' if pm.after_image else 'No',
            ])
        
        return response
    export_pm_csv.short_description = "Export selected/filtered PM records to CSV"

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

    def get_task_template_display(self, obj):
        if obj.procedure_template:
            return f"{obj.procedure_template.name} (ID: {obj.procedure_template.id})"
        return "No template"
    get_task_template_display.short_description = 'Task Template'
    get_task_template_display.admin_order_field = 'procedure_template'
    
    def get_inventory_items_display(self, obj):
        """Display inventory items used in this PM"""
        inventory_items = obj.inventory_items.all()
        if not inventory_items.exists():
            return format_html('<span style="color: #999;">No inventory items</span>')
        
        items_list = []
        for item in inventory_items:
            link = reverse("admin:myappLubd_inventory_change", args=[item.id])
            items_list.append(
                format_html(
                    '<a href="{}">{} - {} (Qty: {})</a>',
                    link,
                    item.item_id,
                    item.name,
                    item.quantity
                )
            )
        return format_html('<br>'.join(items_list))
    get_inventory_items_display.short_description = 'Inventory Used'
    
    def inventory_items_display(self, obj):
        """Display inventory items in detail view"""
        return self.get_inventory_items_display(obj)
    inventory_items_display.short_description = 'Inventory Items Used'

@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ('user', 'session_token_short', 'expires_at', 'created_at', 'is_expired_status')
    search_fields = ('user__username', 'session_token')
    list_filter = ('expires_at', ExpiresAtMonthFilter, 'created_at', CreatedAtMonthFilter)
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
    
    actions = ['export_sessions_csv']
    
    def export_sessions_csv(self, request, queryset):
        """Export selected/filtered sessions to CSV"""
        qs = queryset.select_related('user').order_by('-created_at')
        
        filename = f"sessions_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'User',
            'Username',
            'Email',
            'Session Token (First 20 chars)',
            'Expires At',
            'Is Expired',
            'Created At',
        ])
        
        for session in qs:
            writer.writerow([
                session.id,
                session.user.username if session.user else '',
                session.user.username if session.user else '',
                session.user.email if session.user else '',
                session.session_token[:20] + '...' if session.session_token else '',
                session.expires_at.strftime('%Y-%m-%d %H:%M:%S') if session.expires_at else '',
                'Yes' if session.is_expired() else 'No',
                session.created_at.strftime('%Y-%m-%d %H:%M:%S') if session.created_at else '',
            ])
        
        return response
    export_sessions_csv.short_description = "Export selected/filtered sessions to CSV"


@admin.register(MaintenanceProcedure)
class MaintenanceProcedureAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['name', 'group_id', 'category', 'frequency', 'responsible_department', 'estimated_duration', 'difficulty_level', 'machine_count', 'created_at']
    list_filter = ['group_id', 'category', 'frequency', 'responsible_department', 'difficulty_level', 'created_at', CreatedAtMonthFilter]
    search_fields = ['name', 'group_id', 'category', 'description']
    readonly_fields = ['created_at', 'updated_at']
    
    def _machines_field_accessible(self):
        """Check if machines field/table is accessible"""
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'myappLubd_maintenanceprocedure_machines'
                    );
                """)
                return cursor.fetchone()[0]
        except Exception:
            return False
    
    def __init__(self, *args, **kwargs):
        """Initialize admin with safe filter_horizontal setting"""
        super().__init__(*args, **kwargs)
        if self._machines_field_accessible():
            self.filter_horizontal = ['machines']
        else:
            self.filter_horizontal = []
    
    filter_horizontal = []  # Will be set in __init__ if table exists
    
    def get_fieldsets(self, request, obj=None):
        """Get fieldsets, conditionally including machines field"""
        fieldsets = [
            ('Task Information', {
                'fields': ('name', 'group_id', 'category', 'description', 'frequency', 'estimated_duration')
            }),
            ('Responsibility', {
                'fields': ('responsible_department', 'difficulty_level')
            }),
            ('Additional Details', {
                'fields': ('required_tools', 'safety_notes')
            }),
            ('Advanced', {
                'classes': ('collapse',),
                'fields': ('steps',),
                'description': 'Advanced: JSON step data (for API use only)'
            }),
            ('Timestamps', {
                'classes': ('collapse',),
                'fields': ('created_at', 'updated_at')
            }),
        ]
        
        # Only add machines fieldset if the relationship is accessible
        if self._machines_field_accessible():
            fieldsets.insert(2, ('Related Machines', {
                'fields': ('machines',),
                'description': 'Select the machines (equipment) that use this maintenance procedure template'
            }))
        
        return fieldsets

    def machine_count(self, obj):
        """Display the number of machines using this procedure"""
        try:
            return obj.machines.count()
        except (AttributeError, Exception) as e:
            # Handle case where migration hasn't been applied or table doesn't exist
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Could not count machines for maintenance procedure {obj.id}: {e}")
            return 0
    machine_count.short_description = 'Machines'
    machine_count.admin_order_field = 'machines__count'

    def get_queryset(self, request):
        """Get queryset with optimizations, handling potential migration issues"""
        try:
            return super().get_queryset(request).prefetch_related('machines')
        except Exception as e:
            # Fallback if machines relationship doesn't exist yet
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Could not prefetch machines in MaintenanceProcedureAdmin: {e}")
            return super().get_queryset(request)
    
    actions = ['export_maintenance_procedures_csv']
    
    def export_maintenance_procedures_csv(self, request, queryset):
        """Export selected/filtered maintenance procedures to CSV"""
        try:
            qs = queryset.prefetch_related('machines').order_by('name')
        except Exception:
            qs = queryset.order_by('name')
        
        filename = f"maintenance_procedures_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Name',
            'Group ID',
            'Category',
            'Description',
            'Frequency',
            'Estimated Duration',
            'Responsible Department',
            'Difficulty Level',
            'Required Tools',
            'Safety Notes',
            'Machines',
            'Machine Count',
            'Created At',
            'Updated At',
        ])
        
        for proc in qs:
            try:
                machines = ", ".join([f"{m.name} ({m.machine_id})" for m in proc.machines.all()])
                machine_count = proc.machines.count()
            except Exception:
                machines = ''
                machine_count = 0
            
            writer.writerow([
                proc.id,
                proc.name or '',
                proc.group_id or '',
                proc.category or '',
                proc.description or '',
                proc.frequency or '',
                proc.estimated_duration or '',
                proc.responsible_department or '',
                proc.difficulty_level or '',
                proc.required_tools or '',
                proc.safety_notes or '',
                machines,
                machine_count,
                proc.created_at.strftime('%Y-%m-%d %H:%M:%S') if proc.created_at else '',
                proc.updated_at.strftime('%Y-%m-%d %H:%M:%S') if proc.updated_at else '',
            ])
        
        return response
    export_maintenance_procedures_csv.short_description = "Export selected/filtered maintenance procedures to CSV"


@admin.register(MaintenanceTaskImage)
class MaintenanceTaskImageAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['id', 'task', 'image_type', 'image_preview', 'uploaded_by', 'uploaded_at']
    list_filter = ['image_type', 'uploaded_at', UploadedAtMonthFilter, 'task']
    search_fields = ['task__name', 'task__equipment__name']
    readonly_fields = ['uploaded_at', 'jpeg_path', 'image_preview_large']
    raw_id_fields = ['task', 'uploaded_by']
    
    fieldsets = (
        ('Image Information', {
            'fields': ('task', 'image_type', 'image_url', 'image_preview_large')
        }),
        ('Upload Details', {
            'fields': ('uploaded_by', 'uploaded_at', 'jpeg_path')
        }),
    )
    
    def image_preview(self, obj):
        """Display small image preview in list view"""
        if obj.image_url:
            return format_html(
                '<img src="{}" style="max-width: 100px; max-height: 100px; border-radius: 4px;" />',
                obj.image_url.url
            )
        return "No image"
    image_preview.short_description = 'Preview'
    
    def image_preview_large(self, obj):
        """Display larger image preview in detail view"""
        if obj.image_url:
            return format_html(
                '<img src="{}" style="max-width: 400px; max-height: 400px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />',
                obj.image_url.url
            )
        return "No image"
    image_preview_large.short_description = 'Image Preview'
    
    actions = ['export_maintenance_task_images_csv']
    
    def export_maintenance_task_images_csv(self, request, queryset):
        """Export selected/filtered maintenance task images to CSV"""
        qs = queryset.select_related('task', 'uploaded_by').order_by('uploaded_at')
        
        filename = f"maintenance_task_images_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Task',
            'Task Name',
            'Image Type',
            'Image URL',
            'JPEG Path',
            'Uploaded By',
            'Uploaded By Email',
            'Uploaded At',
        ])
        
        for img in qs:
            writer.writerow([
                img.id,
                str(img.task) if img.task else '',
                img.task.name if img.task else '',
                img.image_type or '',
                img.image_url.url if img.image_url and hasattr(img.image_url, 'url') else '',
                img.jpeg_path or '',
                img.uploaded_by.username if img.uploaded_by else '',
                img.uploaded_by.email if img.uploaded_by else '',
                img.uploaded_at.strftime('%Y-%m-%d %H:%M:%S') if img.uploaded_at else '',
            ])
        
        return response
    export_maintenance_task_images_csv.short_description = "Export selected/filtered maintenance task images to CSV"


@admin.register(MaintenanceChecklist)
class MaintenanceChecklistAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['maintenance', 'item', 'is_completed', 'completed_by', 'completed_at', 'order']
    list_filter = ['is_completed', 'completed_at', CompletedAtMonthFilter, 'order']
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
    
    actions = ['export_maintenance_checklists_csv']
    
    def export_maintenance_checklists_csv(self, request, queryset):
        """Export selected/filtered maintenance checklists to CSV"""
        qs = queryset.select_related('maintenance', 'completed_by').order_by('order')
        
        filename = f"maintenance_checklists_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Maintenance PM ID',
            'Maintenance Title',
            'Item',
            'Description',
            'Order',
            'Is Completed',
            'Completed By',
            'Completed By Email',
            'Completed At',
        ])
        
        for checklist in qs:
            writer.writerow([
                checklist.id,
                checklist.maintenance.pm_id if checklist.maintenance else '',
                checklist.maintenance.pmtitle if checklist.maintenance else '',
                checklist.item or '',
                checklist.description or '',
                checklist.order or 0,
                'Yes' if checklist.is_completed else 'No',
                checklist.completed_by.username if checklist.completed_by else '',
                checklist.completed_by.email if checklist.completed_by else '',
                checklist.completed_at.strftime('%Y-%m-%d %H:%M:%S') if checklist.completed_at else '',
            ])
        
        return response
    export_maintenance_checklists_csv.short_description = "Export selected/filtered maintenance checklists to CSV"


@admin.register(MaintenanceHistory)
class MaintenanceHistoryAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['maintenance', 'action', 'performed_by', 'timestamp']
    list_filter = ['action', 'timestamp', TimestampMonthFilter, 'performed_by']
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
    
    actions = ['export_maintenance_history_csv']
    
    def export_maintenance_history_csv(self, request, queryset):
        """Export selected/filtered maintenance history to CSV"""
        qs = queryset.select_related('maintenance', 'performed_by').order_by('-timestamp')
        
        filename = f"maintenance_history_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Maintenance PM ID',
            'Maintenance Title',
            'Action',
            'Notes',
            'Performed By',
            'Performed By Email',
            'Timestamp',
        ])
        
        for history in qs:
            writer.writerow([
                history.id,
                history.maintenance.pm_id if history.maintenance else '',
                history.maintenance.pmtitle if history.maintenance else '',
                history.action or '',
                history.notes or '',
                history.performed_by.username if history.performed_by else '',
                history.performed_by.email if history.performed_by else '',
                history.timestamp.strftime('%Y-%m-%d %H:%M:%S') if history.timestamp else '',
            ])
        
        return response
    export_maintenance_history_csv.short_description = "Export selected/filtered maintenance history to CSV"


@admin.register(MaintenanceSchedule)
class MaintenanceScheduleAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['maintenance', 'is_recurring', 'next_occurrence', 'last_occurrence', 'total_occurrences', 'is_active']
    list_filter = ['is_recurring', 'is_active', 'next_occurrence', NextOccurrenceMonthFilter, 'last_occurrence', LastOccurrenceMonthFilter]
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
    
    actions = ['export_maintenance_schedules_csv']
    
    def export_maintenance_schedules_csv(self, request, queryset):
        """Export selected/filtered maintenance schedules to CSV"""
        qs = queryset.select_related('maintenance').order_by('next_occurrence')
        
        filename = f"maintenance_schedules_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Maintenance PM ID',
            'Maintenance Title',
            'Is Recurring',
            'Next Occurrence',
            'Last Occurrence',
            'Recurrence Pattern',
            'Is Active',
            'Total Occurrences',
        ])
        
        for schedule in qs:
            writer.writerow([
                schedule.id,
                schedule.maintenance.pm_id if schedule.maintenance else '',
                schedule.maintenance.pmtitle if schedule.maintenance else '',
                'Yes' if schedule.is_recurring else 'No',
                schedule.next_occurrence.strftime('%Y-%m-%d %H:%M:%S') if schedule.next_occurrence else '',
                schedule.last_occurrence.strftime('%Y-%m-%d %H:%M:%S') if schedule.last_occurrence else '',
                schedule.recurrence_pattern or '',
                'Yes' if schedule.is_active else 'No',
                schedule.total_occurrences or 0,
            ])
        
        return response
    export_maintenance_schedules_csv.short_description = "Export selected/filtered maintenance schedules to CSV"


@admin.register(UtilityConsumption)
class UtilityConsumptionAdmin(admin.ModelAdmin):
    list_per_page = 25
    ordering = ['year', 'month', 'property']
    list_display = [
        'id',
        'property',
        'month',
        'year',
        'totalkwh',
        'onpeakkwh',
        'offpeakkwh',
        'totalelectricity',
        'electricity_cost_budget',
        'water',
        'nightsale',
        'created_by',
        'created_at',
        'updated_at'
    ]
    list_filter = ['year', 'month', 'property', 'created_at', CreatedAtMonthFilter]
    search_fields = ['property__name', 'property__property_id', 'created_by__username']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['property', 'created_by']
    
    fieldsets = (
        ('Property', {
            'fields': ('property',)
        }),
        ('Period', {
            'fields': ('month', 'year')
        }),
        ('Electricity Consumption', {
            'fields': ('totalkwh', 'onpeakkwh', 'offpeakkwh', 'totalelectricity', 'electricity_cost_budget')
        }),
        ('Other Utilities', {
            'fields': ('water', 'nightsale')
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at')
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('property', 'created_by')
    
    actions = ['export_utility_consumption_csv']
    
    def export_utility_consumption_csv(self, request, queryset):
        """Export selected/filtered utility consumption records to CSV"""
        qs = queryset.select_related('property', 'created_by').order_by('-year', '-month')
        
        filename = f"utility_consumption_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Property',
            'Property ID',
            'Month',
            'Year',
            'Total kWh',
            'On Peak kWh',
            'Off Peak kWh',
            'Total Electricity',
            'Electricity Cost Budget',
            'Water',
            'Night Sale',
            'Created By',
            'Created By Email',
            'Created At',
            'Updated At',
        ])
        
        for consumption in qs:
            writer.writerow([
                consumption.id,
                consumption.property.name if consumption.property else '',
                consumption.property.property_id if consumption.property else '',
                consumption.get_month_display() if hasattr(consumption, 'get_month_display') else consumption.month,
                consumption.year or '',
                consumption.totalkwh or 0,
                consumption.onpeakkwh or 0,
                consumption.offpeakkwh or 0,
                consumption.totalelectricity or 0,
                consumption.electricity_cost_budget or 0,
                consumption.water or 0,
                consumption.nightsale or 0,
                consumption.created_by.username if consumption.created_by else '',
                consumption.created_by.email if consumption.created_by else '',
                consumption.created_at.strftime('%Y-%m-%d %H:%M:%S') if consumption.created_at else '',
                consumption.updated_at.strftime('%Y-%m-%d %H:%M:%S') if consumption.updated_at else '',
            ])
        
        return response
    export_utility_consumption_csv.short_description = "Export selected/filtered utility consumption to CSV"


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


# ========================================
# Workspace Report Admin
# ========================================

# Create month filters for WorkspaceReport
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
        
        # Single-row compact info table with all key info
        info_data = [[
            Paragraph(f"<b>Status:</b> {report.get_status_display()}", value_style),
            Paragraph(f"<b>Priority:</b> {report.get_priority_display()}", value_style),
            Paragraph(f"<b>Property:</b> {report.property.name[:15] if report.property else 'N/A'}", value_style),
            Paragraph(f"<b>Topic:</b> {report.get_topic_display()[:15]}", value_style),
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
