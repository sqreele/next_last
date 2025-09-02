from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from django import forms
from django.core.exceptions import ValidationError
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

# Custom User Admin to show Google OAuth information
class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'
    fields = ['positions', 'profile_image', 'google_id', 'email_verified', 'login_provider']

class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)
    list_display = ['username', 'email', 'first_name', 'last_name', 'get_google_info', 'is_staff', 'is_active', 'date_joined']
    list_filter = ['is_staff', 'is_superuser', 'is_active', 'groups', 'date_joined']
    search_fields = ['username', 'first_name', 'last_name', 'email']
    
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

# ModelAdmins
@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    form = JobAdminForm
    list_display = ['job_id', 'get_description_display', 'get_status_display_colored', 'get_priority_display_colored', 'get_user_display', 'get_properties_display', 'get_timestamps_display', 'is_preventivemaintenance']
    list_filter = ['status', 'priority', 'is_defective', 'created_at', 'updated_at', 'is_preventivemaintenance', 'user']
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
                    if prop.name not in properties:
                        properties.append(prop.name)
        return ", ".join(properties) if properties else "No Properties"
    get_properties_display.short_description = 'Properties'

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

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for instance in instances:
            if isinstance(instance, JobImage) and not instance.pk and not instance.uploaded_by_id:
                instance.uploaded_by = request.user
            instance.save()
        formset.save_m2m()

    # Admin actions for timestamp management
    actions = ['update_timestamps_to_now', 'reset_completed_timestamps']

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
        return ", ".join([prop.name for prop in obj.properties.all()])
    get_properties_display.short_description = 'Properties'

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
    list_display = ['user_link', 'positions', 'profile_image_preview']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'positions']
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
        from django.urls import reverse
        link = reverse("admin:auth_user_change", args=[obj.user.id])
        return format_html('<a href="{}">{}</a>', link, obj.user.username)
    user_link.short_description = 'User'

    def profile_image_preview(self, obj):
        if obj.profile_image and hasattr(obj.profile_image, 'url'):
            return format_html('<img src="{}" style="max-width: 100px; max-height: 100px; border-radius: 50%;" />', obj.profile_image.url)
        return "No Image"
    profile_image_preview.short_description = 'Profile Image'

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
