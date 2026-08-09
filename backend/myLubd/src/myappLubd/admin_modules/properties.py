import csv

from django.contrib import admin
from django.http import HttpResponse
from django.utils import timezone

from ..models import Property, Room, Topic
from .filters import CreatedAtMonthFilter

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
    list_filter = ['room_type', 'properties', 'is_active', 'created_at', CreatedAtMonthFilter, HasPreventiveMaintenanceFilter]
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

