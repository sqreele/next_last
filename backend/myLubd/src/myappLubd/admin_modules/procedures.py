"""Procedures definitions."""
from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from django.http import HttpResponse
import csv
from ..models import MaintenanceProcedure, MaintenanceTaskImage, MaintenanceChecklist, MaintenanceHistory, MaintenanceSchedule
from ..admin_modules.shared import CreatedAtMonthFilter, UploadedAtMonthFilter, CompletedAtMonthFilter, TimestampMonthFilter, NextOccurrenceMonthFilter, LastOccurrenceMonthFilter


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
