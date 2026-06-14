from rest_framework import serializers
from .models import (
    Room, Topic, JobImage, Job, Property, UserProfile, Session,
    PreventiveMaintenance, Machine, MaintenanceProcedure, MaintenanceTaskImage,
    UtilityConsumption, Inventory, RosterLeave, Area, JobComment, Tenant,
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
from django.conf import settings
from datetime import timedelta
from pathlib import Path
import math


RAW_AUTH_PREFIXES = ('google-oauth2_', 'auth0_', 'auth0|')


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


# User serializer for basic user data
class UserSerializer(serializers.HyperlinkedModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['url', 'username', 'email', 'display_name', 'is_staff']

    def get_display_name(self, obj):
        return get_user_display_name(obj)

class UserSummarySerializer(serializers.ModelSerializer):
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
    plan_id = serializers.PrimaryKeyRelatedField(
        queryset=SubscriptionPlan.objects.filter(is_active=True),
        source='plan',
        write_only=True,
        required=False,
    )

    class Meta:
        model = TenantSubscription
        fields = [
            'id', 'tenant', 'plan', 'plan_id', 'status', 'current_period_start',
            'current_period_end', 'trial_ends_at', 'external_customer_id',
            'external_subscription_id', 'cancel_at_period_end', 'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


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

# Room serializer defined first to avoid circular import issues
class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ['room_id', 'name', 'room_type', 'is_active', 'created_at', 'properties']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['room_id'] = data.get('room_id') or getattr(instance, 'room_id', None)
        data['name'] = data.get('name') or 'Unnamed room'
        data['room_type'] = data.get('room_type') or 'Room'
        data['is_active'] = bool(data.get('is_active'))
        data['properties'] = data.get('properties') if isinstance(data.get('properties'), list) else []
        return data


class RoomSummarySerializer(serializers.ModelSerializer):
    """
    Lightweight room serializer for nested usage (e.g., inside jobs/properties).
    Returns only essential fields and a simplified list of property_ids to
    avoid deep nesting and large payloads.
    """
    properties = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ['room_id', 'name', 'room_type', 'properties']

    def get_properties(self, obj):
        # Return property_id strings to keep payload small. Missing/removed
        # property relations should not break nested dashboard payloads.
        try:
            return list(obj.properties.values_list('property_id', flat=True))
        except Exception:
            return []

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['room_id'] = data.get('room_id') or getattr(instance, 'room_id', None)
        data['name'] = data.get('name') or 'Unnamed room'
        data['room_type'] = data.get('room_type') or 'Room'
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

    class Meta:
        model = Property
        fields = [
            'id',
            'tenant',
            'tenant_name',
            'property_id',
            'name',
            'description',
            'users',
            'created_at',
            'rooms',
            'is_preventivemaintenance',
        ]
        read_only_fields = ['created_at', 'is_preventivemaintenance']
        extra_kwargs = {
            'users': {'required': False},
        }
    
    def get_rooms(self, obj):
        """Get rooms for this property.
        To reduce payload size on list views, rooms are only included when
        context['include_rooms'] is True. Otherwise, return an empty list.
        """
        include_rooms = self.context.get('include_rooms', False)
        if not include_rooms:
            return []
        rooms = obj.rooms.all()
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
            rooms__properties=obj,
            is_preventivemaintenance=True
        ).exists()
        
        return has_pm_jobs

# User profile serializer
class UserProfileSerializer(serializers.ModelSerializer):
    properties = PropertySerializer(many=True, read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    display_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='user.date_joined', read_only=True)
    uses_roster = serializers.BooleanField(source='user.uses_roster', read_only=True)
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
            'uses_roster',
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

        request = self.context.get('request')
        return _build_media_absolute_uri(request, jp)

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
    property_id = serializers.PrimaryKeyRelatedField(
        source='property',
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
        return obj.jobs.count()


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
    author_username = serializers.CharField(source='author.username', read_only=True)
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

    def validate_comment(self, value):
        text = (value or '').strip()
        if not text:
            raise serializers.ValidationError("Comment cannot be empty.")
        return text


class RosterLeaveSerializer(serializers.ModelSerializer):
    type = serializers.ChoiceField(source='leave_type', choices=RosterLeave.LEAVE_TYPE_CHOICES)

    class Meta:
        model = RosterLeave
        fields = ['id', 'staff_id', 'week', 'day', 'type', 'note', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

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
    user_username = serializers.CharField(source='user.username', read_only=True)
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
    image_urls = serializers.SerializerMethodField()
    area = AreaSummarySerializer(read_only=True)
    area_id = serializers.PrimaryKeyRelatedField(
        source='area', queryset=Area.objects.all(),
        required=False, allow_null=True,
    )
    area_name = serializers.CharField(source='area.name', read_only=True)
    comments_count = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            'id', 'job_id', 'user', 'user_username', 'user_first_name', 'user_last_name', 'user_email',
            'user_name', 'technician_name', 'created_by_name', 'updated_by_name',
            'updated_by', 'description', 'status', 'priority',
            'remarks', 'created_at', 'updated_at', 'completed_at', 'is_defective',
            'rooms', 'topics', 'images', 'profile_image', 'room_type', 'name',
            'topic_data', 'room_id', 'image_urls', 'is_preventivemaintenance',
            'area', 'area_id', 'area_name', 'comments_count',
        ]
        read_only_fields = [
            'id', 'job_id', 'user', 'user_username', 'user_first_name', 'user_last_name',
            'user_email', 'user_name', 'technician_name', 'created_by_name',
            'updated_by_name', 'images', 'topics', 'area', 'area_name', 'comments_count',
        ]

    def get_comments_count(self, obj):
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
        area = data.get('area')
        if room_id and area is not None:
            try:
                room = Room.objects.prefetch_related('properties').get(room_id=room_id)
            except Room.DoesNotExist:
                raise serializers.ValidationError({'room_id': 'Invalid room ID'})

            if not room.properties.filter(id=area.property_id).exists():
                raise serializers.ValidationError({
                    'area_id': 'Selected area must belong to the same property as the selected room.'
                })
        
        return data

    def get_user(self, obj):
        """Return user information in a structured format"""
        user = getattr(obj, 'user', None)
        if user:
            return {
                'id': getattr(user, 'id', None),
                'username': getattr(user, 'username', '') or '',
                'first_name': getattr(user, 'first_name', '') or '',
                'last_name': getattr(user, 'last_name', '') or '',
                'email': getattr(user, 'email', '') or '',
                'full_name': user.get_full_name().strip() or get_user_display_name(user),
                'display_name': get_user_display_name(user),
            }
        return None

    def get_user_name(self, obj):
        return get_user_display_name(getattr(obj, 'user', None)) or 'Unknown user'

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

        properties_qs = userprofile.properties.all().values('property_id', 'name')
        properties = list(properties_qs)

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
                candidates = [getattr(image, 'jpeg_path', None)]
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

        topic_data = validated_data.pop('topic_data', None)
        room_id = validated_data.pop('room_id', None)
        area = validated_data.get('area')

        if not room_id and not area:
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
                    user=request.user
                )
                if room:
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

    def to_representation(self, instance):
        data = super().to_representation(instance)
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

    class Meta:
        model = User
        fields = ('username', 'password', 'email')

    def validate(self, attrs):
        username = attrs.get('username', '')
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError({"username": "A user with that username already exists."})

        email = attrs.get('email', '')
        if User.objects.filter(email=email).exists():
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
    task_count = serializers.SerializerMethodField()
    next_maintenance_date = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    lifecycle_state = serializers.CharField(read_only=True)
    is_under_warranty = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'status', 'location', 'property_name', 
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
            'procedure_template_id', 'procedure_template_name', 'assigned_to_details',
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
        return MachineSerializer(obj.machines.all(), many=True).data if obj.machines.exists() else []

    def get_property_id(self, obj):
        # Prefer properties via job -> rooms
        if obj.job and obj.job.rooms.exists():
            properties = Property.objects.filter(rooms__job=obj.job).distinct()
            return [prop.property_id for prop in properties]

        # Fallback: infer from machines' property
        if obj.machines.exists():
            machine_props = Property.objects.filter(machines__in=obj.machines.all()).distinct()
            return [prop.property_id for prop in machine_props]

        return []

    def get_status(self, obj):
        if obj.completed_date:
            return 'completed'
        if obj.scheduled_date and obj.scheduled_date < timezone.now():
            return 'overdue'
        return 'pending'

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
    class Meta:
        model = Machine
        fields = [
            'name', 'brand', 'category', 'serial_number', 'description', 'location', 'property',
            'status', 'group_id', 'installation_date', 'last_maintenance_date',
            'purchase_date', 'purchase_cost', 'warranty_start_date', 'warranty_end_date',
            'expected_replacement_date', 'replacement_cost_estimate', 'supplier',
            'supplier_contact', 'asset_tag', 'lifecycle_notes', 'image'
        ]
    
    def validate(self, data):
        """Custom validation for machine creation"""
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
    class Meta:
        model = Machine
        fields = [
            'name', 'brand', 'category', 'serial_number', 'description', 'location', 'property',
            'status', 'group_id', 'installation_date', 'last_maintenance_date',
            'purchase_date', 'purchase_cost', 'warranty_start_date', 'warranty_end_date',
            'expected_replacement_date', 'replacement_cost_estimate', 'supplier',
            'supplier_contact', 'asset_tag', 'lifecycle_notes', 'image'
        ]
    
    def validate(self, data):
        """Custom validation for machine updates"""
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
        
        if pm_ids:
            pm_instances = PreventiveMaintenance.objects.filter(pm_id__in=pm_ids)
            
            if pm_instances.count() < len(pm_ids):
                missing_ids = set(pm_ids) - set(pm_instances.values_list('pm_id', flat=True))
                raise serializers.ValidationError({
                    'preventive_maintenance_ids': f'Invalid maintenance IDs: {", ".join(missing_ids)}'
                })
            
            instance.preventive_maintenances.set(pm_instances)
            
            latest_completed = pm_instances.filter(
                completed_date__isnull=False
            ).order_by('-completed_date').first()
            
            if latest_completed:
                instance.last_maintenance_date = latest_completed.completed_date
                instance.save(update_fields=['last_maintenance_date', 'updated_at'])
        return instance

# ----- Preventive Maintenance Serializers -----


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
            'frequency', 'custom_days', 'next_due_date', 'before_image', 'after_image',
            'before_image_url', 'after_image_url', 'notes', 'procedure', 'procedure_template',
            'procedure_template_id', 'procedure_template_name', 'created_by', 'updated_at',
            'is_overdue', 'days_remaining', 'machine_ids', 'machines', 'property_id',
            'assigned_to', 'assigned_to_details', 'created_by_details',
            'assigned_to_name', 'technician_name', 'created_by_name'
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
        machines = obj.machines.all()
        logger.debug(f"[PreventiveMaintenanceDetailSerializer] get_property_id for PM {obj.pm_id}: {machines.count()} machines")
        if machines:
            # All machines must belong to the same property, so return the first one
            return machines.first().property.property_id
        return None
    
    def to_representation(self, instance):
        """Override to add debug logging for machines"""
        # Debug: Log machine information BEFORE serialization
        machines_queryset = instance.machines.all()
        machine_count = machines_queryset.count()
        machine_ids = list(machines_queryset.values_list('machine_id', flat=True))
        
        # Use print for immediate visibility in docker logs
        
        logger.info(f"[PreventiveMaintenanceDetailSerializer] Serializing PM {instance.pm_id}: {machine_count} machines, IDs: {machine_ids}")
        
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
        
        return data

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
    before_image_url = serializers.SerializerMethodField()
    after_image_url = serializers.SerializerMethodField()
    property_id = serializers.SerializerMethodField()
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
            'property_id', 'assigned_to', 'assigned_to_name', 'technician_name', 'remarks'
        ]
        read_only_fields = [
            'pm_id', 'next_due_date', 'procedure_template_id', 'procedure_template_name',
            'assigned_to_name', 'technician_name'
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
            'assigned_to': {'required': False, 'allow_null': True},
            'remarks': {'required': False},
        }

    def get_assigned_to_name(self, obj):
        return get_user_display_name(obj.assigned_to)

    def get_technician_name(self, obj):
        return get_user_display_name(obj.assigned_to)
    
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

    def get_property_id(self, obj):
        machines = obj.machines.all()
        if machines:
            # All machines must belong to the same property, so return the first one
            return machines.first().property.property_id
        return None

    def create(self, validated_data):
        
        # CRITICAL: Pop topic_ids and machine_ids ONCE at the beginning
        # These are ManyToMany relationships that need to be set after instance creation
        topic_ids = validated_data.pop('topic_ids', [])
        machine_ids = validated_data.pop('machine_ids', [])
        
        # Ensure machine_ids is a list (handle case where it might be a string or single value)
        if machine_ids and not isinstance(machine_ids, list):
            machine_ids = [machine_ids] if machine_ids else []
        # Filter out empty strings and None values
        if isinstance(machine_ids, list):
            machine_ids = [str(mid).strip() for mid in machine_ids if mid and str(mid).strip()]
        else:
            machine_ids = []
        
        # Ensure topic_ids is a list
        if topic_ids and not isinstance(topic_ids, list):
            topic_ids = [topic_ids] if topic_ids else []
        # Filter out None values and ensure integers
        if isinstance(topic_ids, list):
            topic_ids = [int(tid) for tid in topic_ids if tid is not None]
        
        # Auto-calculate scheduled_date based on frequency if procedure_template is provided
        procedure_template = validated_data.get('procedure_template')
        scheduled_date = validated_data.get('scheduled_date')
        frequency = validated_data.get('frequency')
        
        # Ensure frequency is set (default to 'monthly' if not provided)
        if not frequency:
            frequency = 'monthly'
            validated_data['frequency'] = frequency
        
        # If procedure_template is provided, use its frequency
        if procedure_template:
            template_frequency = getattr(procedure_template, 'frequency', None)
            if template_frequency:
                # Use template frequency (prefer template frequency over form frequency)
                frequency = template_frequency
                validated_data['frequency'] = frequency
            
            # Calculate next schedule based on frequency if scheduled_date is not provided or invalid
            # Check if scheduled_date is None, empty string, or not a valid datetime
            needs_scheduled_date = False
            if not scheduled_date:
                needs_scheduled_date = True
            elif isinstance(scheduled_date, str) and not scheduled_date.strip():
                needs_scheduled_date = True
            
            if needs_scheduled_date and frequency:
                now = timezone.now()
                if frequency == 'daily':
                    next_schedule = now + timedelta(days=1)
                elif frequency == 'weekly':
                    next_schedule = now + timedelta(weeks=1)
                elif frequency == 'monthly':
                    # Add one month
                    month = now.month + 1
                    year = now.year
                    if month > 12:
                        month = 1
                        year += 1
                    # Handle different month lengths
                    day = min(now.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 
                                         31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1])
                    next_schedule = now.replace(year=year, month=month, day=day)
                elif frequency == 'quarterly':
                    # Add three months
                    month = now.month + 3
                    year = now.year
                    if month > 12:
                        month -= 12
                        year += 1
                    day = min(now.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 
                                         31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1])
                    next_schedule = now.replace(year=year, month=month, day=day)
                elif frequency == 'semi_annual':
                    # Add six months
                    month = now.month + 6
                    year = now.year
                    if month > 12:
                        month -= 12
                        year += 1
                    day = min(now.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 
                                         31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1])
                    next_schedule = now.replace(year=year, month=month, day=day)
                elif frequency == 'annual':
                    # Add one year
                    next_schedule = now.replace(year=now.year + 1)
                elif frequency == 'custom' and procedure_template.custom_days:
                    next_schedule = now + timedelta(days=procedure_template.custom_days)
                else:
                    # Default to monthly if frequency is not recognized
                    month = now.month + 1
                    year = now.year
                    if month > 12:
                        month = 1
                        year += 1
                    day = min(now.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 
                                         31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1])
                    next_schedule = now.replace(year=year, month=month, day=day)
                
                validated_data['scheduled_date'] = next_schedule
        
        instance = super().create(validated_data)
        
        # Set ManyToMany relationships after instance creation
        
        if topic_ids:
            instance.topics.set(topic_ids)

        has_machines = machine_ids and len(machine_ids) > 0 if isinstance(machine_ids, list) else bool(machine_ids)
        
        if has_machines:
            logger.info(f"[PreventiveMaintenanceCreateUpdateSerializer] Setting {len(machine_ids)} machines: {machine_ids}")
            
            # Query machines by machine_id
            machines = Machine.objects.filter(machine_id__in=machine_ids)
            found_count = machines.count()
            found_ids = list(machines.values_list('machine_id', flat=True))
            
            logger.info(f"[PreventiveMaintenanceCreateUpdateSerializer] Found {found_count} machines: {found_ids}")
            
            if found_count == 0:
                logger.warning(f"[PreventiveMaintenanceCreateUpdateSerializer] ⚠️ No machines found for IDs: {machine_ids}")
            
            # Set the machines relationship
            instance.machines.set(machines)
            
            # Refresh instance to ensure machines are loaded
            instance.refresh_from_db()
            
            # Verify machines were set
            final_machine_count = instance.machines.count()
            final_machine_ids = list(instance.machines.values_list('machine_id', flat=True))
            
            logger.info(f"[PreventiveMaintenanceCreateUpdateSerializer] ✅ Machines set. Count: {final_machine_count}, IDs: {final_machine_ids}")
            
            if final_machine_count == 0 and found_count > 0:
                logger.error(f"[PreventiveMaintenanceCreateUpdateSerializer] ⚠️ ERROR: Machines found but not set!")

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

    def validate_assigned_to(self, value):
        """Custom validation for assigned_to field"""
        return value

    def validate(self, data):
        frequency = data.get('frequency')
        custom_days = data.get('custom_days')

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
            elif completed_date and completed_date < scheduled_date:
                raise serializers.ValidationError({
                    'completed_date': 'Completion date cannot be earlier than scheduled date'
                })

        machine_ids = data.get('machine_ids', [])
        # Require at least one machine
        if not machine_ids or len(machine_ids) == 0:
            raise serializers.ValidationError({
                'machine_ids': 'At least one machine is required.'
            })
        
        # Validate machine_ids exist and belong to the same property
        machines = Machine.objects.filter(machine_id__in=machine_ids)
        if len(machines) != len(machine_ids):
            raise serializers.ValidationError({
                'machine_ids': 'One or more machine_ids are invalid.'
            })
        property_ids = set(machine.property.property_id for machine in machines)
        if len(property_ids) > 1:
            raise serializers.ValidationError({
                'machine_ids': 'All machines must belong to the same property.'
            })
        
        return data

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
        machines = obj.machines.all()
        if machines:
            # All machines must belong to the same property, so return the first one
            return machines.first().property.property_id
        return None

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
            machines = Machine.objects.filter(machine_id__in=machine_ids)
            if len(machines) != len(machine_ids):
                raise serializers.ValidationError("One or more machine_ids are invalid.")
            property_ids = set(machine.property.property_id for machine in machines)
            if len(property_ids) > 1:
                raise serializers.ValidationError("All machines must belong to the same property.")

        return data

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
        machines = obj.machines.all()
        if machines:
            # All machines must belong to the same property, so return the first one
            return machines.first().property.property_id
        return None

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
            machines = Machine.objects.filter(machine_id__in=machine_ids)
            if len(machines) != len(machine_ids):
                raise serializers.ValidationError("One or more machine_ids are invalid.")
            property_ids = set(machine.property.property_id for machine in machines)
            if len(property_ids) > 1:
                raise serializers.ValidationError("All machines must belong to the same property.")
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
    # equipment field removed - tasks are now generic templates
    
    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'name', 'group_id', 'category', 'description', 'frequency', 'estimated_duration', 
            'responsible_department', 'required_tools', 'safety_notes', 
            'difficulty_level', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
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
    # equipment field removed - tasks are now generic templates
    schedule_count = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'name', 'group_id', 'category', 'frequency', 'estimated_duration',
            'responsible_department', 'difficulty_level',
            'schedule_count', 'created_at'
        ]
    
    def get_schedule_count(self, obj):
        """Get count of maintenance schedules for this task"""
        return obj.maintenance_schedules.count()


