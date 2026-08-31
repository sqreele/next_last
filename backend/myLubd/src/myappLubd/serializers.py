from rest_framework import serializers
from .models import (
    Room, Topic, JobImage, Job, Property, UserProfile, Session,
    PreventiveMaintenance, PMMasterPlan, Machine, MaintenanceProcedure,
    MaintenanceTaskImage,
    UtilityConsumption, Inventory, Area, JobComment, Tenant,
    TenantMembership, SubscriptionPlan, TenantSubscription, UsageMetric,
    InventoryUsage,
)
from django.contrib.auth import get_user_model
import logging

logger = logging.getLogger(__name__)

User = get_user_model()
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError, FieldDoesNotExist
from django.db import transaction
from django.db.models import Q
from django.db.utils import ProgrammingError
from django.utils import timezone
from django.core.validators import FileExtensionValidator
from django.core.files.storage import default_storage
from django.conf import settings
from datetime import timedelta
from pathlib import Path
import math

from .timezones import is_valid_timezone, object_timezone
from .tenancy import (
    TENANT_WIDE_PROPERTY_ROLES,
    get_accessible_properties,
    get_operable_properties,
    get_user_tenant_memberships,
)
from .job_property import (
    resolve_external_property_reference,
    resolve_job_property,
    resolve_property_reference,
)
from .room_property import resolve_room_property


RAW_AUTH_PREFIXES = ('google-oauth2_', 'auth0_', 'auth0|')


def _validate_request_property_access(serializer, property_obj, field='property'):
    """Apply the canonical property scope to serializer writes.

    Relation fields otherwise resolve primary keys against ``objects.all()``,
    which makes forged IDs a write-time authorization bypass.  Viewsets pass
    the DRF request in serializer context automatically.
    """
    if property_obj is None:
        return
    request = serializer.context.get('request')
    user = getattr(request, 'user', None)
    if user is None or user.is_superuser:
        return
    if not get_accessible_properties(user).filter(pk=property_obj.pk).exists():
        raise serializers.ValidationError({field: 'You do not have access to this property.'})


def _validate_room_belongs_to_property(room, property_obj):
    if room is not None and property_obj is not None and room.property_id != property_obj.pk:
        raise serializers.ValidationError({'room': 'The room must belong to the selected property.'})


def _validate_machine_ids_in_request_scope(serializer, machine_ids):
    if not machine_ids:
        return []
    if len(machine_ids) != len(set(machine_ids)):
        raise serializers.ValidationError({'machine_ids': 'Duplicate machine_ids are not allowed.'})
    machines = list(Machine.objects.select_related('property').filter(machine_id__in=machine_ids))
    if len(machines) != len(set(machine_ids)):
        raise serializers.ValidationError({'machine_ids': 'One or more machine_ids are invalid.'})
    property_ids = {machine.property_id for machine in machines}
    if len(property_ids) > 1:
        raise serializers.ValidationError({'machine_ids': 'All machines must belong to the same property.'})
    _validate_request_property_access(serializer, machines[0].property, 'machine_ids')
    request = serializer.context.get('request')
    user = getattr(request, 'user', None)
    if user is not None and not user.is_superuser:
        if not get_operable_properties(user).filter(pk=machines[0].property_id).exists():
            raise serializers.ValidationError({'machine_ids': 'Your role cannot modify maintenance for this property.'})
    return machines


def is_raw_auth_identifier(value):
    if value is None:
        return False
    text = str(value).strip()
    return (
        text.startswith(RAW_AUTH_PREFIXES)
        or text.lower() in {'null', 'undefined', '[object object]'}
    )


def get_user_display_name(user, fallback='Unknown Technician'):
    if not user:
        return fallback

    profile = getattr(user, 'userprofile', None)
    profile_full_name = getattr(profile, 'full_name', None)
    candidates = [
        profile_full_name,
        user.get_full_name().strip() if hasattr(user, 'get_full_name') else None,
        getattr(user, 'name', None),
        getattr(user, 'email', None),
        getattr(user, 'username', None),
    ]

    for candidate in candidates:
        if candidate is None:
            continue
        value = str(candidate).strip()
        if value and not is_raw_auth_identifier(value):
            return value

    return fallback


def get_user_public_username(user, fallback=''):
    if not user:
        return fallback

    username = str(getattr(user, 'username', '') or '').strip()
    if username and not is_raw_auth_identifier(username):
        return username

    display_name = get_user_display_name(user, fallback=fallback or 'User')
    return '' if display_name == 'Unknown Technician' and not fallback else display_name


# User serializer for basic user data
class UserSerializer(serializers.HyperlinkedModelSerializer):
    username = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['url', 'username', 'email', 'display_name', 'is_staff']

    def get_display_name(self, obj):
        return get_user_display_name(obj)

    def get_username(self, obj):
        return get_user_public_username(obj)

class UserSummarySerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'display_name', 'is_staff']
        read_only_fields = fields

    def get_full_name(self, obj):
        full_name = obj.get_full_name().strip()
        return full_name or get_user_display_name(obj)

    def get_display_name(self, obj):
        return get_user_display_name(obj)

    def get_username(self, obj):
        return get_user_public_username(obj)


class JobAssignmentCandidateSerializer(UserSummarySerializer):
    """Minimal identity projection for a property-scoped assignment choice."""

    class Meta(UserSummarySerializer.Meta):
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'display_name']
        read_only_fields = fields


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = [
            'id', 'code', 'name', 'description', 'monthly_price', 'billing_interval',
            'max_properties', 'max_users', 'max_monthly_work_orders', 'max_assets',
            'max_storage_mb', 'max_pm_schedules', 'allow_offline_mode',
            'allow_advanced_analytics', 'allow_api_access', 'is_active',
            'sort_order', 'features',
        ]
        read_only_fields = ['id']


class TenantSubscriptionSerializer(serializers.ModelSerializer):
    plan = SubscriptionPlanSerializer(read_only=True)

    class Meta:
        model = TenantSubscription
        fields = [
            'id', 'tenant', 'plan', 'status', 'current_period_start',
            'current_period_end', 'trial_ends_at', 'grace_period_ends_at',
            'cancel_at_period_end', 'created_at', 'updated_at',
        ]
        # This API is a status projection, not billing authority. Provider and
        # lifecycle fields are managed only through platform administration.
        read_only_fields = [
            'id', 'tenant', 'plan', 'status', 'current_period_start',
            'current_period_end', 'trial_ends_at', 'grace_period_ends_at',
            'cancel_at_period_end', 'created_at', 'updated_at',
        ]


class TenantMembershipSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='user',
        write_only=True,
    )
    properties = serializers.PrimaryKeyRelatedField(
        queryset=Property.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = TenantMembership
        fields = [
            'id', 'tenant', 'user', 'user_id', 'role', 'is_active',
            'properties', 'invited_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'invited_by', 'created_at', 'updated_at']


class UsageMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = UsageMetric
        fields = [
            'id', 'tenant', 'period_start', 'period_end', 'property_count',
            'active_user_count', 'work_order_count', 'asset_count',
            'pm_schedule_count', 'storage_mb', 'calculated_at',
        ]
        read_only_fields = ['id', 'calculated_at']


class TenantSerializer(serializers.ModelSerializer):
    subscription = TenantSubscriptionSerializer(read_only=True)
    property_count = serializers.IntegerField(read_only=True)
    active_user_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tenant
        fields = [
            'id', 'tenant_id', 'name', 'slug', 'status', 'owner',
            'billing_email', 'timezone', 'metadata', 'subscription',
            'property_count', 'active_user_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant_id', 'slug', 'owner', 'created_at', 'updated_at']

    def validate_timezone(self, value):
        if not is_valid_timezone(value):
            raise serializers.ValidationError(
                "Use a valid IANA timezone name, for example 'Asia/Bangkok' or 'UTC'."
            )
        return value

class RoomPropertiesCompatibilityField(serializers.Field):
    """Legacy ``properties[]`` wire field backed only by ``Room.property``."""

    def get_attribute(self, instance):
        # This is a projection; no model field named ``properties`` exists.
        return instance

    def to_representation(self, room):
        return [room.property_id]

# Room serializer defined first to avoid circular import issues
class RoomSerializer(serializers.ModelSerializer):
    properties = RoomPropertiesCompatibilityField(read_only=True)
    # The canonical FK is both the singular read contract and a supported
    # write reference. ``properties`` is output-only compatibility.
    property_id = serializers.CharField(required=False)

    class Meta:
        model = Room
        fields = ['room_id', 'name', 'room_type', 'is_active', 'created_at', 'properties', 'property_id']

    @staticmethod
    def _as_drf_validation_error(error):
        if hasattr(error, 'message_dict'):
            return serializers.ValidationError(error.message_dict)
        return serializers.ValidationError(str(error))

    def validate(self, attrs):
        if 'properties' in self.initial_data:
            raise serializers.ValidationError({
                'properties': 'properties is read-only; use property_id.',
            })
        explicit_value = attrs.pop('property_id', serializers.empty)

        explicit_property = None
        if explicit_value is not serializers.empty:
            try:
                explicit_property = resolve_property_reference(explicit_value)
            except ValidationError as error:
                raise self._as_drf_validation_error(error)

        existing_property = self.instance.property if self.instance and self.instance.property_id else None
        if explicit_property is None and existing_property is not None:
            resolved_property = existing_property
        else:
            try:
                resolved_property = resolve_room_property(
                    explicit_property=explicit_property,
                    existing_property=existing_property,
                )
            except ValidationError as error:
                raise self._as_drf_validation_error(error)

        _validate_request_property_access(self, resolved_property, 'property_id')
        attrs['_canonical_room_property'] = resolved_property
        return attrs

    def create(self, validated_data):
        canonical_property = validated_data.pop('_canonical_room_property')
        with transaction.atomic():
            room = Room.objects.create(property=canonical_property, **validated_data)
        return room

    def update(self, instance, validated_data):
        canonical_property = validated_data.pop('_canonical_room_property')
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['room_id'] = data.get('room_id') or getattr(instance, 'room_id', None)
        data['name'] = data.get('name') or 'Unnamed room'
        data['room_type'] = data.get('room_type') or 'Room'
        data['is_active'] = bool(data.get('is_active'))
        # Compatibility output is deliberately derived from the canonical FK,
        # never from the transitional Room.properties M2M.
        data['property_id'] = instance.property_id
        data['properties'] = [instance.property_id] if instance.property_id else []
        return data


class RoomSummarySerializer(serializers.ModelSerializer):
    """
    Lightweight room serializer for nested usage (e.g., inside jobs/properties).
    Returns only essential fields and a simplified list of property_ids to
    avoid deep nesting and large payloads.
    """
    properties = serializers.SerializerMethodField()
    property_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Room
        fields = ['room_id', 'name', 'room_type', 'property_id', 'properties']

    def get_properties(self, obj):
        return [obj.property_id] if obj.property_id else []

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['room_id'] = data.get('room_id') or getattr(instance, 'room_id', None)
        data['name'] = data.get('name') or 'Unnamed room'
        data['room_type'] = data.get('room_type') or 'Room'
        data['property_id'] = instance.property_id
        data['properties'] = data.get('properties') if isinstance(data.get('properties'), list) else []
        return data

# Property serializer for PM status endpoint
class PropertyPMStatusSerializer(serializers.ModelSerializer):
    """Serializer for property preventive maintenance status endpoint"""
    is_preventivemaintenance = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Property
        fields = ['property_id', 'name', 'is_preventivemaintenance']

# Property serializer with rooms and PM status
class PropertySerializer(serializers.ModelSerializer):
    rooms = serializers.SerializerMethodField()
    is_preventivemaintenance = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    timezone = serializers.CharField(source='tenant.timezone', read_only=True)

    class Meta:
        model = Property
        fields = [
            'id',
            'tenant',
            'tenant_name',
            'timezone',
            'property_id',
            'name',
            'description',
            'created_at',
            'rooms',
            'is_preventivemaintenance',
        ]
        read_only_fields = ['created_at', 'is_preventivemaintenance']
    
    def get_rooms(self, obj):
        """Get rooms for this property.
        To reduce payload size on list views, rooms are only included when
        context['include_rooms'] is True. Otherwise, return an empty list.
        """
        include_rooms = self.context.get('include_rooms', False)
        if not include_rooms:
            return []
        rooms = obj.canonical_rooms.all()
        return RoomSummarySerializer(rooms, many=True, context=self.context).data
    
    def get_is_preventivemaintenance(self, obj):
        """
        Check if this property has any preventive maintenance jobs
        Only calculated if explicitly requested to avoid extra queries
        """
        calculate_pm = self.context.get('calculate_pm', False)
        if not calculate_pm:
            return None
            
        has_pm_jobs = Job.objects.filter(
            property=obj,
            is_preventivemaintenance=True
        ).exists()
        
        return has_pm_jobs

# User profile serializer
class UserProfileSerializer(serializers.ModelSerializer):
    properties = serializers.SerializerMethodField()
    username = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    display_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='user.date_joined', read_only=True)
    # Property fields from User model
    user_property_name = serializers.CharField(source='user.property_name', read_only=True)
    user_property_id = serializers.CharField(source='user.property_id', read_only=True)
    # Property fields from UserProfile model
    profile_property_name = serializers.CharField(source='property_name', read_only=True)
    profile_property_id = serializers.CharField(source='property_id', read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'display_name',
            'profile_image',
            'positions',
            'properties',
            'user_property_name',
            'user_property_id',
            'profile_property_name',
            'profile_property_id',
            'created_at',
            'email_notifications_enabled',
        ]
        read_only_fields = ['id', 'username', 'email', 'first_name', 'last_name', 'display_name', 'created_at']

    def get_display_name(self, obj):
        return get_user_display_name(obj.user)

    def get_username(self, obj):
        return get_user_public_username(obj.user)

    def get_properties(self, obj):
        """Return the read-only compatibility projection of canonical access."""
        return PropertySerializer(
            get_accessible_properties(obj.user),
            many=True,
            read_only=True,
            context=self.context,
        ).data


class CurrentUserProfileSerializer(serializers.ModelSerializer):
    """Minimal current-user profile DTO.

    Account identity and TenantMembership authorization are projections only.
    The companion update serializer owns the deliberately small write contract.
    """

    username = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    display_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='user.date_joined', read_only=True)
    properties = serializers.SerializerMethodField()
    memberships = serializers.SerializerMethodField()
    is_platform_superuser = serializers.BooleanField(source='user.is_superuser', read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            'username',
            'email',
            'first_name',
            'last_name',
            'display_name',
            'profile_image',
            'positions',
            'created_at',
            'email_notifications_enabled',
            'properties',
            'memberships',
            'is_platform_superuser',
        ]
        read_only_fields = fields

    def get_username(self, obj):
        return get_user_public_username(obj.user)

    def get_display_name(self, obj):
        return get_user_display_name(obj.user)

    @staticmethod
    def _property_summary(properties):
        return [
            {
                'property_id': property_obj.property_id,
                'name': property_obj.name,
            }
            for property_obj in properties
        ]

    def get_properties(self, obj):
        return self._property_summary(get_accessible_properties(obj.user).order_by('name'))

    def get_memberships(self, obj):
        memberships = get_user_tenant_memberships(obj.user).prefetch_related(
            'tenant__properties',
        ).order_by('tenant__name')
        result = []
        for membership in memberships:
            if membership.role in TENANT_WIDE_PROPERTY_ROLES:
                properties = sorted(membership.tenant.properties.all(), key=lambda item: item.name)
                access_scope = 'tenant_wide'
            else:
                properties = sorted(
                    (
                        property_obj
                        for property_obj in membership.properties.all()
                        if property_obj.tenant_id == membership.tenant_id
                    ),
                    key=lambda item: item.name,
                )
                access_scope = 'granted'
            result.append({
                'tenant_id': membership.tenant.tenant_id,
                'tenant_name': membership.tenant.name,
                'role': membership.role,
                'access_scope': access_scope,
                'properties': self._property_summary(properties),
            })
        return result


