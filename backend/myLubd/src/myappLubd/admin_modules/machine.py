import base64
import csv
import logging
from io import BytesIO

import qrcode
from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html

from ..models import Machine
from .filters import CreatedAtMonthFilter, InstallationDateMonthFilter

@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = [
        'image_thumbnail',
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
        'expected_replacement_date',
        'warranty_end_date',
        'next_maintenance_date',
        'task_count',
        'procedure_count',
        'get_group_ids'
    ]
    list_filter = ['status', 'category', 'brand', 'property', 'group_id', 'created_at', CreatedAtMonthFilter, 'installation_date', InstallationDateMonthFilter, 'warranty_end_date', 'expected_replacement_date']
    search_fields = ['machine_id', 'name', 'brand', 'serial_number', 'description', 'location', 'group_id', 'asset_tag', 'supplier']
    readonly_fields = ['created_at', 'updated_at', 'next_maintenance_date', 'qr_code_preview', 'maintenance_procedures_display', 'get_group_ids', 'image_preview']  # Removed machine_id - now editable
    filter_horizontal = ['preventive_maintenances']
    
    fieldsets = (
        ('Equipment Information', {
            'fields': ('machine_id', 'name', 'brand', 'category', 'serial_number', 'description', 'location', 'status', 'group_id')
        }),
        ('Equipment Image', {
            'fields': ('image', 'image_preview'),
            'description': 'Upload an image of the equipment'
        }),
        ('Property & Maintenance', {
            'fields': ('property', 'preventive_maintenances', 'maintenance_procedures_display', 'get_group_ids', 'installation_date', 'last_maintenance_date')
        }),
        ('Lifecycle & Warranty', {
            'fields': (
                'asset_tag', 'purchase_date', 'purchase_cost', 'warranty_start_date',
                'warranty_end_date', 'expected_replacement_date',
                'replacement_cost_estimate', 'supplier', 'supplier_contact',
                'lifecycle_notes',
            )
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

    def image_preview(self, obj):
        """Display image preview in admin"""
        if obj and obj.image:
            return format_html(
                '<div style="padding: 10px;">'
                '<img src="{}" style="max-width: 300px; max-height: 300px; border: 2px solid #ddd; border-radius: 4px;" />'
                '</div>',
                obj.image.url
            )
        return format_html('<span style="color: #999;">No image uploaded</span>')
    image_preview.short_description = 'Image Preview'

    def image_thumbnail(self, obj):
        """Display small thumbnail in list view"""
        if obj and obj.image:
            return format_html(
                '<img src="{}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" />',
                obj.image.url
            )
        return format_html('<span style="color: #ccc; font-size: 11px;">No image</span>')
    image_thumbnail.short_description = 'Image'

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