class MaintenanceTaskImageSerializer(serializers.ModelSerializer):
    """Serializer for MaintenanceTaskImage model"""
    task_name = serializers.CharField(source='task.name', read_only=True)
    # equipment_name removed - tasks no longer have equipment field
    uploaded_by_username = serializers.CharField(source='uploaded_by.username', read_only=True)
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
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    month_display = serializers.CharField(source='get_month_display', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
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
    
    def validate(self, data):
        """Validate that property is provided"""
        if not data.get('property'):
            raise serializers.ValidationError({
                'property': 'Property must be provided.'
            })
        
        # Validate month range
        month = data.get('month')
        if month and (month < 1 or month > 12):
            raise serializers.ValidationError({
                'month': 'Month must be between 1 and 12.'
            })
        
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
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    room_id = serializers.CharField(source='room.room_id', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
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
    
    def _get_primary_job(self, obj):
        return obj.jobs.all().first()
    
    def _get_primary_pm(self, obj):
        return obj.preventive_maintenances.all().first()
    
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
        return list(obj.jobs.values_list('job_id', flat=True))
    
    def get_pm_ids(self, obj):
        return list(obj.preventive_maintenances.values_list('pm_id', flat=True))
    
    def get_jobs_detail(self, obj):
        jobs = obj.jobs.all()[:5]
        return [
            {
                'job_id': job.job_id,
                'description': job.description,
                'status': job.status,
            }
            for job in jobs
        ]
    
    def get_preventive_maintenances_detail(self, obj):
        pms = obj.preventive_maintenances.all()[:5]
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
        user_job = obj.jobs.filter(user=user).order_by('-updated_at').first()
        if user_job:
            return {
                'job_id': user_job.job_id,
                'description': user_job.description[:50] + '...' if len(user_job.description) > 50 else user_job.description,
                'full_description': user_job.description
            }
        
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
                return {
                    'job_id': related_job.job_id,
                    'description': related_job.description[:50] + '...' if len(related_job.description) > 50 else related_job.description,
                    'full_description': related_job.description
                }
        
        return None
    
    def get_last_pm_by_user(self, obj):
        """Get the last PM that used this inventory item by the current user"""
        request = self.context.get('request')
        if not request or not request.user:
            return None
        
        user = request.user
        pm = obj.preventive_maintenances.filter(
            Q(assigned_to=user) | Q(created_by=user)
        ).order_by('-updated_at').first()
        if pm:
            return {
                'pm_id': pm.pm_id,
                'title': pm.pmtitle[:50] + '...' if len(pm.pmtitle) > 50 else pm.pmtitle,
                'full_title': pm.pmtitle
            }
        
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
                return {
                    'pm_id': pm.pm_id,
                    'title': pm.pmtitle[:50] + '...' if len(pm.pmtitle) > 50 else pm.pmtitle,
                    'full_title': pm.pmtitle
                }
        
        return None