class CurrentUserProfileUpdateSerializer(serializers.Serializer):
    """Write allowlist for user-controlled, non-authorization metadata."""

    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    positions = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def update(self, instance, validated_data):
        with transaction.atomic():
            user = instance.user
            user_fields = []
            for field in ('first_name', 'last_name'):
                if field in validated_data and getattr(user, field) != validated_data[field]:
                    setattr(user, field, validated_data[field])
                    user_fields.append(field)
            if user_fields:
                user.save(update_fields=user_fields)

            if 'positions' in validated_data and instance.positions != validated_data['positions']:
                instance.positions = validated_data['positions']
                # UserProfile.save() performs image conversion whenever an avatar is
                # present. A metadata-only update must not rewrite or orphan it.
                UserProfile.objects.filter(pk=instance.pk).update(positions=instance.positions)
        return instance

    def create(self, validated_data):
        raise NotImplementedError('Current-user profiles are created with their User record.')

def _build_media_absolute_uri(request, media_path):
    """Build a stable media URL from paths stored by FileField or helper fields.

    Admin-created records and older conversion jobs can store a mix of values:
    FileField names, /media/ URLs, absolute backend URLs, or absolute filesystem
    paths. Normalize those values before exposing them to the frontend.
    """
    if not media_path:
        return None

    value = str(media_path).strip()
    if not value:
        return None

    if value.startswith(('http://', 'https://')):
        return value

    media_url = getattr(settings, 'MEDIA_URL', '/media/') or '/media/'
    if not media_url.startswith('/'):
        media_url = f'/{media_url}'
    if not media_url.endswith('/'):
        media_url = f'{media_url}/'

    media_root = str(getattr(settings, 'MEDIA_ROOT', '') or '')
    if media_root and value.startswith(media_root):
        value = value[len(media_root):].lstrip('/\\')

    # Collapse common bad persisted forms such as /media/media/foo.jpg.
    while value.startswith(media_url):
        value = value[len(media_url):]
    value = value.lstrip('/\\')

    url_path = f'{media_url}{value}'
    if request:
        try:
            return request.build_absolute_uri(url_path)
        except Exception:
            return url_path
    return url_path


# Job image serializer
class JobImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    jpeg_url = serializers.SerializerMethodField()

    class Meta:
        model = JobImage
        fields = ['id', 'image_url', 'jpeg_url', 'uploaded_by', 'uploaded_at']

    def get_image_url(self, obj):
        """Return the URL for the original uploaded image."""
        if obj.image:
            request = self.context.get('request')
            return _build_media_absolute_uri(request, getattr(obj.image, 'url', obj.image.name))
        return None

    def get_jpeg_url(self, obj):
        """Return the URL for the JPEG-converted image when available."""
        jpeg_path = getattr(obj, 'jpeg_path', None)
        if not jpeg_path:
            return None

        jp = str(jpeg_path)
        if '/' not in jp and getattr(obj, 'image', None):
            # Backward-compat: only a filename was stored; infer its directory
            # from the original image path.
            try:
                image_name = getattr(obj.image, 'name', '')
                parent = str(Path(image_name).parent)
                if parent and parent != '.':
                    jp = str(Path(parent) / jp)
            except Exception:
                pass

        # Old rows can contain template fragments such as %Y/%m or a JPEG
        # filename that was never written. Do not expose a URL that is known to
        # return 404; consumers can fall back to image_url instead.
        normalized_path = jp.lstrip('/\\')
        media_prefix = (getattr(settings, 'MEDIA_URL', '/media/') or '/media/').strip('/')
        if media_prefix and normalized_path.startswith(f'{media_prefix}/'):
            normalized_path = normalized_path[len(media_prefix) + 1:]
        try:
            if '%' in normalized_path or not default_storage.exists(normalized_path):
                return None
        except Exception:
            # Remote/custom storage may not support an existence check.
            pass

        request = self.context.get('request')
        return _build_media_absolute_uri(request, normalized_path)

# Topic serializer
class TopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ['title', 'description', 'id', 'is_visible_in_create_job']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['id'] = data.get('id') or getattr(instance, 'id', None)
        data['title'] = data.get('title') or 'Untitled topic'
        data['description'] = data.get('description') or ''
        data['is_visible_in_create_job'] = bool(data.get('is_visible_in_create_job', True))
        return data


# Area serializer
class AreaSerializer(serializers.ModelSerializer):
    property_id = serializers.SlugRelatedField(
        source='property',
        slug_field='property_id',
        queryset=Property.objects.all(),
        write_only=True,
    )
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_uuid = serializers.CharField(source='property.property_id', read_only=True)
    jobs_count = serializers.SerializerMethodField()

    class Meta:
        model = Area
        fields = [
            'id', 'name', 'description', 'is_active',
            'property', 'property_id', 'property_name', 'property_uuid',
            'jobs_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'property', 'created_at', 'updated_at', 'jobs_count']

    def get_jobs_count(self, obj):
        if hasattr(obj, 'jobs_count_value'):
            return obj.jobs_count_value
        return obj.jobs.count()

    def validate(self, data):
        _validate_request_property_access(self, data.get('property') or getattr(self.instance, 'property', None))
        return data


# Area summary serializer (nested usage)
class AreaSummarySerializer(serializers.ModelSerializer):
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)

    class Meta:
        model = Area
        fields = ['id', 'name', 'is_active', 'property_id', 'property_name']
        read_only_fields = fields


# Job comment serializer
class JobCommentSerializer(serializers.ModelSerializer):
    author_username = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()
    author_id = serializers.IntegerField(source='author.id', read_only=True)

    class Meta:
        model = JobComment
        fields = [
            'id', 'job', 'comment',
            'author_id', 'author_username', 'author_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'job', 'author_id', 'author_username', 'author_name',
            'created_at', 'updated_at',
        ]

    def get_author_name(self, obj):
        return get_user_display_name(obj.author)

    def get_author_username(self, obj):
        return get_user_public_username(obj.author)

    def validate_comment(self, value):
        text = (value or '').strip()
        if not text:
            raise serializers.ValidationError("Comment cannot be empty.")
        return text


# Purpose-built read serializer for the Property-scoped Jobs dashboard.  Keep
# assignee contact details and database Job/User identities out of this list
# projection; detail and write endpoints continue to use JobSerializer.
class JobDashboardImageSerializer(JobImageSerializer):
    class Meta(JobImageSerializer.Meta):
        fields = ['image_url', 'jpeg_url', 'uploaded_at']


class JobDashboardSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    images = JobDashboardImageSerializer(source='job_images', many=True, read_only=True)
    topics = TopicSerializer(many=True, read_only=True)
    rooms = RoomSummarySerializer(many=True, read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    area = AreaSummarySerializer(read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True)
    can_operate = serializers.SerializerMethodField()
    can_assign = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            'job_id', 'description', 'status', 'priority', 'remarks',
            'created_at', 'updated_at', 'completed_at', 'is_defective',
            'is_preventivemaintenance', 'property_id', 'rooms', 'topics',
            'images', 'area', 'area_name', 'user_name', 'technician_name',
            'can_operate', 'can_assign',
        ]
        read_only_fields = fields

    def _can_operate(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if user.is_superuser:
            return True
        if not hasattr(self, '_operable_property_ids'):
            self._operable_property_ids = set(
                get_operable_properties(user).values_list('pk', flat=True)
            )
        return obj.property_id in self._operable_property_ids

    def get_user_name(self, obj):
        return get_user_display_name(getattr(obj, 'user', None)) or 'Unassigned technician'

    def get_technician_name(self, obj):
        return self.get_user_name(obj)

    def get_can_operate(self, obj):
        return self._can_operate(obj)

    def get_can_assign(self, obj):
        return self._can_operate(obj)


# Job serializer
class JobSerializer(serializers.ModelSerializer):
    updated_by = serializers.SlugRelatedField(
        slug_field='username',
        queryset=User.objects.all(),
        required=False,
        allow_null=True
    )
    # Change from StringRelatedField to show user details
    user = serializers.SerializerMethodField()
    user_username = serializers.SerializerMethodField()
    user_first_name = serializers.CharField(source='user.first_name', read_only=True)
    user_last_name = serializers.CharField(source='user.last_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    images = JobImageSerializer(source='job_images', many=True, read_only=True)
    topics = TopicSerializer(many=True, read_only=True)
    profile_image = serializers.SerializerMethodField()
    room_type = serializers.CharField(source='room.room_type', read_only=True)
    name = serializers.CharField(source='room.name', read_only=True)
    rooms = RoomSummarySerializer(many=True, read_only=True)
    topic_data = serializers.JSONField(write_only=True)
    room_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    room_ids = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.all(), many=True, write_only=True, required=False
    )
    property_id = serializers.CharField(write_only=True, required=False, allow_blank=True)
    image_urls = serializers.SerializerMethodField()
    area = AreaSummarySerializer(read_only=True)
    area_id = serializers.PrimaryKeyRelatedField(
        source='area', queryset=Area.objects.all(),
        required=False, allow_null=True,
    )
    area_name = serializers.CharField(source='area.name', read_only=True)
    comments_count = serializers.SerializerMethodField()
    can_operate = serializers.SerializerMethodField()
    can_assign = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            'id', 'job_id', 'user', 'user_username', 'user_first_name', 'user_last_name', 'user_email',
            'user_name', 'technician_name', 'created_by_name', 'updated_by_name',
            'updated_by', 'description', 'status', 'priority',
            'remarks', 'created_at', 'updated_at', 'completed_at', 'is_defective',
            'rooms', 'topics', 'images', 'profile_image', 'room_type', 'name',
            'topic_data', 'room_id', 'room_ids', 'property_id', 'image_urls', 'is_preventivemaintenance',
            'area', 'area_id', 'area_name', 'comments_count', 'can_operate', 'can_assign',
        ]
        read_only_fields = [
            'id', 'job_id', 'user', 'user_username', 'user_first_name', 'user_last_name',
            'user_email', 'user_name', 'technician_name', 'created_by_name',
            'updated_by_name', 'images', 'topics', 'area', 'area_name', 'comments_count',
            'can_operate', 'can_assign',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Writes accept the public Property.property_id through the existing
        # write-only field. Reads expose that same public identity rather than
        # the database primary key so clients can preserve active-property
        # context without guessing from rooms or legacy profile fields.
        property_obj = getattr(instance, 'property', None)
        data['property_id'] = getattr(property_obj, 'property_id', None)
        return data

    def _can_operate(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False) or not obj.property_id:
            return False
        if user.is_superuser:
            return True
        if not hasattr(self, '_operable_property_ids'):
            self._operable_property_ids = set(
                get_operable_properties(user).values_list('pk', flat=True)
            )
        return obj.property_id in self._operable_property_ids

    def get_can_operate(self, obj):
        return self._can_operate(obj)

    def get_can_assign(self, obj):
        return self._can_operate(obj)

    def get_comments_count(self, obj):
        annotated_count = getattr(obj, '_comments_count', None)
        if annotated_count is not None:
            return annotated_count
        try:
            return obj.comments.count()
        except Exception:
            return 0

    def validate(self, data):
        """Validate timestamp fields to ensure logical order"""
        from django.utils import timezone
        
        created_at = data.get('created_at')
        updated_at = data.get('updated_at')
        completed_at = data.get('completed_at')
        
        # If created_at is provided, ensure it's not in the future
        if created_at and created_at > timezone.now():
            raise serializers.ValidationError("Created date cannot be in the future")
        
        # If completed_at is provided, ensure it's not before created_at
        if completed_at and created_at and completed_at < created_at:
            raise serializers.ValidationError("Completed date cannot be before created date")
        
        # If updated_at is provided, ensure it's not before created_at
        if updated_at and created_at and updated_at < created_at:
            raise serializers.ValidationError("Updated date cannot be before created date")

        room_id = data.get('room_id')
        supplied_rooms = list(data.get('room_ids') or [])
        if room_id and supplied_rooms:
            raise serializers.ValidationError({'non_field_errors': 'Use room_id or room_ids, not both.'})
        if room_id:
            try:
                supplied_rooms = [Room.objects.select_related('property').get(room_id=room_id)]
            except Room.DoesNotExist:
                raise serializers.ValidationError({'room_id': 'Invalid room ID'})

        instance = self.instance
        future_rooms = supplied_rooms if (room_id or 'room_ids' in data) else (
            list(instance.rooms.all()) if instance is not None else []
        )
        future_area = data.get('area') if 'area' in data else (instance.area if instance is not None else None)
        explicit_input = data.get('property_id')
        if instance is None and not str(explicit_input or '').strip():
            raise serializers.ValidationError({
                'property_id': 'An active property is required.'
            })
        try:
            explicit_property = (
                resolve_external_property_reference(explicit_input)
                if explicit_input else None
            )
        except ValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc

        if instance is not None:
            if instance.property_id is None:
                raise serializers.ValidationError({'property_id': 'Existing Job has no canonical property.'})
            if explicit_property is not None and explicit_property.pk != instance.property_id:
                raise serializers.ValidationError({'property_id': 'Job property is immutable after creation.'})
            explicit_property = instance.property

        try:
            resolved_property = resolve_job_property(
                explicit_property=explicit_property,
                area=future_area,
                rooms=future_rooms,
                require=True,
            )
        except ValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc

        data['_resolved_property'] = resolved_property
        if room_id or 'room_ids' in data:
            data['_resolved_rooms'] = future_rooms

        return data

    def get_user(self, obj):
        """Return user information in a structured format"""
        user = getattr(obj, 'user', None)
        if user:
            return {
                'id': getattr(user, 'id', None),
                'username': get_user_public_username(user),
                'first_name': getattr(user, 'first_name', '') or '',
                'last_name': getattr(user, 'last_name', '') or '',
                'email': getattr(user, 'email', '') or '',
                'full_name': user.get_full_name().strip() or get_user_display_name(user),
                'display_name': get_user_display_name(user),
            }
        return None

    def get_user_name(self, obj):
        return get_user_display_name(getattr(obj, 'user', None)) or 'Unknown user'

    def get_user_username(self, obj):
        return get_user_public_username(getattr(obj, 'user', None))

    def get_technician_name(self, obj):
        return get_user_display_name(getattr(obj, 'user', None)) or 'Unknown technician'

    def get_created_by_name(self, obj):
        return get_user_display_name(getattr(obj, 'user', None)) or 'Unknown user'

    def get_updated_by_name(self, obj):
        return get_user_display_name(getattr(obj, 'updated_by', None)) or ''

    def get_profile_image(self, obj):
        """
        Lightweight serializer for user's profile image info to avoid deep
        nesting. Returns:
          { profile_image: <url or null>, properties: [{property_id, name}] }
        """
        user = getattr(obj, 'user', None)
        userprofile = getattr(user, 'userprofile', None)
        if not userprofile:
            return None

        request = self.context.get('request')
        image_url = None
        if userprofile.profile_image and request:
            image_url = request.build_absolute_uri(userprofile.profile_image.url)
        elif userprofile.profile_image:
            image_url = userprofile.profile_image.url

        cache = getattr(self, '_accessible_properties_cache', None)
        if cache is None:
            cache = self._accessible_properties_cache = {}
        user_pk = getattr(user, 'pk', None)
        cache_key = ('pk', user_pk) if user_pk is not None else ('object', id(user))
        if cache_key not in cache:
            cache[cache_key] = list(
                get_accessible_properties(user).values('property_id', 'name')
            )
        properties = cache[cache_key]

        return {
            'profile_image': image_url,
            'properties': properties,
        }

    def get_image_urls(self, obj):
        """Return normalized URLs for all images associated with the job."""
        request = self.context.get('request')
        urls = []
        seen = set()
        try:
            for image in obj.job_images.all():
                candidates = []
                jpeg_path = getattr(image, 'jpeg_path', None)
                if jpeg_path:
                    jpeg_name = str(jpeg_path).lstrip('/\\')
                    try:
                        if '%' not in jpeg_name and default_storage.exists(jpeg_name):
                            candidates.append(jpeg_name)
                    except Exception:
                        candidates.append(jpeg_name)
                if getattr(image, 'image', None):
                    candidates.append(getattr(image.image, 'url', image.image.name))
                for candidate in candidates:
                    url = _build_media_absolute_uri(request, candidate)
                    if url and url not in seen:
                        urls.append(url)
                        seen.add(url)
                        break
        except Exception:
            return []
        return urls

    def create(self, validated_data):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("User must be logged in to create a job")

        validated_data.pop('user', None)
        validated_data.pop('username', None)
        validated_data.pop('user_id', None)
        validated_data.pop('property_id', None)
        resolved_property = validated_data.pop('_resolved_property')
        resolved_rooms = validated_data.pop('_resolved_rooms', None)

        topic_data = validated_data.pop('topic_data', None)
        room_id = validated_data.pop('room_id', None)
        # ``room_ids`` is request-only input.  The resolved Room instances are
        # attached through Job.rooms after the Job row exists.
        validated_data.pop('room_ids', None)
        area = validated_data.get('area')

        if not room_id and not resolved_rooms and not area and not resolved_property:
            raise serializers.ValidationError(
                {'non_field_errors': 'Either room_id or area_id is required.'}
            )
        if not topic_data or 'title' not in topic_data:
            raise serializers.ValidationError({'topic_data': 'This field is required and must include a title.'})

        try:
            with transaction.atomic():
                room = Room.objects.get(room_id=room_id) if room_id else None
                topic, _ = Topic.objects.get_or_create(
                    title=topic_data['title'],
                    defaults={'description': topic_data.get('description', '')}
                )
                job = Job.objects.create(
                    **validated_data,
                    user=request.user,
                    property=resolved_property,
                )
                if resolved_rooms is not None:
                    job.rooms.set(resolved_rooms)
                elif room:
                    job.rooms.add(room)
                job.topics.add(topic)

                images = request.FILES.getlist('images', [])
                for image in images:
                    JobImage.objects.create(
                        job=job,
                        image=image,
                        uploaded_by=request.user
                    )

                job.refresh_from_db()
                return job
        except Room.DoesNotExist:
            raise serializers.ValidationError({'room_id': 'Invalid room ID'})
        except Exception as e:
            raise serializers.ValidationError({'detail': str(e)})

    def update(self, instance, validated_data):
        validated_data.pop('property_id', None)
        resolved_property = validated_data.pop('_resolved_property')
        resolved_rooms = validated_data.pop('_resolved_rooms', None)
        validated_data.pop('room_id', None)
        validated_data.pop('room_ids', None)
        if resolved_property.pk != instance.property_id:
            raise serializers.ValidationError({'property_id': 'Job property is immutable after creation.'})
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if resolved_rooms is not None:
                instance.rooms.set(resolved_rooms)
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Frontend/business identity is the canonical Property.property_id.
        # Exposing it from Job.property avoids inferring job ownership from
        # room/profile compatibility projections on read paths.
        data['property_id'] = instance.property.property_id if instance.property_id else None
        data['rooms'] = data.get('rooms') if isinstance(data.get('rooms'), list) else []
        data['topics'] = data.get('topics') if isinstance(data.get('topics'), list) else []
        data['images'] = data.get('images') if isinstance(data.get('images'), list) else []
        data['image_urls'] = data.get('image_urls') if isinstance(data.get('image_urls'), list) else []
        data['description'] = data.get('description') or ''
        data['status'] = data.get('status') or 'pending'
        data['priority'] = data.get('priority') or 'medium'
        data['comments_count'] = data.get('comments_count') or 0
        return data

# User registration serializer
class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

# User serializer for creation
class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password]
    )
    email = serializers.EmailField(required=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('username', 'password', 'email', 'display_name')
        read_only_fields = ('display_name',)

    def validate(self, attrs):
        username = attrs.get('username')
        if username and User.objects.filter(username=username).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError({"username": "A user with that username already exists."})

        email = attrs.get('email')
        if email and User.objects.filter(email=email).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError({"email": "A user with that email already exists."})

        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )
        UserProfile.objects.get_or_create(user=user)
        return user

    def get_display_name(self, obj):
        return get_user_display_name(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['username'] = get_user_public_username(instance)
        data['display_name'] = get_user_display_name(instance)
        return data

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

# Login serializer
class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        if not username or not password:
            raise serializers.ValidationError("Both username and password are required.")

        return attrs

# Session serializer
class SessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = [
            'session_token',
            'access_token',
            'refresh_token',
            'expires_at',
            'created_at',
        ]
        read_only_fields = ['created_at']

# ----- Machine Serializers -----

class MachineSerializer(serializers.ModelSerializer):
    """General-purpose serializer for Equipment (Machine) following ER diagram"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    task_count = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    lifecycle_state = serializers.CharField(read_only=True)
    is_under_warranty = serializers.BooleanField(read_only=True)

    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'description', 'location', 'property', 'property_name',
            'status', 'group_id', 'installation_date', 'last_maintenance_date', 'task_count',
            'purchase_date', 'purchase_cost', 'warranty_start_date', 'warranty_end_date',
            'expected_replacement_date', 'replacement_cost_estimate', 'supplier',
            'supplier_contact', 'asset_tag', 'lifecycle_notes', 'lifecycle_state',
            'is_under_warranty', 'image', 'image_url', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_id', 'created_at', 'updated_at']
    
    def get_image_url(self, obj):
        """Get the absolute URL for the machine image"""
        request = self.context.get('request')
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        elif obj.image:
            return obj.image.url
        return None
    
    def get_task_count(self, obj):
        """Get count of maintenance tasks for this equipment"""
        # maintenance_tasks relationship removed - equipment no longer linked to task templates
        return 0
    
    def validate(self, data):
        """Custom validation for machine data"""
        installation_date = data.get('installation_date')
        last_maintenance_date = data.get('last_maintenance_date')
        
        if installation_date and last_maintenance_date:
            if last_maintenance_date.date() < installation_date:
                raise serializers.ValidationError({
                    'last_maintenance_date': 'Maintenance date cannot be earlier than installation date'
                })
        
        return data

class MachineListSerializer(serializers.ModelSerializer):
    """Lighter serializer for listing equipment following ER diagram"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    task_count = serializers.SerializerMethodField()
    next_maintenance_date = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    lifecycle_state = serializers.CharField(read_only=True)
    is_under_warranty = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'status', 'location', 'property_id', 'property_name',
            'task_count', 'next_maintenance_date', 'last_maintenance_date',
            'expected_replacement_date', 'warranty_end_date', 'lifecycle_state',
            'is_under_warranty', 'image_url'
        ]
    
    def get_task_count(self, obj):
        """Get count of maintenance tasks for this equipment"""
        # maintenance_tasks relationship removed - equipment no longer linked to task templates
        return 0
    
    def get_next_maintenance_date(self, obj):
        """Get the next scheduled maintenance date"""
        return obj.get_next_maintenance_date()
    
    def get_image_url(self, obj):
        """Get the absolute URL for the machine image"""
        request = self.context.get('request')
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        elif obj.image:
            return obj.image.url
        return None


def get_pm_property_external_id(obj):
    """Return the canonical external property ID for a PM record."""
    if obj.job_id and obj.job.property_id:
        return obj.job.property.property_id

    property_ids = {
        machine.property.property_id
        for machine in obj.machines.all()
        if machine.property_id
    }
    return next(iter(property_ids)) if len(property_ids) == 1 else None


def get_pm_property(obj):
    """Return the sole canonical Property for a PM, or None if malformed."""
    if obj is None:
        return None
    if obj.job_id and obj.job.property_id:
        return obj.job.property
    property_ids = set(obj.machines.values_list('property_id', flat=True))
    if len(property_ids) != 1:
        return None
    return Property.objects.filter(pk=next(iter(property_ids))).first()


