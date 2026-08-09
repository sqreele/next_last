import os
import re
from django.contrib import admin
from django.utils.html import format_html, format_html_join
from django.utils import timezone
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

User = get_user_model()

admin.site.site_header = 'HotelCare Pro Administration'
admin.site.site_title = 'HotelCare Pro Admin'
admin.site.index_title = 'Operations overview'

from .admin_modules.accounts import (  # noqa: E402,F401
    CustomUserAdmin,
    DateJoinedMonthFilter,
    SessionAdmin,
    UserAdmin,
    UserProfileAdmin,
    UserProfileInline,
)

from django import forms
from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from collections import Counter

from .timezones import timezone_choices
from django.db import models
from datetime import timedelta, datetime
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
    WorkspaceReport,
    Area,
    JobComment,
    Tenant,
    TenantMembership,
    SubscriptionPlan,
    TenantSubscription,
    UsageMetric,
    InventoryUsage,
)



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


# ========================================
# Month Filters - Filter by month for date fields
# ========================================
# Note: Moved here to ensure filters are defined before ModelAdmin classes that use them

from .admin_modules.filters import (  # noqa: E402,F401
    CompletedAtMonthFilter,
    CompletedDateMonthFilter,
    CreatedAtMonthFilter,
    DueDateMonthFilter,
    ExpiresAtMonthFilter,
    ExpiryDateMonthFilter,
    InstallationDateMonthFilter,
    LastMaintenanceDateMonthFilter,
    LastOccurrenceMonthFilter,
    LastRestockedMonthFilter,
    NextOccurrenceMonthFilter,
    ScheduledDateMonthFilter,
    TimestampMonthFilter,
    UpdatedAtMonthFilter,
    UploadedAtMonthFilter,
    create_month_filter,
)


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


# Add this new admin class for Machine
from .admin_modules.machine import MachineAdmin  # noqa: E402,F401
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
class JobAdmin(admin.ModelAdmin):
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
                floor = FloorFilter._floor_from_room_name(room.name)
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

from .admin_modules.properties import (  # noqa: E402,F401
    HasPreventiveMaintenanceFilter,
    PropertyAdmin,
    RoomAdmin,
    TopicAdmin,
)


from .admin_modules.preventive_maintenance import (  # noqa: E402,F401
    MaintenanceChecklistAdmin,
    MaintenanceHistoryAdmin,
    MaintenanceScheduleAdmin,
    PreventiveMaintenanceAdmin,
)



from .admin_modules.maintenance_procedure import (  # noqa: E402,F401
    MaintenanceProcedureAdmin,
    MaintenanceTaskImageAdmin,
)




from .admin_modules.utility import UtilityConsumptionAdmin  # noqa: E402,F401


from .admin_modules.inventory import (  # noqa: E402,F401
    InventoryAdmin,
    InventoryUsageAdmin,
)


# ========================================
# Workspace Report Admin
# ========================================

# Create month filters for WorkspaceReport


from .admin_modules.workspace_report import (  # noqa: E402,F401
    CompletedDateMonthFilter,
    DueDateMonthFilter,
    ReportDateMonthFilter,
    WorkspaceReportAdmin,
)


# Import low-risk platform registrations during Django admin autodiscovery and
# preserve their historical public names on ``myappLubd.admin``.
from .admin_modules.platform import (  # noqa: E402,F401
    AreaAdmin,
    JobCommentAdmin,
    SubscriptionPlanAdmin,
    TenantAdmin,
    TenantMembershipAdmin,
    TenantSubscriptionAdmin,
    UsageMetricAdmin,
)
