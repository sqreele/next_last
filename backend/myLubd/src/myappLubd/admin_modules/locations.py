"""Locations definitions."""
from django.contrib import admin, messages
from django.utils import timezone
from django.db import transaction
from django import forms
from django.core.exceptions import PermissionDenied, ValidationError
from django.http import HttpResponse, HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import reverse, path
import csv
from ..models import Property, Room, Topic, Area, JobComment, TenantMembership, LineGroupPairing
from ..tenancy import get_accessible_properties, get_property_summary_recipients
from ..notifications.line_webhook import generate_pairing_code, masked_destination, pairing_ttl
from ..admin_modules.shared import CreatedAtMonthFilter


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    def has_delete_permission(self, request, obj=None):
        return False
    change_form_template = 'admin/myappLubd/property/change_form.html'
    list_per_page = 25
    list_display = [
        'name', 'tenant', 'is_preventivemaintenance',
        'line_notification_status', 'line_connection_status',
        'has_active_line_pairing', 'created_at',
    ]
    search_fields = ['property_id', 'name', 'description', 'tenant__name', 'tenant__tenant_id']
    list_filter = [
        'tenant', 'created_at', CreatedAtMonthFilter,
        'is_preventivemaintenance', 'line_notifications_enabled',
    ]
    readonly_fields = [
        'property_id', 'created_at', 'line_notification_status',
        'line_connection_status', 'line_destination_masked',
        'line_pairing_status', 'line_pairing_expiry',
    ]
    list_select_related = ['tenant']

    fieldsets = (
        ('Property Information', {
            'fields': ('property_id', 'name', 'description', 'is_preventivemaintenance')
        }),
        ('LINE Notifications', {
            'fields': (
                'line_notification_status', 'line_connection_status',
                'line_destination_masked', 'line_pairing_status',
                'line_pairing_expiry',
            ),
            'description': (
                'LINE destinations can only be connected through secure pairing. '
                'Sensitive destination and channel credentials are never displayed here.'
            ),
        }),
        ('Timestamps', {
            'classes': ('collapse',),
            'fields': ('created_at',)
        }),
    )

    def get_urls(self):
        opts = self.model._meta
        custom_urls = [
            path(
                '<path:object_id>/line/generate/',
                self.admin_site.admin_view(self.generate_line_pairing_view),
                name=f'{opts.app_label}_{opts.model_name}_line_generate',
            ),
            path(
                '<path:object_id>/line/revoke/',
                self.admin_site.admin_view(self.revoke_line_pairing_view),
                name=f'{opts.app_label}_{opts.model_name}_line_revoke',
            ),
            path(
                '<path:object_id>/line/disconnect/',
                self.admin_site.admin_view(self.disconnect_line_group_view),
                name=f'{opts.app_label}_{opts.model_name}_line_disconnect',
            ),
        ]
        return custom_urls + super().get_urls()

    @staticmethod
    def _active_pairing(property_obj, *, lock=False):
        queryset = LineGroupPairing.objects.filter(
            property=property_obj,
            used_at__isnull=True,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).order_by('-created_at')
        if lock:
            queryset = queryset.select_for_update()
        return queryset.first()

    @staticmethod
    def _line_authority_memberships(user, property_obj):
        if property_obj.tenant_id is None:
            return TenantMembership.objects.none()
        return TenantMembership.objects.filter(
            tenant_id=property_obj.tenant_id,
            user=user,
            is_active=True,
            role__in=('owner', 'admin', 'manager'),
        )

    @classmethod
    def _can_manage_line(cls, user, property_obj):
        return bool(
            user.is_superuser
            or cls._line_authority_memberships(user, property_obj).exists()
        )

    @classmethod
    def _lock_line_authority(cls, user, property_obj):
        if user.is_superuser:
            return
        membership = (
            cls._line_authority_memberships(user, property_obj)
            .select_for_update()
            .only('pk')
            .first()
        )
        if membership is None:
            raise PermissionDenied('Your role cannot manage LINE for this Property.')

    def _get_line_property(self, request, object_id):
        property_obj = self.get_object(request, object_id)
        if property_obj is None:
            raise PermissionDenied
        if not self._can_manage_line(request.user, property_obj):
            raise PermissionDenied('Your role cannot manage LINE for this Property.')
        return property_obj

    def _line_action_context(
        self, request, property_obj, *, title, action_url, action_label, warning
    ):
        return {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'original': property_obj,
            'title': title,
            'property': property_obj,
            'action_url': action_url,
            'action_label': action_label,
            'warning': warning,
            'cancel_url': reverse(
                f'admin:{self.model._meta.app_label}_{self.model._meta.model_name}_change',
                args=(property_obj.pk,),
            ),
        }

    def change_view(self, request, object_id, form_url='', extra_context=None):
        property_obj = self.get_object(request, object_id)
        extra_context = dict(extra_context or {})
        extra_context['line_can_manage'] = bool(
            property_obj and self._can_manage_line(request.user, property_obj)
        )
        if property_obj:
            extra_context['line_is_connected'] = bool(property_obj.line_destination_id)
            extra_context['line_has_active_pairing'] = bool(self._active_pairing(property_obj))
        return super().change_view(request, object_id, form_url, extra_context)

    def generate_line_pairing_view(self, request, object_id):
        property_obj = self._get_line_property(request, object_id)
        opts = self.model._meta
        action_url = reverse(
            f'admin:{opts.app_label}_{opts.model_name}_line_generate', args=(property_obj.pk,)
        )
        if request.method != 'POST':
            response = TemplateResponse(
                request,
                'admin/myappLubd/property/line_action_confirm.html',
                self._line_action_context(
                    request,
                    property_obj,
                    title='Generate LINE pairing code',
                    action_url=action_url,
                    action_label='Generate pairing code',
                    warning=(
                        'The code will be shown once. Do not leave the next page '
                        'until it has been copied securely.'
                    ),
                ),
            )
            response['Cache-Control'] = 'no-store'
            return response

        now = timezone.now()
        with transaction.atomic():
            locked_property = Property.objects.select_for_update().get(pk=property_obj.pk)
            self._lock_line_authority(request.user, locked_property)
            if locked_property.line_destination_id:
                self.message_user(
                    request,
                    'This Property is already connected. Disconnect it explicitly before pairing again.',
                    level=messages.ERROR,
                )
                return HttpResponseRedirect(action_url)
            if self._active_pairing(locked_property, lock=True):
                self.message_user(
                    request,
                    'An active pairing already exists. Revoke it explicitly before generating another.',
                    level=messages.ERROR,
                )
                return HttpResponseRedirect(action_url)
            code = generate_pairing_code()
            pairing = LineGroupPairing(
                property=locked_property,
                created_by=request.user,
                expires_at=now + pairing_ttl(),
            )
            pairing.set_token(code)
            pairing.save()

        self.log_change(request, locked_property, 'Generated a one-time LINE pairing code.')
        context = {
            **self.admin_site.each_context(request),
            'opts': opts,
            'title': 'LINE pairing code generated',
            'property': locked_property,
            'pairing_command': f'STAYMAINT LINK {code}',
            'expires_at': pairing.expires_at,
            'change_url': reverse(
                f'admin:{opts.app_label}_{opts.model_name}_change', args=(locked_property.pk,)
            ),
        }
        response = TemplateResponse(
            request, 'admin/myappLubd/property/line_pairing_generated.html', context
        )
        response['Cache-Control'] = 'no-store'
        return response

    def revoke_line_pairing_view(self, request, object_id):
        property_obj = self._get_line_property(request, object_id)
        opts = self.model._meta
        action_url = reverse(
            f'admin:{opts.app_label}_{opts.model_name}_line_revoke', args=(property_obj.pk,)
        )
        if request.method != 'POST':
            return TemplateResponse(
                request,
                'admin/myappLubd/property/line_action_confirm.html',
                self._line_action_context(
                    request,
                    property_obj,
                    title='Revoke LINE pairing',
                    action_url=action_url,
                    action_label='Revoke active pairing',
                    warning=(
                        'The current unused pairing command will stop working. '
                        'The LINE destination will not change.'
                    ),
                ),
            )

        now = timezone.now()
        with transaction.atomic():
            locked_property = Property.objects.select_for_update().get(pk=property_obj.pk)
            self._lock_line_authority(request.user, locked_property)
            pairing = self._active_pairing(locked_property, lock=True)
            if pairing:
                pairing.revoked_at = now
                pairing.save(update_fields=['revoked_at'])
        if pairing:
            self.log_change(request, locked_property, 'Revoked the active unused LINE pairing.')
            self.message_user(request, 'The active LINE pairing was revoked.', messages.SUCCESS)
        else:
            self.message_user(
                request,
                'There is no active unused LINE pairing to revoke.',
                messages.WARNING,
            )
        return HttpResponseRedirect(reverse(
            f'admin:{opts.app_label}_{opts.model_name}_change', args=(locked_property.pk,)
        ))

    def disconnect_line_group_view(self, request, object_id):
        property_obj = self._get_line_property(request, object_id)
        opts = self.model._meta
        action_url = reverse(
            f'admin:{opts.app_label}_{opts.model_name}_line_disconnect',
            args=(property_obj.pk,),
        )
        if request.method != 'POST':
            return TemplateResponse(
                request,
                'admin/myappLubd/property/line_action_confirm.html',
                self._line_action_context(
                    request,
                    property_obj,
                    title='Disconnect LINE Group',
                    action_url=action_url,
                    action_label='Disconnect LINE Group',
                    warning=(
                        'Notifications will be disabled and the current destination removed. '
                        'Other Property data and pairing history remain intact.'
                    ),
                ),
            )

        now = timezone.now()
        with transaction.atomic():
            locked_property = Property.objects.select_for_update().get(pk=property_obj.pk)
            self._lock_line_authority(request.user, locked_property)
            was_connected = bool(locked_property.line_destination_id)
            locked_property.line_destination_id = ''
            locked_property.line_notifications_enabled = False
            locked_property.save(update_fields=['line_destination_id', 'line_notifications_enabled'])
            LineGroupPairing.objects.select_for_update().filter(
                property=locked_property,
                used_at__isnull=True,
                revoked_at__isnull=True,
                expires_at__gt=now,
            ).update(revoked_at=now)
        self.log_change(
            request,
            locked_property,
            'Disconnected the LINE Group and disabled LINE notifications.',
        )
        if was_connected:
            self.message_user(
                request,
                'LINE Group disconnected and notifications disabled.',
                messages.SUCCESS,
            )
        else:
            self.message_user(
                request,
                'LINE was already disconnected; notifications are disabled.',
                messages.INFO,
            )
        return HttpResponseRedirect(reverse(
            f'admin:{opts.app_label}_{opts.model_name}_change', args=(locked_property.pk,)
        ))

    @admin.display(description='LINE notifications', ordering='line_notifications_enabled')
    def line_notification_status(self, obj):
        return 'Enabled' if obj.line_notifications_enabled else 'Disabled'

    @admin.display(description='LINE connection')
    def line_connection_status(self, obj):
        destination = str(obj.line_destination_id or '')
        return f'Connected ({masked_destination(destination)})' if destination else 'Not connected'

    @admin.display(description='Destination')
    def line_destination_masked(self, obj):
        destination = str(obj.line_destination_id or '')
        return masked_destination(destination) if destination else 'Not connected'

    @admin.display(description='Pairing status')
    def line_pairing_status(self, obj):
        active = self._active_pairing(obj)
        if active:
            return 'Active pairing'
        latest = LineGroupPairing.objects.filter(property=obj).order_by('-created_at').first()
        return latest.status.title() if latest else 'None'

    @admin.display(description='Pairing expiry')
    def line_pairing_expiry(self, obj):
        active = self._active_pairing(obj)
        return timezone.localtime(active.expires_at) if active else None

    @admin.display(description='Active pairing', boolean=True)
    def has_active_line_pairing(self, obj):
        return bool(self._active_pairing(obj))

    def get_users_count(self, obj):
        return get_property_summary_recipients(obj).count()
    get_users_count.short_description = 'Authorized Users'

    actions = ['export_properties_csv']

    def export_properties_csv(self, request, queryset):
        """Export selected/filtered properties to CSV"""
        qs = queryset.order_by('property_id')

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
            recipients = get_property_summary_recipients(prop)
            users = ", ".join([f"{u.username} ({u.email})" for u in recipients])
            writer.writerow([
                prop.property_id or '',
                prop.name or '',
                prop.description or '',
                'Yes' if prop.is_preventivemaintenance else 'No',
                users,
                recipients.count(),
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


class RoomAdminForm(forms.ModelForm):
    class Meta:
        model = Room
        fields = ['name', 'room_type', 'is_active', 'property']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Django removes ModelAdmin readonly fields from the generated form.
        # ``property`` is editable when adding a Room but readonly when editing
        # one, so it is intentionally absent from existing-room forms.
        if 'property' in self.fields:
            self.fields['property'].required = True

    def clean_property(self):
        property_obj = self.cleaned_data['property']
        if self.instance.pk and self.instance.property_id != property_obj.pk:
            raise ValidationError('Room.property is immutable after creation.')
        return property_obj


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    form = RoomAdminForm
    list_per_page = 25
    list_display = ['name', 'property', 'room_type', 'is_active', 'created_at']
    list_filter = ['room_type', 'property', 'is_active', 'created_at', CreatedAtMonthFilter, HasPreventiveMaintenanceFilter]
    search_fields = ['name', 'room_type', 'property__name']
    # Legacy M2M remains only as a synchronized compatibility representation.
    filter_horizontal = []
    readonly_fields = ['room_id', 'created_at']
    list_select_related = ['property']
    actions = ['activate_rooms', 'deactivate_rooms', 'export_rooms_csv']

    def get_readonly_fields(self, request, obj=None):
        fields = list(self.readonly_fields)
        if obj is not None:
            fields.append('property')
        return fields

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if 'property' in form.base_fields:
            form.base_fields['property'].queryset = get_accessible_properties(request.user)
        return form

    def get_properties_display(self, obj):
        if not obj.property_id:
            return ""
        return f"{obj.property.property_id} - {obj.property.name}"
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
        qs = queryset.select_related('property').order_by('room_id')

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
            properties = f"{room.property.property_id} - {room.property.name}" if room.property_id else ''
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


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['id', 'name', 'property', 'is_active', 'created_at', 'updated_at']
    list_filter = ['is_active', 'property', 'created_at']
    search_fields = ['name', 'description', 'property__name', 'property__property_id']
    readonly_fields = ['created_at', 'updated_at']
    autocomplete_fields = ['property']
    actions = ['activate_areas', 'deactivate_areas']

    def activate_areas(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f"{updated} areas activated.")
    activate_areas.short_description = "Activate selected areas"

    def deactivate_areas(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f"{updated} areas deactivated.")
    deactivate_areas.short_description = "Deactivate selected areas"


@admin.register(JobComment)
class JobCommentAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['id', 'job', 'author', 'short_comment', 'created_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['comment', 'job__job_id', 'author__username']
    readonly_fields = ['created_at', 'updated_at']
    autocomplete_fields = ['job', 'author']

    def short_comment(self, obj):
        text = (obj.comment or '').strip()
        return (text[:60] + '…') if len(text) > 60 else text
    short_comment.short_description = 'Comment'