class PreventiveMaintenanceListSerializer(serializers.ModelSerializer):
    job_id = serializers.SerializerMethodField()
    job_description = serializers.SerializerMethodField()
    topics = TopicSerializer(many=True)
    machines = serializers.SerializerMethodField()
    property_id = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    procedure = serializers.SerializerMethodField()
    before_image_url = serializers.SerializerMethodField()
    after_image_url = serializers.SerializerMethodField()
    procedure_template_name = serializers.CharField(source='procedure_template.name', read_only=True)
    procedure_template_id = serializers.IntegerField(source='procedure_template.id', read_only=True)
    assigned_to_details = UserSummarySerializer(source='assigned_to', read_only=True)
    created_by_details = UserSummarySerializer(source='created_by', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'pmtitle', 'job_id', 'job_description', 'scheduled_date', 'completed_date',
            'frequency', 'next_due_date', 'status', 'topics', 'machines', 'property_id',
            'procedure', 'notes', 'before_image_url', 'after_image_url', 'procedure_template',
            'procedure_template_id', 'procedure_template_name', 'master_plan', 'occurrence_due_date',
            'generated_at', 'assigned_to_details',
            'created_by_details', 'assigned_to_name', 'technician_name', 'created_by_name'
        ]
        list_serializer_class = serializers.ListSerializer

    def get_assigned_to_name(self, obj):
        return get_user_display_name(obj.assigned_to)

    def get_technician_name(self, obj):
        return get_user_display_name(obj.assigned_to)

    def get_created_by_name(self, obj):
        return get_user_display_name(obj.created_by)

    def get_job_id(self, obj):
        return obj.job.job_id if obj.job else None

    def get_job_description(self, obj):
        return obj.job.description if obj.job else None

    def get_machines(self, obj):
        machines = list(obj.machines.all())
        return MachineSerializer(machines, many=True).data if machines else []

    def get_property_id(self, obj):
        return get_pm_property_external_id(obj)

    def get_status(self, obj):
        if obj.completed_date:
            return 'completed'
        if obj.status == 'cancelled':
            return obj.status
        if obj.scheduled_date and obj.scheduled_date < timezone.now():
            return 'overdue'
        return obj.status or 'pending'

    def get_procedure(self, obj):
        return obj.procedure

    def get_before_image_url(self, obj):
        request = self.context.get('request')
        if obj.before_image and request:
            return request.build_absolute_uri(obj.before_image.url)
        return None

    def get_after_image_url(self, obj):
        request = self.context.get('request')
        if obj.after_image and request:
            return request.build_absolute_uri(obj.after_image.url)
        return None

class MachineDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for equipment details view following ER diagram"""
    property = PropertySerializer(read_only=True)
    property_id = serializers.PrimaryKeyRelatedField(
        queryset=Property.objects.all(),
        source='property',
        write_only=True
    )
    preventive_maintenances = PreventiveMaintenanceListSerializer(many=True, read_only=True)
    maintenance_tasks = serializers.SerializerMethodField()
    maintenance_procedures = serializers.SerializerMethodField()
    days_since_last_maintenance = serializers.SerializerMethodField()
    next_maintenance_date = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    lifecycle_state = serializers.CharField(read_only=True)
    is_under_warranty = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'description', 'location', 'property', 'property_id',
            'status', 'group_id', 'installation_date', 'last_maintenance_date', 
            'purchase_date', 'purchase_cost', 'warranty_start_date', 'warranty_end_date',
            'expected_replacement_date', 'replacement_cost_estimate', 'supplier',
            'supplier_contact', 'asset_tag', 'lifecycle_notes', 'lifecycle_state',
            'is_under_warranty',
            'preventive_maintenances', 'maintenance_tasks', 'maintenance_procedures',
            'days_since_last_maintenance', 'next_maintenance_date', 
            'image', 'image_url', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_id', 'created_at', 'updated_at']
    
    def get_image_url(self, obj):
        """Get the absolute URL for the machine image"""
        request = self.context.get('request')
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        elif obj.image:
            return obj.image.url
        return None
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Note: maintenance_procedures relationship should now exist after adding ManyToManyField
        # Keep the field in the serializer
    
    def get_maintenance_tasks(self, obj):
        """Get detailed info about maintenance tasks (ER diagram relationship)"""
        # maintenance_tasks relationship removed - equipment no longer linked to task templates
        return []
    
    def get_maintenance_procedures(self, obj):
        """Get maintenance procedures assigned to this machine"""
        try:
            # Check if the many-to-many relationship exists (migration 0038 applied)
            if not hasattr(obj, 'maintenance_procedures'):
                return []
            
            procedures = obj.maintenance_procedures.all()
            return [
                {
                    'id': proc.id,
                    'name': proc.name,
                    'group_id': proc.group_id,
                    'category': proc.category,
                    'frequency': proc.frequency,
                    'estimated_duration': proc.estimated_duration,
                    'responsible_department': proc.responsible_department,
                    'difficulty_level': proc.difficulty_level,
                    'created_at': proc.created_at.isoformat() if proc.created_at else None,
                }
                for proc in procedures
            ]
        except (ProgrammingError, AttributeError) as e:
            # Handle case where migration hasn't been applied yet (table doesn't exist)
            # ProgrammingError: relation "myappLubd_maintenanceprocedure_machines" does not exist
            # Log the error but don't crash the API
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Could not fetch maintenance_procedures for machine {obj.id}: {e}. "
                          f"Migration 0038 may not have been applied yet.")
            return []
    
    def get_days_since_last_maintenance(self, obj):
        """Calculate days since last maintenance"""
        if obj.last_maintenance_date:
            delta = timezone.now() - obj.last_maintenance_date
            return delta.days
        return None
    
    def get_next_maintenance_date(self, obj):
        """Get the next scheduled maintenance date"""
        return obj.get_next_maintenance_date()
    
    def validate(self, data):
        """Custom validation for machine data"""
        installation_date = data.get('installation_date')
        last_maintenance_date = data.get('last_maintenance_date')
        
        if installation_date and last_maintenance_date:
            if last_maintenance_date.date() < installation_date:
                raise serializers.ValidationError({
                    'last_maintenance_date': 'Maintenance date cannot be earlier than installation date'
                })
        
        return data

class MachineCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating machines"""
    property_id = serializers.SlugRelatedField(
        source='property', slug_field='property_id', queryset=Property.objects.all()
    )

    class Meta:
        model = Machine
        fields = [
            'name', 'brand', 'category', 'serial_number', 'description', 'location', 'property_id',
            'status', 'group_id', 'installation_date', 'last_maintenance_date',
            'purchase_date', 'purchase_cost', 'warranty_start_date', 'warranty_end_date',
            'expected_replacement_date', 'replacement_cost_estimate', 'supplier',
            'supplier_contact', 'asset_tag', 'lifecycle_notes', 'image'
        ]
    
    def validate(self, data):
        """Custom validation for machine creation"""
        _validate_request_property_access(self, data.get('property'))
        installation_date = data.get('installation_date')
        last_maintenance_date = data.get('last_maintenance_date')
        
        if installation_date and last_maintenance_date:
            if last_maintenance_date.date() < installation_date:
                raise serializers.ValidationError({
                    'last_maintenance_date': 'Maintenance date cannot be earlier than installation date'
                })
        
        return data

class MachineUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating machines"""
    property_id = serializers.SlugRelatedField(
        source='property', slug_field='property_id', queryset=Property.objects.all(), required=False
    )

    class Meta:
        model = Machine
        fields = [
            'name', 'brand', 'category', 'serial_number', 'description', 'location', 'property_id',
            'status', 'group_id', 'installation_date', 'last_maintenance_date',
            'purchase_date', 'purchase_cost', 'warranty_start_date', 'warranty_end_date',
            'expected_replacement_date', 'replacement_cost_estimate', 'supplier',
            'supplier_contact', 'asset_tag', 'lifecycle_notes', 'image'
        ]
    
    def validate(self, data):
        """Custom validation for machine updates"""
        _validate_request_property_access(self, data.get('property') or getattr(self.instance, 'property', None))
        installation_date = data.get('installation_date')
        last_maintenance_date = data.get('last_maintenance_date')
        
        if installation_date and last_maintenance_date:
            if last_maintenance_date.date() < installation_date:
                raise serializers.ValidationError({
                    'last_maintenance_date': 'Maintenance date cannot be earlier than installation date'
                })
        
        return data

class MachinePreventiveMaintenanceSerializer(serializers.ModelSerializer):
    """Serializer for associating preventive maintenance with machines"""
    preventive_maintenance_ids = serializers.ListField(
        child=serializers.CharField(),
        write_only=True
    )
    
    class Meta:
        model = Machine
        fields = ['preventive_maintenance_ids']
    
    def update(self, instance, validated_data):
        pm_ids = validated_data.pop('preventive_maintenance_ids', [])
        if len(pm_ids) != len(set(pm_ids)):
            raise serializers.ValidationError({
                'preventive_maintenance_ids': 'Duplicate maintenance IDs are not allowed.'
            })

        pm_instances = list(
            PreventiveMaintenance.objects.filter(pm_id__in=pm_ids)
            .select_related('job__property')
            .prefetch_related('machines__property')
        )
        if len(pm_instances) != len(pm_ids):
            raise serializers.ValidationError({
                'preventive_maintenance_ids': 'One or more maintenance IDs are invalid.'
            })

        invalid_property = [
            pm.pm_id for pm in pm_instances
            if get_pm_property(pm) != instance.property
        ]
        if invalid_property:
            raise serializers.ValidationError({
                'preventive_maintenance_ids': (
                    'Every maintenance record must belong to the machine property.'
                )
            })

        instance.preventive_maintenances.set(pm_instances)

        if pm_instances:
            latest_completed = max(
                (pm for pm in pm_instances if pm.completed_date),
                key=lambda pm: pm.completed_date,
                default=None,
            )
            if latest_completed:
                instance.last_maintenance_date = latest_completed.completed_date
                instance.save(update_fields=['last_maintenance_date', 'updated_at'])
        return instance


class PMMasterPlanSerializer(serializers.ModelSerializer):
    topics = TopicSerializer(many=True, read_only=True)
    topic_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False, allow_empty=True)
    machines = MachineSerializer(many=True, read_only=True)
    machine_ids = serializers.ListField(child=serializers.CharField(), write_only=True, required=False, allow_empty=True)
    procedure_template_name = serializers.CharField(source='procedure_template.name', read_only=True)
    assigned_to_details = UserSummarySerializer(source='assigned_to', read_only=True)
    created_by_details = UserSummarySerializer(source='created_by', read_only=True)
    property_id = serializers.SerializerMethodField()
    can_operate = serializers.SerializerMethodField()
    generated_pm_id = serializers.SerializerMethodField()
    generated_pm_status = serializers.SerializerMethodField()

    class Meta:
        model = PMMasterPlan
        fields = [
            'plan_id', 'title', 'topics', 'topic_ids', 'machines', 'machine_ids',
            'property_id', 'can_operate', 'procedure_template', 'procedure_template_name', 'frequency',
            'custom_days', 'start_date', 'lead_time_days', 'assigned_to',
            'assigned_to_details', 'created_by_details', 'active', 'last_completed_date',
            'next_due_date', 'notes', 'procedure', 'remarks', 'created_at', 'updated_at',
            'generated_pm_id', 'generated_pm_status',
        ]
        read_only_fields = ['plan_id', 'created_by_details', 'last_completed_date', 'next_due_date', 'created_at', 'updated_at']
        extra_kwargs = {
            'procedure_template': {'required': False, 'allow_null': True},
            'custom_days': {'required': False, 'allow_null': True},
            'assigned_to': {'required': False, 'allow_null': True},
            'notes': {'required': False, 'allow_null': True},
            'procedure': {'required': False, 'allow_null': True},
            'remarks': {'required': False, 'allow_null': True},
        }

    def get_property_id(self, obj):
        machines = list(obj.machines.all())
        machine = machines[0] if machines else None
        return machine.property.property_id if machine and machine.property else None

    def get_can_operate(self, obj):
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        property_ids = {
            machine.property_id
            for machine in obj.machines.all()
            if machine.property_id
        }
        if len(property_ids) != 1:
            return False

        if not hasattr(self, '_operable_property_ids'):
            self._operable_property_ids = set(
                get_operable_properties(request.user).values_list('pk', flat=True)
            )
        return property_ids.issubset(self._operable_property_ids)

    def _get_current_generated_pm(self, obj):
        cache_key = '_serializer_current_generated_pm'
        if not hasattr(obj, cache_key):
            pending = [
                pm for pm in obj.generated_maintenances.all()
                if pm.completed_date is None
            ]
            current = min(
                pending,
                key=lambda pm: pm.occurrence_due_date or pm.scheduled_date,
                default=None,
            )
            setattr(obj, cache_key, current)
        return getattr(obj, cache_key)

    def get_generated_pm_id(self, obj):
        current = self._get_current_generated_pm(obj)
        return current.pm_id if current else None

    def get_generated_pm_status(self, obj):
        current = self._get_current_generated_pm(obj)
        return current.status if current else None

    def validate(self, data):
        frequency = data.get('frequency', getattr(self.instance, 'frequency', None))
        custom_days = data.get('custom_days', getattr(self.instance, 'custom_days', None))
        if frequency == 'custom' and not custom_days:
            raise serializers.ValidationError({'custom_days': 'Custom days value is required when frequency is Custom.'})
        machine_ids = data.get('machine_ids')
        machines = []
        if self.instance is None and not machine_ids:
            raise serializers.ValidationError({'machine_ids': 'At least one machine is required.'})
        if machine_ids is not None:
            if not machine_ids:
                raise serializers.ValidationError({'machine_ids': 'At least one machine is required.'})
            machines = _validate_machine_ids_in_request_scope(self, machine_ids)
        elif self.instance is not None:
            machines = list(self.instance.machines.select_related('property'))

        request = self.context.get('request')
        request_property_id = (
            request.query_params.get('property_id')
            if request is not None
            else None
        )
        if request_property_id and machines:
            if machines[0].property.property_id != request_property_id:
                raise serializers.ValidationError({
                    'machine_ids': 'Machines must belong to the active property.'
                })

        assigned_to = data.get('assigned_to', getattr(self.instance, 'assigned_to', None))
        if assigned_to is not None and machines:
            if not get_accessible_properties(assigned_to).filter(pk=machines[0].property_id).exists():
                raise serializers.ValidationError({
                    'assigned_to': 'Assigned user must have access to the plan property.'
                })

        topic_ids = data.get('topic_ids')
        if topic_ids is not None:
            if len(topic_ids) != len(set(topic_ids)):
                raise serializers.ValidationError({'topic_ids': 'Duplicate topic IDs are not allowed.'})
            existing_topic_ids = set(Topic.objects.filter(pk__in=topic_ids).values_list('pk', flat=True))
            missing_topic_ids = sorted(set(topic_ids) - existing_topic_ids)
            if missing_topic_ids:
                raise serializers.ValidationError({
                    'topic_ids': f'Invalid topic IDs: {", ".join(str(topic_id) for topic_id in missing_topic_ids)}'
                })
        return data

    @transaction.atomic
    def create(self, validated_data):
        topic_ids = validated_data.pop('topic_ids', [])
        machine_ids = validated_data.pop('machine_ids', [])
        if validated_data.get('next_due_date') is None:
            validated_data['next_due_date'] = validated_data.get('start_date')
        plan = PMMasterPlan.objects.create(**validated_data)
        if topic_ids:
            plan.topics.set(topic_ids)
        if machine_ids:
            plan.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        return plan

    @transaction.atomic
    def update(self, instance, validated_data):
        schedule_changed = any(
            field in validated_data
            for field in ('start_date', 'frequency', 'custom_days')
        )
        topic_ids = validated_data.pop('topic_ids', None)
        machine_ids = validated_data.pop('machine_ids', None)
        plan = super().update(instance, validated_data)
        if topic_ids is not None:
            plan.topics.set(topic_ids)
        if machine_ids is not None:
            plan.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        if schedule_changed:
            if plan.last_completed_date is None:
                plan.next_due_date = plan.start_date
            else:
                from .services import PreventiveMaintenanceService
                plan.next_due_date = PreventiveMaintenanceService.calculate_next_due_date(
                    plan.frequency,
                    plan.custom_days,
                    plan.last_completed_date,
                    object_timezone(plan),
                )
            plan.save(update_fields=['next_due_date', 'updated_at'])
        return plan


# ----- Preventive Maintenance Serializers -----


PM_IMAGE_LIMIT = 10


def _pm_image_url(request, field_file):
    if not field_file:
        return None
    try:
        return request.build_absolute_uri(field_file.url) if request else field_file.url
    except (ValueError, AttributeError):
        return None


def serialize_pm_images(obj, request=None):
    """Return canonical related evidence plus explicitly marked legacy fields."""
    rows = []
    for image in obj.images.all():
        rows.append({
            'id': image.pk,
            'pm_id': obj.pm_id,
            'image_type': image.image_type,
            'image_url': _pm_image_url(request, image.image),
            'uploaded_at': image.uploaded_at,
            'uploaded_by': (
                UserSummarySerializer(image.uploaded_by).data
                if image.uploaded_by_id
                else None
            ),
            'is_legacy': False,
        })

    for image_type, field_name in (('before', 'before_image'), ('after', 'after_image')):
        field_file = getattr(obj, field_name, None)
        if field_file:
            rows.append({
                'id': f'legacy-{image_type}',
                'pm_id': obj.pm_id,
                'image_type': image_type,
                'image_url': _pm_image_url(request, field_file),
                'uploaded_at': None,
                'uploaded_by': None,
                'is_legacy': True,
            })
    return rows


def get_pm_image_counts(obj):
    images = list(obj.images.all())
    before_count = sum(image.image_type == 'before' for image in images) + int(bool(obj.before_image))
    after_count = sum(image.image_type == 'after' for image in images) + int(bool(obj.after_image))
    total_count = before_count + after_count
    return {
        'before': before_count,
        'after': after_count,
        'total': total_count,
        'remaining': max(0, PM_IMAGE_LIMIT - total_count),
        'limit': PM_IMAGE_LIMIT,
    }


def validate_and_optimize_legacy_pm_images(instance, data):
    """Keep legacy scalar uploads safe and inside the shared ten-image cap."""
    from uuid import uuid4
    from django.core.files.base import ContentFile
    from .job_image_processing import PMImageValidationError, validate_and_optimize_pm_image

    related_count = instance.images.count() if instance is not None else 0
    future_legacy_count = 0
    for field_name in ('before_image', 'after_image'):
        future_value = data.get(field_name, getattr(instance, field_name, None) if instance else None)
        future_legacy_count += int(bool(future_value))
    if related_count + future_legacy_count > PM_IMAGE_LIMIT:
        raise serializers.ValidationError({
            'images': 'A preventive maintenance record can contain a maximum of 10 images.'
        })

    existing_checksums = set(
        instance.images.values_list('checksum', flat=True)
        if instance is not None
        else []
    )
    request_checksums = set()
    for field_name in ('before_image', 'after_image'):
        image_file = data.get(field_name)
        if not image_file:
            continue
        try:
            payload, checksum = validate_and_optimize_pm_image(image_file)
        except PMImageValidationError as exc:
            raise serializers.ValidationError({field_name: str(exc)}) from exc
        if checksum in existing_checksums or checksum in request_checksums:
            raise serializers.ValidationError({field_name: 'Duplicate images are not allowed.'})
        request_checksums.add(checksum)
        data[field_name] = ContentFile(
            payload,
            name=f'pm-{field_name}-{uuid4().hex}.jpg',
        )
    return data


def user_can_operate_pm(serializer, obj):
    request = serializer.context.get('request')
    if request is None or not request.user.is_authenticated:
        return False
    if request.user.is_superuser:
        return True

    property_ids = {
        machine.property_id
        for machine in obj.machines.all()
        if machine.property_id
    }
    if obj.job_id and obj.job.property_id:
        property_ids.add(obj.job.property_id)
    if len(property_ids) != 1:
        return False

    if not hasattr(serializer, '_operable_property_ids'):
        serializer._operable_property_ids = set(
            get_operable_properties(request.user).values_list('pk', flat=True)
        )
    return property_ids.issubset(serializer._operable_property_ids)


class PreventiveMaintenanceDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for single item view, creation and updates"""
    pmtitle = serializers.SerializerMethodField()
    before_image_url = serializers.SerializerMethodField()
    after_image_url = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    days_remaining = serializers.SerializerMethodField()
    topics = TopicSerializer(many=True, read_only=True)
    topic_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    machines = MachineSerializer(many=True, read_only=True)
    machine_ids = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    property_id = serializers.SerializerMethodField()
    procedure_template_name = serializers.CharField(source='procedure_template.name', read_only=True)
    procedure_template_id = serializers.IntegerField(source='procedure_template.id', read_only=True)
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True
    )
    assigned_to_details = UserSummarySerializer(source='assigned_to', read_only=True)
    created_by_details = UserSummarySerializer(source='created_by', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    image_counts = serializers.SerializerMethodField()
    can_operate = serializers.SerializerMethodField()
    
    before_image = serializers.ImageField(
        required=False,
        allow_null=True,
        validators=[FileExtensionValidator(allowed_extensions=['jpg', 'jpeg', 'png'])]
    )
    after_image = serializers.ImageField(
        required=False,
        allow_null=True,
        validators=[FileExtensionValidator(allowed_extensions=['jpg', 'jpeg', 'png'])]
    )
    
    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'job', 'pmtitle', 'topics', 'topic_ids', 'scheduled_date', 'completed_date',
            'frequency', 'custom_days', 'next_due_date', 'status', 'priority',
            'estimated_duration', 'actual_duration', 'completion_notes', 'quality_score',
            'verified_by', 'verification_date', 'before_image', 'after_image',
            'before_image_url', 'after_image_url', 'notes', 'procedure', 'procedure_template',
            'procedure_template_id', 'procedure_template_name', 'created_by', 'updated_at',
            'is_overdue', 'days_remaining', 'machine_ids', 'machines', 'property_id',
            'assigned_to', 'assigned_to_details', 'created_by_details',
            'assigned_to_name', 'technician_name', 'created_by_name',
            'remarks', 'master_plan', 'occurrence_due_date', 'generated_at',
            'images', 'image_counts', 'can_operate'
        ]
        read_only_fields = [
            'pm_id', 'created_by', 'updated_at', 'next_due_date', 'procedure_template_id',
            'procedure_template_name', 'assigned_to_details', 'created_by_details',
            'assigned_to_name', 'technician_name', 'created_by_name'
        ]
        extra_kwargs = {
            'before_image': {'required': False},
            'after_image': {'required': False},
            'notes': {'required': False},
            'procedure': {'required': False},
            'procedure_template': {'required': False, 'allow_null': True},
            'pmtitle': {'required': False},
            'custom_days': {'required': False},
            'completed_date': {'required': False},
            'next_due_date': {'required': False},
        }
    
    def get_pmtitle(self, obj):
        return obj.pmtitle

    def get_assigned_to_name(self, obj):
        return get_user_display_name(obj.assigned_to)

    def get_technician_name(self, obj):
        return get_user_display_name(obj.assigned_to)

    def get_created_by_name(self, obj):
        return get_user_display_name(obj.created_by)

    def get_images(self, obj):
        return serialize_pm_images(obj, self.context.get('request'))

    def get_image_counts(self, obj):
        return get_pm_image_counts(obj)

    def get_can_operate(self, obj):
        return user_can_operate_pm(self, obj)
    
    def get_before_image_url(self, obj):
        """Get the full URL for the before image"""
        if obj.before_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.before_image.url)
            return obj.before_image.url
        return None
    
    def get_after_image_url(self, obj):
        """Get the full URL for the after image"""
        if obj.after_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.after_image.url)
            return obj.after_image.url
        return None
    
    def get_is_overdue(self, obj):
        """Check if maintenance is overdue"""
        if obj.status == 'cancelled':
            return False
        if not obj.completed_date and obj.scheduled_date < timezone.now():
            return True
        return False
    
    def get_days_remaining(self, obj):
        """Calculate days remaining until scheduled date or next due date"""
        now = timezone.now()
        
        if obj.completed_date:
            if obj.next_due_date:
                delta = obj.next_due_date - now
                return math.ceil(delta.total_seconds() / 86400)
            return None
        else:
            delta = obj.scheduled_date - now
            return math.ceil(delta.total_seconds() / 86400)
    
    def get_property_id(self, obj):
        return get_pm_property_external_id(obj)
    
    def to_representation(self, instance):
        """Override to add debug logging for machines"""
        machines = list(instance.machines.all())
        logger.info(
            "[PreventiveMaintenanceDetailSerializer] Serializing PM %s: %s machines, IDs: %s",
            instance.pm_id,
            len(machines),
            [machine.machine_id for machine in machines],
        )
        
        representation = super().to_representation(instance)
        
        return representation

    def create(self, validated_data):
        
        topic_ids = validated_data.pop('topic_ids', [])
        machine_ids = validated_data.pop('machine_ids', [])
        instance = super().create(validated_data)
        
        if topic_ids:
            instance.topics.set(topic_ids)
        if machine_ids:
            instance.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        return instance

    def update(self, instance, validated_data):
        
        topic_ids = validated_data.pop('topic_ids', None)
        machine_ids = validated_data.pop('machine_ids', None)
        procedure_template = validated_data.get('procedure_template')
        if procedure_template:
            template_frequency = getattr(procedure_template, 'frequency', None)
            template_custom_days = getattr(procedure_template, 'custom_days', None)
            if template_frequency:
                validated_data['frequency'] = template_frequency
            if validated_data.get('frequency') == 'custom' and template_custom_days and not validated_data.get('custom_days'):
                validated_data['custom_days'] = template_custom_days
        instance = super().update(instance, validated_data)
        
        if topic_ids is not None:
            instance.topics.set(topic_ids)
        if machine_ids is not None:
            instance.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        return instance

    def validate(self, data):
        """Custom validation for form data"""
        frequency = data.get('frequency')
        custom_days = data.get('custom_days')
        procedure_template = data.get('procedure_template')

        if procedure_template:
            template_frequency = getattr(procedure_template, 'frequency', None)
            template_custom_days = getattr(procedure_template, 'custom_days', None)
            if template_frequency:
                frequency = template_frequency
                data['frequency'] = template_frequency
            if frequency == 'custom' and not custom_days and template_custom_days:
                custom_days = template_custom_days
                data['custom_days'] = template_custom_days

        if frequency == 'custom' and not custom_days:
            raise serializers.ValidationError({
                'custom_days': 'Custom days value is required when frequency is set to Custom'
            })
        
        scheduled_date = data.get('scheduled_date')
        completed_date = data.get('completed_date')
        
        # Only validate completed_date if it's actually provided (not None/empty)
        # For new records, completed_date should be None/not provided
        if scheduled_date and completed_date is not None:
            # Handle both datetime objects and string dates
            if isinstance(completed_date, str) and completed_date.strip() == '':
                # Empty string - treat as not provided
                completed_date = None
            elif completed_date:
                # Allow completion within 15 days before or after scheduled date
                from datetime import timedelta
                from django.utils import timezone as tz
                
                # Ensure dates are timezone-aware for comparison
                if tz.is_naive(scheduled_date):
                    scheduled_date = tz.make_aware(scheduled_date)
                if isinstance(completed_date, str):
                    from django.utils.dateparse import parse_datetime
                    parsed_date = parse_datetime(completed_date)
                    if parsed_date:
                        if tz.is_naive(parsed_date):
                            completed_date = tz.make_aware(parsed_date)
                        else:
                            completed_date = parsed_date
                    else:
                        completed_date = None
                elif tz.is_naive(completed_date):
                    completed_date = tz.make_aware(completed_date)
                
                if completed_date:
                    date_diff = (completed_date - scheduled_date).days
                    # Allow completion within 15 days before or after scheduled date
                    if date_diff < -15 or date_diff > 15:
                        raise serializers.ValidationError({
                            'completed_date': f'Completion date must be within 15 days before or after the scheduled date ({scheduled_date.strftime("%Y-%m-%d")}). '
                                            f'Your completion date ({completed_date.strftime("%Y-%m-%d")}) is {abs(date_diff)} days away.'
                        })
        
        machine_ids = data.get('machine_ids', [])
        if machine_ids:
            machines = Machine.objects.filter(machine_id__in=machine_ids)
            if len(machines) != len(machine_ids):
                raise serializers.ValidationError("One or more machine_ids are invalid.")
            property_ids = set(machine.property.property_id for machine in machines)
            if len(property_ids) > 1:
                raise serializers.ValidationError("All machines must belong to the same property.")

        return validate_and_optimize_legacy_pm_images(self.instance, data)

