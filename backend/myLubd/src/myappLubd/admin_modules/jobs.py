import re

from django import forms
from django.conf import settings
from django.contrib import admin
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html, format_html_join

from ..models import Area, Job, JobImage, Property, Room, Topic
from .filters import CreatedAtMonthFilter, UpdatedAtMonthFilter, UploadedAtMonthFilter
from .job_exports import JobExportMixin, JobImageExportMixin


class CreatedAtBeforeYearFilter(admin.SimpleListFilter):
    title = 'created before year'
    parameter_name = 'created_before_year'

    def lookups(self, request, model_admin):
        try:
            queryset = model_admin.get_queryset(request).exclude(created_at__isnull=True)
            years = queryset.dates('created_at', 'year', order='DESC')
            lookups = []

            for year_date in years:
                year = year_date.year
                start_of_year = timezone.datetime(year, 1, 1)
                if settings.USE_TZ and timezone.is_naive(start_of_year):
                    start_of_year = timezone.make_aware(start_of_year, timezone.get_current_timezone())
                count = queryset.filter(created_at__lt=start_of_year).count()
                if count:
                    lookups.append((str(year), f"Before {year} ({count})"))

            return lookups
        except Exception:
            return []

    def queryset(self, request, queryset):
        if self.value():
            try:
                year = int(self.value())
                start_of_year = timezone.datetime(year, 1, 1)
                if settings.USE_TZ and timezone.is_naive(start_of_year):
                    start_of_year = timezone.make_aware(start_of_year, timezone.get_current_timezone())
                return queryset.filter(created_at__lt=start_of_year)
            except (TypeError, ValueError):
                return queryset
        return queryset

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
            return queryset.filter(
                Q(rooms__properties__id=self.value()) | Q(area__property__id=self.value())
            ).distinct()
        return queryset


class AreaFilter(admin.SimpleListFilter):
    title = 'area'
    parameter_name = 'area'

    def lookups(self, request, model_admin):
        areas_queryset = Area.objects.select_related('property').filter(jobs__isnull=False)

        selected_property = request.GET.get('property')
        if selected_property:
            areas_queryset = areas_queryset.filter(property__id=selected_property)

        return [
            (str(area.id), f"{area.name} ({area.property.name})" if area.property else area.name)
            for area in areas_queryset.order_by('property__name', 'name').distinct()
        ]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(area__id=self.value()).distinct()
        return queryset


class FloorFilter(admin.SimpleListFilter):
    title = 'floor'
    parameter_name = 'floor'

    def lookups(self, request, model_admin):
        rooms_queryset = Room.objects.filter(jobs__isnull=False)

        selected_property = request.GET.get('property')
        if selected_property:
            rooms_queryset = rooms_queryset.filter(properties__id=selected_property)

        floors = sorted(
            {self._floor_from_room_name(name) for name in rooms_queryset.values_list('name', flat=True)},
            key=lambda floor: int(floor) if str(floor).isdigit() else str(floor),
        )
        return [(floor, floor) for floor in floors if floor]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(rooms__name__regex=self._floor_regex(self.value())).distinct()
        return queryset

    @staticmethod
    def _floor_from_room_name(room_name):
        room_name = str(room_name or '').strip()
        if not room_name:
            return None

        match = re.search(r'\d+', room_name)
        if not match:
            return None

        room_code = match.group(0)
        if len(room_code) == 4 and room_code.startswith('1') and room_code[1].isdigit():
            return room_code[1]
        if len(room_code) >= 3:
            return room_code[0]
        return None

    @staticmethod
    def _floor_regex(floor):
        floor = str(floor).strip()
        return rf'(^|\D)(1{floor}[0-9]{{2}}|{floor}[0-9]{{2,}})(\D|$)'

class RoomFilter(admin.SimpleListFilter):
    title = 'room'
    parameter_name = 'room'

    def lookups(self, request, model_admin):
        jobs_queryset = Job.objects.all()

        selected_topic = request.GET.get('topic')
        if selected_topic:
            jobs_queryset = jobs_queryset.exclude(topics__id=selected_topic)

        rooms_queryset = Room.objects.filter(jobs__in=jobs_queryset)

        selected_property = request.GET.get('property')
        if selected_property:
            rooms_queryset = rooms_queryset.filter(properties__id=selected_property)

        rooms_queryset = rooms_queryset.order_by('name').distinct()

        return [
            (str(room.room_id), room.name)
            for room in rooms_queryset
        ]

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