class PreventiveMaintenanceCreateUpdateSerializer(serializers.ModelSerializer):
    topics = TopicSerializer(many=True, read_only=True)
    topic_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    machines = MachineSerializer(many=True, read_only=True)
    machine_ids = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    job_id = serializers.CharField(write_only=True, required=False, allow_blank=False)
    before_image_url = serializers.SerializerMethodField()
    after_image_url = serializers.SerializerMethodField()
    # Request scope only. PreventiveMaintenance ownership remains derived from
    # its canonical Machine/Job relations; this is not a model FK.
    property_id = serializers.CharField(write_only=True, required=False, allow_blank=False)
    procedure_template_name = serializers.CharField(source='procedure_template.name', read_only=True)
    procedure_template_id = serializers.IntegerField(source='procedure_template.id', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True
    )

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'pmtitle', 'topics', 'topic_ids', 'scheduled_date', 'completed_date',
            'frequency', 'custom_days', 'next_due_date', 'before_image', 'after_image',
            'before_image_url', 'after_image_url', 'notes', 'procedure', 'procedure_template',
            'procedure_template_id', 'procedure_template_name', 'machine_ids', 'machines',
            'property_id', 'assigned_to', 'assigned_to_name', 'technician_name', 'remarks',
            'status', 'job_id'
        ]
        read_only_fields = [
            'pm_id', 'next_due_date', 'procedure_template_id', 'procedure_template_name',
            'assigned_to_name', 'technician_name', 'status'
        ]
        extra_kwargs = {
            'before_image': {'required': False},
            'after_image': {'required': False},
            'notes': {'required': False},
            'procedure': {'required': False},
            'procedure_template': {'required': False, 'allow_null': True},
            'pmtitle': {'required': True},
            'custom_days': {'required': False},
            'completed_date': {'required': False},
            'next_due_date': {'required': False},
            'assigned_to': {'required': False, 'allow_null': True},
            'remarks': {'required': False},
        }

    def get_assigned_to_name(self, obj):
        return get_user_display_name(obj.assigned_to)

    def get_technician_name(self, obj):
        return get_user_display_name(obj.assigned_to)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['property_id'] = get_pm_property_external_id(instance)
        data['job_id'] = instance.job.job_id if instance.job_id else None
        return data
    
    def to_internal_value(self, data):
        
        # CRITICAL: Handle FormData/QueryDict for machine_ids and topic_ids
        # When FormData has multiple values for the same key, QueryDict.get() returns only the last value
        # We need to use getlist() to get all values and convert QueryDict to a regular dict
        if hasattr(data, 'getlist'):
            # This is a QueryDict (from FormData)
            machine_ids_raw = data.getlist('machine_ids')
            topic_ids_raw = data.getlist('topic_ids')
            
            # Convert QueryDict to a regular dict, preserving lists for array fields
            # Use items() but handle list fields specially
            data_dict = {}
            for key in data.keys():
                # For list fields, use getlist() to preserve all values
                if key in ['machine_ids', 'topic_ids']:
                    values = data.getlist(key)
                    if values:
                        data_dict[key] = values
                    else:
                        data_dict[key] = []
                else:
                    # For other fields, get the value (or list if multiple)
                    value = data.get(key)
                    if value is not None:
                        data_dict[key] = value
            
            # CRITICAL: Always set machine_ids and topic_ids from getlist() results
            # This ensures we preserve all values even if the dict conversion loses them
            data_dict['machine_ids'] = machine_ids_raw if machine_ids_raw else []
            data_dict['topic_ids'] = topic_ids_raw if topic_ids_raw else []
            
            logger.info(f"[to_internal_value] Converted QueryDict. machine_ids: {data_dict.get('machine_ids')}, topic_ids: {data_dict.get('topic_ids')}")
            
            # Replace data with the dict version
            data = data_dict

        # Multipart FormData commonly sends optional select/date fields as empty
        # strings. DRF's related/date fields do not treat "" as null, so normalize
        # those values before field validation. This keeps optional fields from
        # turning an otherwise valid PM create request into a 400 response.
        if isinstance(data, dict):
            data = data.copy()
            for nullable_field in (
                'procedure_template',
                'assigned_to',
                'completed_date',
                'custom_days',
                'remarks',
                'notes',
                'procedure',
            ):
                value = data.get(nullable_field)
                if isinstance(value, str) and value.strip() == '':
                    if nullable_field in ('procedure_template', 'assigned_to', 'custom_days'):
                        data[nullable_field] = None
                    else:
                        data.pop(nullable_field, None)
        
        # Remove empty image fields that are not files
        # Django ImageField expects either a file or the field to be absent
        if hasattr(data, 'get'):
            # Handle QueryDict or dict-like objects
            before_image = data.get('before_image')
            after_image = data.get('after_image')
            
            # If before_image/after_image exist but are not files (empty strings, etc.), remove them
            if before_image is not None and not hasattr(before_image, 'read'):
                # Not a file object - remove it
                if hasattr(data, '_mutable'):
                    # QueryDict - create a copy and remove the key
                    if not isinstance(data, dict):
                        data = data.copy()
                    data.pop('before_image', None)
                elif isinstance(data, dict):
                    # Regular dict - remove the key
                    data = {k: v for k, v in data.items() if k != 'before_image' or hasattr(v, 'read')}
            
            if after_image is not None and not hasattr(after_image, 'read'):
                # Not a file object - remove it
                if hasattr(data, '_mutable'):
                    # QueryDict - create a copy and remove the key
                    if not isinstance(data, dict):
                        data = data.copy()
                    data.pop('after_image', None)
                elif isinstance(data, dict):
                    # Regular dict - remove the key
                    data = {k: v for k, v in data.items() if k != 'after_image' or hasattr(v, 'read')}

        # A datetime-local value has no offset. Interpret that wall time in the
        # active property's tenant timezone before DRF applies the process-wide
        # default timezone. Offset-aware timestamps are left untouched.
        if isinstance(data, dict):
            property_obj = None
            property_ref = data.get('property_id')
            if property_ref:
                try:
                    property_obj = resolve_external_property_reference(property_ref)
                except ValidationError:
                    # Leave identity validation to validate(), which returns the
                    # canonical field error without leaking property data.
                    property_obj = None
            elif self.instance is not None:
                property_obj = get_pm_property(self.instance)

            if property_obj is not None:
                from django.utils.dateparse import parse_datetime

                for field_name in ('scheduled_date', 'completed_date'):
                    raw_value = data.get(field_name)
                    if not isinstance(raw_value, str) or not raw_value.strip():
                        continue
                    parsed_value = parse_datetime(raw_value.strip())
                    if parsed_value is not None and timezone.is_naive(parsed_value):
                        data[field_name] = timezone.make_aware(
                            parsed_value,
                            object_timezone(property_obj),
                        ).isoformat()
        
        result = super().to_internal_value(data)
        
        # CRITICAL: Ensure machine_ids is preserved after parent serializer processing
        if isinstance(result, dict):
            result_machine_ids = result.get('machine_ids')
            result_topic_ids = result.get('topic_ids')
            
            logger.info(f"[to_internal_value] Result machine_ids: {result_machine_ids} (type: {type(result_machine_ids)})")
            
            # If machine_ids was lost or is empty but we had it in input data, restore it
            if isinstance(data, dict) and 'machine_ids' in data:
                input_machine_ids = data.get('machine_ids', [])
                if input_machine_ids and (not result_machine_ids or (isinstance(result_machine_ids, list) and len(result_machine_ids) == 0)):
                    logger.warning(f"[to_internal_value] ⚠️ machine_ids lost! Restoring: {input_machine_ids}")
                    result['machine_ids'] = input_machine_ids if isinstance(input_machine_ids, list) else [input_machine_ids]
        else:
            logger.warning(f"[to_internal_value] Result is not a dict: {type(result)}")
        
        return result

    def get_before_image_url(self, obj):
        request = self.context.get('request')
        if obj.before_image and request:
            return request.build_absolute_uri(obj.before_image.url)
        return None

    def get_after_image_url(self, obj):
        request = self.context.get('request')
        if obj.after_image and request:
            return request.build_absolute_uri(obj.after_image.url)
        return None

    @transaction.atomic
    def create(self, validated_data):
        topic_ids = validated_data.pop('topic_ids', [])
        validated_data.pop('machine_ids', [])
        validated_data.pop('property_id', None)
        validated_data.pop('job_id', None)
        if self._validated_job is not None:
            validated_data['job'] = self._validated_job

        procedure_template = validated_data.get('procedure_template')
        frequency = validated_data.get('frequency')
        if not frequency:
            frequency = 'monthly'
            validated_data['frequency'] = frequency
        if procedure_template:
            template_frequency = getattr(procedure_template, 'frequency', None)
            if template_frequency:
                validated_data['frequency'] = template_frequency
            template_custom_days = getattr(procedure_template, 'custom_days', None)
            if validated_data['frequency'] == 'custom' and template_custom_days and not validated_data.get('custom_days'):
                validated_data['custom_days'] = template_custom_days

        instance = super().create(validated_data)
        self._set_m2m_relations(instance, topic_ids, self._validated_machines)
        return instance

    def _set_m2m_relations(self, instance, topic_ids, machines):
        instance.topics.set(topic_ids)
        instance.machines.set(machines)

    @transaction.atomic
    def update(self, instance, validated_data):
        topic_ids = validated_data.pop('topic_ids', None)
        machine_ids = validated_data.pop('machine_ids', None)
        validated_data.pop('property_id', None)
        job_id = validated_data.pop('job_id', None)
        if job_id is not None:
            validated_data['job'] = self._validated_job
        procedure_template = validated_data.get('procedure_template')
        if procedure_template:
            template_frequency = getattr(procedure_template, 'frequency', None)
            template_custom_days = getattr(procedure_template, 'custom_days', None)
            if template_frequency:
                validated_data['frequency'] = template_frequency
            if validated_data.get('frequency') == 'custom' and template_custom_days and not validated_data.get('custom_days'):
                validated_data['custom_days'] = template_custom_days
        instance = super().update(instance, validated_data)
        
        if topic_ids is not None:
            instance.topics.set(topic_ids)
        if machine_ids is not None:
            instance.machines.set(self._validated_machines)
        return instance

    def validate(self, data):
        creating = self.instance is None
        frequency = data.get('frequency')
        custom_days = data.get('custom_days')
        procedure_template = data.get('procedure_template')

        if procedure_template:
            template_frequency = getattr(procedure_template, 'frequency', None)
            template_custom_days = getattr(procedure_template, 'custom_days', None)
            if template_frequency:
                frequency = template_frequency
                data['frequency'] = template_frequency
            if frequency == 'custom' and not custom_days and template_custom_days:
                custom_days = template_custom_days
                data['custom_days'] = template_custom_days

        if frequency == 'custom' and not custom_days:
            raise serializers.ValidationError({
                'custom_days': 'Custom days value is required when frequency is set to Custom'
            })

        if creating and not str(data.get('pmtitle') or '').strip():
            raise serializers.ValidationError({'pmtitle': 'Maintenance title is required.'})

        scheduled_date = data.get('scheduled_date')
        completed_date = data.get('completed_date')

        if creating and completed_date is not None:
            raise serializers.ValidationError({
                'completed_date': 'A new maintenance record must start pending and cannot have a completion date.'
            })
        if creating and (data.get('before_image') or data.get('after_image')):
            raise serializers.ValidationError({
                'images': 'Create the maintenance record first, then upload evidence through the PM image endpoint.'
            })

        # Only validate completed_date if it's actually provided (not None/empty)
        # For new records, completed_date should be None/not provided
        if scheduled_date and completed_date is not None:
            # Handle both datetime objects and string dates
            if isinstance(completed_date, str) and completed_date.strip() == '':
                # Empty string - treat as not provided
                completed_date = None
            elif completed_date and completed_date < scheduled_date:
                raise serializers.ValidationError({
                    'completed_date': 'Completion date cannot be earlier than scheduled date'
                })

        machine_ids = data.get('machine_ids')
        if machine_ids is None and not creating:
            machine_ids = list(self.instance.machines.values_list('machine_id', flat=True))
        # Require at least one machine
        if not machine_ids or len(machine_ids) == 0:
            raise serializers.ValidationError({
                'machine_ids': 'At least one machine is required.'
            })
        
        # Validate machine_ids exist and belong to the same property
        machines = _validate_machine_ids_in_request_scope(self, machine_ids)
        machine_property = machines[0].property

        property_ref = data.get('property_id')
        if creating and not property_ref:
            raise serializers.ValidationError({'property_id': 'Active property is required.'})
        if property_ref:
            try:
                request_property = resolve_external_property_reference(property_ref)
            except ValidationError as exc:
                raise serializers.ValidationError(
                    getattr(exc, 'message_dict', {'property_id': ['Invalid property ID.']})
                )
        else:
            request_property = get_pm_property(self.instance)

        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if request_property is None:
            raise serializers.ValidationError({'property_id': 'Unable to determine the active property.'})
        if user is not None and not user.is_superuser:
            if not get_accessible_properties(user).filter(pk=request_property.pk).exists():
                raise serializers.ValidationError({'property_id': 'You do not have access to this property.'})
            if not get_operable_properties(user).filter(pk=request_property.pk).exists():
                raise serializers.ValidationError({'property_id': 'Your role cannot create maintenance for this property.'})
        if machine_property.pk != request_property.pk:
            raise serializers.ValidationError({
                'machine_ids': 'All machines must belong to the active property.'
            })

        job_ref = data.get('job_id')
        if job_ref:
            job = Job.objects.select_related('property').filter(job_id=job_ref).first()
            if job is None:
                raise serializers.ValidationError({'job_id': 'Invalid job_id.'})
            if job.property_id != request_property.pk:
                raise serializers.ValidationError({
                    'job_id': 'Job and machines must belong to the active property.'
                })
        elif not creating:
            job = self.instance.job
            if job is not None and job.property_id != request_property.pk:
                raise serializers.ValidationError({
                    'job_id': 'Existing Job and machines do not share one property.'
                })
        else:
            job = None

        topic_ids = data.get('topic_ids')
        if topic_ids is not None:
            if len(topic_ids) != len(set(topic_ids)):
                raise serializers.ValidationError({'topic_ids': 'Duplicate topic_ids are not allowed.'})
            if Topic.objects.filter(pk__in=topic_ids).count() != len(topic_ids):
                raise serializers.ValidationError({'topic_ids': 'One or more topic_ids are invalid.'})

        assigned_to = data.get('assigned_to')
        if assigned_to is not None and not assigned_to.is_superuser:
            if not get_operable_properties(assigned_to).filter(pk=request_property.pk).exists():
                raise serializers.ValidationError({
                    'assigned_to': 'Assignee must have an active operable membership for the selected property.'
                })

        self._validated_machines = machines
        self._validated_property = request_property
        self._validated_job = job

        return validate_and_optimize_legacy_pm_images(self.instance, data)

class PreventiveMaintenanceCompleteSerializer(serializers.ModelSerializer):
    machines = MachineSerializer(many=True, read_only=True)
    machine_ids = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    property_id = serializers.SerializerMethodField()

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'completed_date', 'after_image', 'notes', 'machine_ids', 'machines', 'property_id',
            'scheduled_date', 'next_due_date'  # Allow updating scheduled_date for next occurrence
        ]
        read_only_fields = ['next_due_date']  # Will be set by the view

    def get_property_id(self, obj):
        return get_pm_property_external_id(obj)

    def update(self, instance, validated_data):
        machine_ids = validated_data.pop('machine_ids', None)
        instance = super().update(instance, validated_data)
        if machine_ids is not None:
            instance.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        return instance

    def validate(self, data):
        scheduled_date = self.instance.scheduled_date if self.instance else None
        completed_date = data.get('completed_date')

        # If no completed_date provided, use current time
        if completed_date is None:
            from django.utils import timezone
            completed_date = timezone.now()
            data['completed_date'] = completed_date

        # Ensure completed_date is a datetime object (handle ISO string conversion)
        if isinstance(completed_date, str):
            from django.utils.dateparse import parse_datetime
            from django.utils import timezone
            parsed_date = parse_datetime(completed_date)
            if parsed_date:
                # Make timezone-aware if it's naive
                if timezone.is_naive(parsed_date):
                    completed_date = timezone.make_aware(parsed_date)
                else:
                    completed_date = parsed_date
                data['completed_date'] = completed_date
            else:
                # If parsing fails, use current time
                completed_date = timezone.now()
                data['completed_date'] = completed_date

        # Validate that completion date is within 15 days before or after scheduled date
        if scheduled_date and completed_date:
            from datetime import timedelta
            
            # Ensure scheduled_date is timezone-aware for comparison
            from django.utils import timezone as tz
            if tz.is_naive(scheduled_date):
                scheduled_date = tz.make_aware(scheduled_date)
            if tz.is_naive(completed_date):
                completed_date = tz.make_aware(completed_date)
            
            # Calculate the difference in days
            date_diff = (completed_date - scheduled_date).days
            
            # Allow completion within 15 days before or after scheduled date
            if date_diff < -15 or date_diff > 15:
                raise serializers.ValidationError({
                    'completed_date': f'Completion date must be within 15 days before or after the scheduled date ({scheduled_date.strftime("%Y-%m-%d")}). '
                                    f'Your completion date ({completed_date.strftime("%Y-%m-%d")}) is {abs(date_diff)} days away.'
                })

        machine_ids = data.get('machine_ids', [])
        if machine_ids:
            _validate_machine_ids_in_request_scope(self, machine_ids)

        return validate_and_optimize_legacy_pm_images(self.instance, data)

class PreventiveMaintenanceSerializer(serializers.ModelSerializer):
    topics = TopicSerializer(many=True, read_only=True)
    topic_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    machines = MachineSerializer(many=True, read_only=True)
    machine_ids = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    before_image_url = serializers.SerializerMethodField()
    after_image_url = serializers.SerializerMethodField()
    property_id = serializers.SerializerMethodField()
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True
    )
    assigned_to_details = UserSummarySerializer(source='assigned_to', read_only=True)
    created_by_details = UserSummarySerializer(source='created_by', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'pmtitle', 'topics', 'topic_ids', 'scheduled_date', 'completed_date',
            'property_id', 'machine_ids', 'machines', 'frequency', 'custom_days', 'next_due_date',
            'before_image', 'after_image', 'before_image_url', 'after_image_url', 'notes',
            'procedure', 'procedure_template', 'assigned_to', 'remarks',
            'master_plan', 'occurrence_due_date', 'generated_at',
            'assigned_to_details', 'created_by', 'created_by_details', 'updated_at',
            'assigned_to_name', 'technician_name', 'created_by_name'
        ]
        extra_kwargs = {
            'completed_date': {'required': False},
            'next_due_date': {'required': False},
            'custom_days': {'required': False},
            'notes': {'required': False},
            'pmtitle': {'required': False},
            'before_image': {'required': False},
            'after_image': {'required': False},
        }

    def get_property_id(self, obj):
        return get_pm_property_external_id(obj)

    def get_assigned_to_name(self, obj):
        return get_user_display_name(obj.assigned_to)

    def get_technician_name(self, obj):
        return get_user_display_name(obj.assigned_to)

    def get_created_by_name(self, obj):
        return get_user_display_name(obj.created_by)

    def get_before_image_url(self, obj):
        request = self.context.get('request')
        if obj.before_image and request:
            return request.build_absolute_uri(obj.before_image.url)
        return None

    def get_after_image_url(self, obj):
        request = self.context.get('request')
        if obj.after_image and request:
            return request.build_absolute_uri(obj.after_image.url)
        return None

    def create(self, validated_data):
        topic_ids = validated_data.pop('topic_ids', [])
        machine_ids = validated_data.pop('machine_ids', [])
        instance = super().create(validated_data)
        if topic_ids:
            instance.topics.set(topic_ids)
        if machine_ids:
            instance.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        return instance

    def update(self, instance, validated_data):
        topic_ids = validated_data.pop('topic_ids', None)
        machine_ids = validated_data.pop('machine_ids', None)
        instance = super().update(instance, validated_data)
        if topic_ids is not None:
            instance.topics.set(topic_ids)
        if machine_ids is not None:
            instance.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        return instance

    def validate(self, data):
        machine_ids = data.get('machine_ids', [])
        if machine_ids:
            _validate_machine_ids_in_request_scope(self, machine_ids)
        return data

class MaintenanceStepSerializer(serializers.Serializer):
    """Serializer for individual maintenance procedure steps"""
    step_number = serializers.IntegerField(read_only=True)
    title = serializers.CharField(max_length=200, help_text="Step title")
    description = serializers.CharField(help_text="Detailed step description")
    estimated_time = serializers.IntegerField(
        min_value=1, 
        help_text="Estimated time in minutes"
    )
    required_tools = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Tools required for this step"
    )
    safety_warnings = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Safety warnings for this step"
    )
    images = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Image URLs for this step"
    )
    notes = serializers.CharField(required=False, help_text="Additional notes")
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class MaintenanceProcedureSerializer(serializers.ModelSerializer):
    """Serializer for MaintenanceTask (MaintenanceProcedure) - Generic task templates"""
    # steps field removed from API - not needed in frontend
    machine_ids = serializers.SerializerMethodField()
    machines = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'name', 'group_id', 'category', 'description', 'frequency', 'estimated_duration', 
            'responsible_department', 'required_tools', 'safety_notes', 
            'difficulty_level', 'machine_ids', 'machines', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_ids', 'machines', 'created_at', 'updated_at']
    
    def get_machine_ids(self, obj):
        """Return machine identifiers explicitly linked to this template."""
        return list(obj.machines.values_list('machine_id', flat=True))

    def get_machines(self, obj):
        """Return lightweight machine details for filtering template concerns in clients."""
        return [
            {
                'machine_id': machine.machine_id,
                'name': machine.name,
                'group_id': machine.group_id,
                'property_id': machine.property_id,
            }
            for machine in obj.machines.all()
        ]

    def validate_steps(self, value):
        """Validate steps data"""
        if not value:
            return value
        
        for i, step in enumerate(value):
            if not step.get('title'):
                raise serializers.ValidationError(f"Step {i+1}: Title is required")
            if not step.get('description'):
                raise serializers.ValidationError(f"Step {i+1}: Description is required")
            if not step.get('estimated_time') or step['estimated_time'] <= 0:
                raise serializers.ValidationError(f"Step {i+1}: Valid estimated time is required")
        
        return value
    
    def create(self, validated_data):
        steps_data = validated_data.pop('steps', [])
        procedure = MaintenanceProcedure.objects.create(**validated_data)
        
        # Add steps if provided
        for step_data in steps_data:
            procedure.add_step(step_data)
        
        return procedure
    
    def update(self, instance, validated_data):
        steps_data = validated_data.pop('steps', None)
        
        # Update basic fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update steps if provided
        if steps_data is not None:
            # Clear existing steps and add new ones
            instance.steps = []
            for step_data in steps_data:
                instance.add_step(step_data)
        
        return instance


class MaintenanceProcedureListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing maintenance tasks - Generic templates"""
    # steps_count and total_estimated_time removed - steps not used
    schedule_count = serializers.SerializerMethodField()
    machine_ids = serializers.SerializerMethodField()
    machines = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'name', 'group_id', 'category', 'frequency', 'estimated_duration',
            'responsible_department', 'difficulty_level',
            'schedule_count', 'machine_ids', 'machines', 'created_at'
        ]
    
    def get_schedule_count(self, obj):
        """Get count of maintenance schedules for this task"""
        return obj.maintenance_schedules.count()

    def get_machine_ids(self, obj):
        """Return machine identifiers explicitly linked to this template."""
        return list(obj.machines.values_list('machine_id', flat=True))

    def get_machines(self, obj):
        """Return lightweight machine details for filtering template concerns in clients."""
        return [
            {
                'machine_id': machine.machine_id,
                'name': machine.name,
                'group_id': machine.group_id,
                'property_id': machine.property_id,
            }
            for machine in obj.machines.all()
        ]


class MaintenanceTaskImageSerializer(serializers.ModelSerializer):
    """Serializer for MaintenanceTaskImage model"""
    task_name = serializers.CharField(source='task.name', read_only=True)
    # equipment_name removed - tasks no longer have equipment field
    uploaded_by_username = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    image_url_full = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceTaskImage
        fields = [
            'id', 'task', 'task_name',
            'image_type', 'image_url', 'image_url_full',
            'jpeg_path', 'uploaded_at', 'uploaded_by', 'uploaded_by_username', 'uploaded_by_name'
        ]
        read_only_fields = ['id', 'jpeg_path', 'uploaded_at']

    def get_uploaded_by_name(self, obj):
        return get_user_display_name(obj.uploaded_by)

    def get_uploaded_by_username(self, obj):
        return get_user_public_username(obj.uploaded_by)
    
    def get_image_url_full(self, obj):
        """Get full URL for the image"""
        request = self.context.get('request')
        if obj.image_url and request:
            return request.build_absolute_uri(obj.image_url.url)
        return None


class MaintenanceTaskImageListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing task images"""
    task_name = serializers.CharField(source='task.name', read_only=True)
    image_url_full = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceTaskImage
        fields = [
            'id', 'task', 'task_name', 'image_type',
            'image_url_full', 'uploaded_at'
        ]
    
    def get_image_url_full(self, obj):
        """Get full URL for the image"""
        request = self.context.get('request')
        if obj.image_url and request:
            return request.build_absolute_uri(obj.image_url.url)
        return None