class IsDefectFilter(admin.SimpleListFilter):
    title = 'is defect'
    parameter_name = 'is_defect'

    def lookups(self, request, model_admin):
        return (
            ('1', 'Yes'),
            ('0', 'No'),
        )

    def queryset(self, request, queryset):
        if self.value() == '1':
            return queryset.filter(is_defective=True)
        if self.value() == '0':
            return queryset.filter(is_defective=False)
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
class JobAdmin(JobExportMixin, admin.ModelAdmin):
    floor_filter_class = FloorFilter
    list_per_page = 25
    form = JobAdminForm
    list_display = ['job_id', 'get_description_display', 'get_topics_display', 'get_status_display_colored', 'get_priority_display_colored', 'get_location_display', 'get_inventory_items_display', 'get_timestamps_display', 'is_preventivemaintenance']
    list_filter = ['status', 'priority', IsDefectFilter, 'created_at', CreatedAtMonthFilter, CreatedAtBeforeYearFilter, 'updated_at', UpdatedAtMonthFilter, 'is_preventivemaintenance', 'user', PropertyFilter, AreaFilter, FloorFilter, RoomFilter, TopicFilter]
    search_fields = ['description', 'topics__title', 'rooms__name', 'area__name', 'area__property__name']
    search_help_text = 'Search by description, topic title, room name, area name, or area property.'
    readonly_fields = ['job_id', 'updated_by', 'inventory_items_display', 'preventive_maintenance_images']
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
            'fields': ('rooms', 'area', 'topics')
        }),
        ('Inventory Used', {
            'fields': ('inventory_items_display',),
            'description': 'Inventory items linked to this job'
        }),
        ('Preventive Maintenance Images', {
            'fields': ('preventive_maintenance_images',),
            'description': 'Before and after images from preventive maintenance records linked to this job'
        }),
        ('Timestamps (Editable)', {
            'fields': ('created_at', 'updated_at', 'completed_at'),
            'description': 'You can edit these timestamps. Created date should be the original job creation time, updated date should be the last modification time, and completed date should be when the job was finished.'
        }),
    )
    change_list_template = 'admin/myappLubd/job/change_list.html'

    def get_topics_display(self, obj):
        return ", ".join([topic.title for topic in obj.topics.all()])
    get_topics_display.short_description = 'Topics'

    def get_user_display(self, obj):
        if obj.user:
            return f"{obj.user.username} ({obj.user.first_name} {obj.user.last_name})".strip()
        return "No User"
    get_user_display.short_description = 'User'
    get_user_display.admin_order_field = 'user__username'

    def get_rooms_count(self, obj):
        return obj.rooms.count()
    get_rooms_count.short_description = 'Rooms'

    def get_rooms_display(self, obj):
        rooms_qs = obj.rooms.all()
        request = getattr(self, '_request', None)
        if request is not None:
            selected_topic = request.GET.get('topic')
            if selected_topic:
                rooms_qs = rooms_qs.filter(jobs__topics__id=selected_topic).distinct()
        rooms = [room.name or room.room_type for room in rooms_qs]
        return ", ".join(rooms) if rooms else "-"
    get_rooms_display.short_description = 'Room names'

    def _job_location_parts(self, obj):
        rooms = self.get_rooms_display(obj)
        area_name = obj.area.name if obj.area else "-"
        property_name = obj.area.property.name if obj.area and obj.area.property else "-"
        floor_names = sorted(
            {FloorFilter._floor_from_room_name(room.name) for room in obj.rooms.all()},
            key=lambda floor: int(floor) if str(floor).isdigit() else str(floor),
        )
        floor_display = ", ".join(floor for floor in floor_names if floor) or "-"
        return {
            'rooms': rooms,
            'area': area_name,
            'floor': floor_display,
            'property': property_name,
        }

    def get_location_display(self, obj):
        location = self._job_location_parts(obj)

        return format_html(
            '<div style="font-size: 12px; line-height: 1.35;">'
            '<div><strong>Rooms:</strong> {}</div>'
            '<div><strong>Area:</strong> {}</div>'
            '<div><strong>Floor:</strong> {}</div>'
            '</div>',
            location['rooms'],
            location['area'],
            location['floor'],
        )
    get_location_display.short_description = 'Location'


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

    def preventive_maintenance_images(self, obj):
        if not obj or not obj.pk:
            return format_html('<span style="color: #999;">Save this job before linking preventive maintenance images.</span>')

        preventive_maintenances = obj.preventivemaintenance_set.all()
        if not preventive_maintenances:
            return format_html('<span style="color: #999;">No linked preventive maintenance images.</span>')

        cards = []
        for preventive_maintenance in preventive_maintenances:
            pm_link = reverse("admin:myappLubd_preventivemaintenance_change", args=[preventive_maintenance.pk])
            image_cells = []
            for label, image in (
                ('Before', preventive_maintenance.before_image),
                ('After', preventive_maintenance.after_image),
            ):
                if image and hasattr(image, 'url'):
                    image_cells.append(format_html(
                        '<div style="display:inline-block; margin-right:16px; vertical-align:top;">'
                        '<div style="font-weight:600; margin-bottom:4px;">{} image</div>'
                        '<a href="{}" target="_blank" rel="noopener noreferrer">'
                        '<img src="{}" style="max-width:180px; max-height:180px; border:1px solid #ddd; border-radius:4px; object-fit:contain;" />'
                        '</a>'
                        '</div>',
                        label,
                        image.url,
                        image.url,
                    ))
                else:
                    image_cells.append(format_html(
                        '<div style="display:inline-block; margin-right:16px; min-width:180px; vertical-align:top; color:#999;">'
                        '<div style="font-weight:600; margin-bottom:4px; color:#333;">{} image</div>'
                        'No image'
                        '</div>',
                        label,
                    ))

            cards.append(format_html(
                '<div style="margin-bottom:16px; padding:12px; border:1px solid #e5e7eb; border-radius:6px; background:#fafafa;">'
                '<div style="margin-bottom:10px; font-weight:700;">'
                '<a href="{}">{}</a> — {}'
                '</div>'
                '{}'
                '</div>',
                pm_link,
                preventive_maintenance.pm_id,
                preventive_maintenance.pmtitle,
                format_html_join('', '{}', ((cell,) for cell in image_cells)),
            ))

        return format_html_join('', '{}', ((card,) for card in cards))
    preventive_maintenance_images.short_description = 'Before / After Images'

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


    def delete_queryset(self, request, queryset):
        """Allow bulk delete when list filters introduced DISTINCT joins."""
        if queryset.query.distinct:
            pk_values = list(queryset.values_list('pk', flat=True))
            if pk_values:
                self.model.objects.filter(pk__in=pk_values).delete()
            return
        super().delete_queryset(request, queryset)
    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context['missing_rooms_summary'] = self._get_missing_rooms_summary(request)
        return super().changelist_view(request, extra_context=extra_context)

    def _get_missing_rooms_summary(self, request):
        """
        Admin summary for room numbers in Room model that are not present in Job.
        Supports optional floor filtering via ?missing_floor=6
        and aligns with selected property/topic filter when present.
        """
        floor = (request.GET.get('missing_floor') or '').strip()
        property_filter = (request.GET.get('property') or '').strip()
        topic_filter = (request.GET.get('topic') or '').strip()

        room_qs = Room.objects.filter(is_active=True)
        if property_filter:
            room_qs = room_qs.filter(properties__id=property_filter)
        if floor:
            room_qs = room_qs.filter(name__regex=rf'^{floor}[0-9]+$')

        room_names = sorted(set(room_qs.values_list('name', flat=True)))

        job_qs = Job.objects.all()
        if property_filter:
            job_qs = job_qs.filter(rooms__properties__id=property_filter)
        if topic_filter:
            job_qs = job_qs.filter(topics__id=topic_filter)
        if floor:
            job_qs = job_qs.filter(rooms__name__regex=rf'^{floor}[0-9]+$')

        used_room_names = set(job_qs.values_list('rooms__name', flat=True))
        missing_rooms = [name for name in room_names if name and name not in used_room_names]

        return {
            'floor': floor,
            'property': property_filter,
            'selected_topic_id': topic_filter or None,
            'total_rooms_in_model': len(room_names),
            'rooms_with_jobs': len([name for name in room_names if name in used_room_names]),
            'missing_rooms_count': len(missing_rooms),
            'missing_rooms': missing_rooms,
        }

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
        self._request = request
        return super().get_queryset(request).select_related('user', 'updated_by', 'area', 'area__property').prefetch_related('rooms__properties', 'topics', 'preventivemaintenance_set')

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for instance in instances:
            if isinstance(instance, JobImage) and not instance.pk and not instance.uploaded_by_id:
                instance.uploaded_by = request.user
            instance.save()
        formset.save_m2m()

    # Admin actions for timestamp management and export
    actions = ['update_timestamps_to_now', 'reset_completed_timestamps', 'export_jobs_pdf', 'export_jobs_csv', 'export_jobs_google_sheets_csv', 'export_jobs_excel', 'export_jobs_chart_pdf']

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
class JobImageAdmin(JobImageExportMixin, admin.ModelAdmin):
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