# Utility Consumption Serializers
# JSON numbers for dashboard clients (avoid string Decimals from COERCE_DECIMAL_TO_STRING).
_UTILITY_DECIMAL_KWARGS = dict(
    max_digits=10,
    decimal_places=2,
    coerce_to_string=False,
    allow_null=True,
    required=False,
)


class UtilityConsumptionSerializer(serializers.ModelSerializer):
    """Serializer for Utility Consumption records"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property = serializers.PrimaryKeyRelatedField(read_only=True)
    property_id = serializers.SlugRelatedField(
        source='property', slug_field='property_id', queryset=Property.objects.all()
    )
    month_display = serializers.CharField(source='get_month_display', read_only=True)
    created_by_username = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    totalkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    onpeakkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    offpeakkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    totalelectricity = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    electricity_cost_budget = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    water = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    nightsale = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)

    class Meta:
        model = UtilityConsumption
        fields = [
            'id',
            'property',
            'property_id',
            'property_name',
            'month',
            'month_display',
            'year',
            'totalkwh',
            'onpeakkwh',
            'offpeakkwh',
            'totalelectricity',
            'electricity_cost_budget',
            'water',
            'nightsale',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_username',
            'created_by_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return get_user_display_name(obj.created_by)

    def get_created_by_username(self, obj):
        return get_user_public_username(obj.created_by)
    
    def validate(self, data):
        """Validate that property is provided"""
        property_obj = data.get('property') or getattr(self.instance, 'property', None)
        if not property_obj:
            raise serializers.ValidationError({
                'property': 'Property must be provided.'
            })
        _validate_request_property_access(self, property_obj)
        
        # Validate month range
        month = data.get('month')
        if month and (month < 1 or month > 12):
            raise serializers.ValidationError({
                'month': 'Month must be between 1 and 12.'
            })

        for field in (
            'totalkwh', 'onpeakkwh', 'offpeakkwh', 'totalelectricity',
            'electricity_cost_budget', 'water', 'nightsale',
        ):
            value = data.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: 'Value cannot be negative.'})
        
        return data


class UtilityConsumptionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing utility consumption records"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    month_display = serializers.CharField(source='get_month_display', read_only=True)
    totalkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    onpeakkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    offpeakkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    totalelectricity = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    electricity_cost_budget = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    water = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    nightsale = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)

    class Meta:
        model = UtilityConsumption
        fields = [
            'id',
            'property_id',
            'property_name',
            'month',
            'month_display',
            'year',
            'totalkwh',
            'onpeakkwh',
            'offpeakkwh',
            'totalelectricity',
            'electricity_cost_budget',
            'water',
            'nightsale',
            'created_at',
            'updated_at'
        ]


class InventoryUsageSerializer(serializers.ModelSerializer):
    inventory_item_id = serializers.CharField(source='inventory.item_id', read_only=True)
    inventory_name = serializers.CharField(source='inventory.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    job_id = serializers.CharField(source='job.job_id', read_only=True)
    pm_id = serializers.CharField(source='preventive_maintenance.pm_id', read_only=True)
    consumed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = InventoryUsage
        fields = [
            'id', 'inventory', 'inventory_item_id', 'inventory_name', 'job', 'job_id',
            'preventive_maintenance', 'pm_id', 'property', 'property_id', 'property_name',
            'quantity', 'unit_cost', 'total_cost', 'source', 'notes',
            'consumed_by', 'consumed_by_name', 'consumed_at', 'created_at',
        ]
        read_only_fields = [
            'id', 'inventory_item_id', 'inventory_name', 'property_id', 'property_name',
            'job_id', 'pm_id', 'total_cost', 'consumed_by_name', 'created_at',
        ]

    def get_consumed_by_name(self, obj):
        return get_user_display_name(obj.consumed_by)


class InventorySerializer(serializers.ModelSerializer):
    """Serializer for Inventory items"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property = serializers.PrimaryKeyRelatedField(read_only=True)
    property_id = serializers.SlugRelatedField(
        source='property', slug_field='property_id', queryset=Property.objects.all()
    )
    room_name = serializers.CharField(source='room.name', read_only=True)
    room_id = serializers.CharField(source='room.room_id', read_only=True)
    created_by_username = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    image_url = serializers.SerializerMethodField()
    job_ids = serializers.SerializerMethodField()
    pm_ids = serializers.SerializerMethodField()
    jobs_detail = serializers.SerializerMethodField()
    preventive_maintenances_detail = serializers.SerializerMethodField()
    usage_records = InventoryUsageSerializer(many=True, read_only=True)
    
    class Meta:
        model = Inventory
        fields = [
            'id',
            'item_id',
            'name',
            'description',
            'category',
            'category_display',
            'quantity',
            'min_quantity',
            'max_quantity',
            'unit',
            'unit_price',
            'location',
            'supplier',
            'supplier_contact',
            'status',
            'status_display',
            'property',
            'property_id',
            'property_name',
            'room',
            'room_id',
            'room_name',
            'image',
            'image_url',
            'job_ids',
            'pm_ids',
            'jobs_detail',
            'preventive_maintenances_detail',
            'usage_records',
            'last_restocked',
            'expiry_date',
            'notes',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_username',
            'created_by_name'
        ]
        read_only_fields = ['id', 'item_id', 'created_at', 'updated_at']

    def get_created_by_username(self, obj):
        return get_user_public_username(obj.created_by)
    
    def get_image_url(self, obj):
        """Get the image URL"""
        if obj.image and hasattr(obj.image, 'url'):
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None
    
    def get_job_ids(self, obj):
        """Return all related job IDs"""
        return list(obj.jobs.values_list('job_id', flat=True))
    
    def get_pm_ids(self, obj):
        """Return all related preventive maintenance IDs"""
        return list(obj.preventive_maintenances.values_list('pm_id', flat=True))
    
    def get_jobs_detail(self, obj):
        """Return detailed information about related jobs"""
        jobs = obj.jobs.all()
        return [
            {
                'id': job.id,
                'job_id': job.job_id,
                'description': job.description,
                'status': job.status,
                'user_id': job.user_id,
                'technician_name': get_user_display_name(job.user),
                'updated_at': job.updated_at,
            }
            for job in jobs
        ]
    
    def get_preventive_maintenances_detail(self, obj):
        """Return detailed information about related preventive maintenance tasks"""
        pms = obj.preventive_maintenances.all()
        return [
            {
                'id': pm.id,
                'pm_id': pm.pm_id,
                'title': pm.pmtitle,
                'status': pm.status,
                'assigned_to_id': pm.assigned_to_id,
                'assigned_to_name': get_user_display_name(pm.assigned_to),
                'created_by_id': pm.created_by_id,
                'created_by_name': get_user_display_name(pm.created_by),
                'updated_at': pm.updated_at,
            }
            for pm in pms
        ]
    
    def validate(self, data):
        """Validate inventory data"""
        property_obj = data.get('property') or getattr(self.instance, 'property', None)
        if property_obj is None:
            raise serializers.ValidationError({'property': 'Property must be provided.'})
        room = data.get('room') if 'room' in data else getattr(self.instance, 'room', None)
        _validate_request_property_access(self, property_obj)
        _validate_room_belongs_to_property(room, property_obj)
        quantity = data.get('quantity', self.instance.quantity if self.instance else 0)
        min_quantity = data.get('min_quantity', self.instance.min_quantity if self.instance else 0)
        
        if quantity < 0:
            raise serializers.ValidationError({'quantity': 'Quantity cannot be negative'})
        
        if min_quantity < 0:
            raise serializers.ValidationError({'min_quantity': 'Minimum quantity cannot be negative'})
        
        max_quantity = data.get('max_quantity', self.instance.max_quantity if self.instance else None)
        if max_quantity is not None and max_quantity < min_quantity:
            raise serializers.ValidationError({
                'max_quantity': 'Maximum quantity must be greater than or equal to minimum quantity'
            })
        
        return data

    def get_created_by_name(self, obj):
        return get_user_display_name(obj.created_by)


class InventoryListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing inventory items"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    job_id = serializers.SerializerMethodField()
    job_description = serializers.SerializerMethodField()
    pm_id = serializers.SerializerMethodField()
    pm_title = serializers.SerializerMethodField()
    job_ids = serializers.SerializerMethodField()
    pm_ids = serializers.SerializerMethodField()
    jobs_detail = serializers.SerializerMethodField()
    preventive_maintenances_detail = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    last_job_by_user = serializers.SerializerMethodField()
    last_pm_by_user = serializers.SerializerMethodField()
    
    class Meta:
        model = Inventory
        fields = [
            'id',
            'item_id',
            'name',
            'category',
            'category_display',
            'quantity',
            'min_quantity',
            'unit',
            'status',
            'status_display',
            'property_id',
            'property_name',
            'room_name',
            'location',
            'job_id',
            'job_description',
            'pm_id',
            'pm_title',
            'job_ids',
            'pm_ids',
            'jobs_detail',
            'preventive_maintenances_detail',
            'image_url',
            'last_job_by_user',
            'last_pm_by_user',
            'created_at',
            'updated_at'
        ]
    
    def get_image_url(self, obj):
        """Get the image URL"""
        if obj.image and hasattr(obj.image, 'url'):
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None
    
    def _get_jobs(self, obj):
        if not hasattr(obj, '_inventory_list_jobs'):
            obj._inventory_list_jobs = list(obj.jobs.all())
        return obj._inventory_list_jobs

    def _get_pms(self, obj):
        if not hasattr(obj, '_inventory_list_pms'):
            obj._inventory_list_pms = list(obj.preventive_maintenances.all())
        return obj._inventory_list_pms

    def _get_primary_job(self, obj):
        return self._get_jobs(obj)[0] if self._get_jobs(obj) else None
    
    def _get_primary_pm(self, obj):
        return self._get_pms(obj)[0] if self._get_pms(obj) else None
    
    def get_job_id(self, obj):
        job = self._get_primary_job(obj)
        return job.job_id if job else None
    
    def get_job_description(self, obj):
        job = self._get_primary_job(obj)
        return job.description if job else None
    
    def get_pm_id(self, obj):
        pm = self._get_primary_pm(obj)
        return pm.pm_id if pm else None
    
    def get_pm_title(self, obj):
        pm = self._get_primary_pm(obj)
        return pm.pmtitle if pm else None
    
    def get_job_ids(self, obj):
        return [job.job_id for job in self._get_jobs(obj)]
    
    def get_pm_ids(self, obj):
        return [pm.pm_id for pm in self._get_pms(obj)]
    
    def get_jobs_detail(self, obj):
        jobs = self._get_jobs(obj)[:5]
        return [
            {
                'job_id': job.job_id,
                'description': job.description,
                'status': job.status,
            }
            for job in jobs
        ]
    
    def get_preventive_maintenances_detail(self, obj):
        pms = self._get_pms(obj)[:5]
        return [
            {
                'pm_id': pm.pm_id,
                'title': pm.pmtitle,
                'status': pm.status,
            }
            for pm in pms
        ]
    
    def get_last_job_by_user(self, obj):
        """Get the last job that used this inventory item by the current user"""
        request = self.context.get('request')
        if not request or not request.user:
            return None
        
        user = request.user
        user_job = max(
            (job for job in self._get_jobs(obj) if job.user_id == user.id),
            key=lambda job: job.updated_at,
            default=None,
        )
        if user_job:
            return {
                'job_id': user_job.job_id,
                'description': user_job.description[:50] + '...' if len(user_job.description) > 50 else user_job.description,
                'full_description': user_job.description
            }
        
        return None
    
    def get_last_pm_by_user(self, obj):
        """Get the last PM that used this inventory item by the current user"""
        request = self.context.get('request')
        if not request or not request.user:
            return None
        
        user = request.user
        pm = max(
            (
                pm for pm in self._get_pms(obj)
                if pm.assigned_to_id == user.id or pm.created_by_id == user.id
            ),
            key=lambda item: item.updated_at,
            default=None,
        )
        if pm:
            return {
                'pm_id': pm.pm_id,
                'title': pm.pmtitle[:50] + '...' if len(pm.pmtitle) > 50 else pm.pmtitle,
                'full_title': pm.pmtitle
            }
        
        return None
