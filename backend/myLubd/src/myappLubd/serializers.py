from rest_framework import serializers
from .models import Room, Topic, JobImage, Job, Property, UserProfile, Session, PreventiveMaintenance, Machine, MaintenanceProcedure, MaintenanceTaskImage, UtilityConsumption, Inventory
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
from datetime import timedelta
import math

# User serializer for basic user data
class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = ['url', 'username', 'email', 'is_staff']

class UserSummarySerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'is_staff']
        read_only_fields = fields

    def get_full_name(self, obj):
        full_name = obj.get_full_name().strip()
        return full_name or obj.username

# Room serializer defined first to avoid circular import issues
class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ['room_id', 'name', 'room_type', 'is_active', 'created_at', 'properties']


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
        # Return property_id strings to keep payload small
        return list(obj.properties.values_list('property_id', flat=True))

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

    class Meta:
        model = Property
        fields = [
            'id',
            'property_id',
            'name',
            'description',
            'users',
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
        read_only_fields = ['id', 'username', 'email', 'first_name', 'last_name', 'created_at']

# Job image serializer
class JobImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    jpeg_url = serializers.SerializerMethodField()

    class Meta:
        model = JobImage
        fields = ['id', 'image_url', 'jpeg_url', 'uploaded_by', 'uploaded_at']

    def get_image_url(self, obj):
        """Return the absolute URL for the image."""
        if obj.image:
            return self.context['request'].build_absolute_uri(obj.image.url)
        return None

    def get_jpeg_url(self, obj):
        """Return the absolute URL for the JPEG-converted image when available."""
        jpeg_path = getattr(obj, 'jpeg_path', None)
        if not jpeg_path:
            return None
        # Build a proper media URL path
        jp = str(jpeg_path)
        if jp.startswith('/media/'):
            url_path = jp
        elif '/' in jp:
            # Already a relative path under media
            url_path = f"/media/{jp}"
        else:
            # Backward-compat: only filename stored; infer directory from original image
            base_dir = None
            try:
                if obj.image and hasattr(obj.image, 'url'):
                    # obj.image.url is like /media/maintenance_job_images/2025/02/filename.ext
                    full_url: str = obj.image.url  # type: ignore
                    # Strip leading /media/ and filename to get directory
                    if full_url.startswith('/media/'):
                        remainder = full_url[len('/media/'):]
                        slash_idx = remainder.rfind('/')
                        if slash_idx != -1:
                            base_dir = remainder[:slash_idx]
            except Exception:
                base_dir = None
            if base_dir:
                url_path = f"/media/{base_dir}/{jp}"
            else:
                url_path = f"/media/{jp}"
        request = self.context.get('request')
        if request:
            try:
                return request.build_absolute_uri(url_path)
            except Exception:
                return url_path
        return url_path

# Topic serializer
class TopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ['title', 'description', 'id']

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
    images = JobImageSerializer(source='job_images', many=True, read_only=True)
    topics = TopicSerializer(many=True, read_only=True)
    profile_image = serializers.SerializerMethodField()
    room_type = serializers.CharField(source='room.room_type', read_only=True)
    name = serializers.CharField(source='room.name', read_only=True)
    rooms = RoomSummarySerializer(many=True, read_only=True)
    topic_data = serializers.JSONField(write_only=True)
    room_id = serializers.IntegerField(write_only=True)
    image_urls = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            'id', 'job_id', 'user', 'user_username', 'user_first_name', 'user_last_name', 'user_email',
            'updated_by', 'description', 'status', 'priority',
            'remarks', 'created_at', 'updated_at', 'completed_at', 'is_defective',
            'rooms', 'topics', 'images', 'profile_image', 'room_type', 'name',
            'topic_data', 'room_id', 'image_urls', 'is_preventivemaintenance'
        ]
        read_only_fields = ['id', 'job_id', 'user', 'user_username', 'user_first_name', 'user_last_name', 'user_email', 'images', 'topics']

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
        
        return data

    def get_user(self, obj):
        """Return user information in a structured format"""
        if obj.user:
            return {
                'id': obj.user.id,
                'username': obj.user.username,
                'first_name': obj.user.first_name,
                'last_name': obj.user.last_name,
                'email': obj.user.email,
                'full_name': f"{obj.user.first_name} {obj.user.last_name}".strip() if obj.user.first_name or obj.user.last_name else obj.user.username
            }
        return None

    def get_profile_image(self, obj):
        """
        Lightweight serializer for user's profile image info to avoid deep
        nesting. Returns:
          { profile_image: <url or null>, properties: [{property_id, name}] }
        """
        userprofile = getattr(obj.user, 'userprofile', None)
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
        """Return a list of full URLs for all images associated with the job."""
        request = self.context.get('request')
        if request and obj.job_images.exists():
            return [request.build_absolute_uri(image.image.url) for image in obj.job_images.all()]
        return []

    def create(self, validated_data):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("User must be logged in to create a job")

        validated_data.pop('user', None)
        validated_data.pop('username', None)
        validated_data.pop('user_id', None)

        topic_data = validated_data.pop('topic_data', None)
        room_id = validated_data.pop('room_id', None)

        if not room_id:
            raise serializers.ValidationError({'room_id': 'This field is required.'})
        if not topic_data or 'title' not in topic_data:
            raise serializers.ValidationError({'topic_data': 'This field is required and must include a title.'})

        try:
            with transaction.atomic():
                room = Room.objects.get(room_id=room_id)
                topic, _ = Topic.objects.get_or_create(
                    title=topic_data['title'],
                    defaults={'description': topic_data.get('description', '')}
                )
                job = Job.objects.create(
                    **validated_data,
                    user=request.user
                )
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

    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'description', 'location', 'property', 'property_name',
            'status', 'group_id', 'installation_date', 'last_maintenance_date', 'task_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_id', 'created_at', 'updated_at']
    
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
    
    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'status', 'location', 'property_name', 
            'task_count', 'next_maintenance_date', 'last_maintenance_date'
        ]
    
    def get_task_count(self, obj):
        """Get count of maintenance tasks for this equipment"""
        # maintenance_tasks relationship removed - equipment no longer linked to task templates
        return 0
    
    def get_next_maintenance_date(self, obj):
        """Get the next scheduled maintenance date"""
        return obj.get_next_maintenance_date()
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

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'pmtitle', 'job_id', 'job_description', 'scheduled_date', 'completed_date',
            'frequency', 'next_due_date', 'status', 'topics', 'machines', 'property_id',
            'procedure', 'notes', 'before_image_url', 'after_image_url', 'procedure_template',
            'procedure_template_id', 'procedure_template_name', 'assigned_to_details', 'created_by_details'
        ]
        list_serializer_class = serializers.ListSerializer

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
    
    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'description', 'location', 'property', 'property_id',
            'status', 'group_id', 'installation_date', 'last_maintenance_date', 
            'preventive_maintenances', 'maintenance_tasks', 'maintenance_procedures',
            'days_since_last_maintenance', 'next_maintenance_date', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_id', 'created_at', 'updated_at']
    
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
            'name', 'description', 'location', 'property', 
            'status', 'installation_date', 'last_maintenance_date'
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
            'name', 'description', 'location', 'property', 
            'status', 'installation_date', 'last_maintenance_date'
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
            'assigned_to', 'assigned_to_details', 'created_by_details'
        ]
        read_only_fields = ['pm_id', 'created_by', 'updated_at', 'next_due_date', 'procedure_template_id', 'procedure_template_name', 'assigned_to_details', 'created_by_details']
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
        print(f"[PreventiveMaintenanceDetailSerializer] ===== SERIALIZING PM {instance.pm_id} =====")
        print(f"[PreventiveMaintenanceDetailSerializer] Machine count from DB: {machine_count}")
        print(f"[PreventiveMaintenanceDetailSerializer] Machine IDs from DB: {machine_ids}")
        print(f"[PreventiveMaintenanceDetailSerializer] Machine queryset type: {type(machines_queryset)}")
        
        logger.info(f"[PreventiveMaintenanceDetailSerializer] Serializing PM {instance.pm_id}: {machine_count} machines, IDs: {machine_ids}")
        
        representation = super().to_representation(instance)
        
        print(f"[PreventiveMaintenanceDetailSerializer] Machines in representation: {representation.get('machines', [])}")
        print(f"[PreventiveMaintenanceDetailSerializer] Representation machines count: {len(representation.get('machines', []))}")
        print(f"[PreventiveMaintenanceDetailSerializer] ===== END SERIALIZATION =====")
        
        return representation

    def create(self, validated_data):
        print(f"[PreventiveMaintenanceDetailSerializer] CREATE - validated_data: {validated_data}")
        print(f"[PreventiveMaintenanceDetailSerializer] procedure_template in data: {validated_data.get('procedure_template')}")
        
        topic_ids = validated_data.pop('topic_ids', [])
        machine_ids = validated_data.pop('machine_ids', [])
        instance = super().create(validated_data)
        
        print(f"[PreventiveMaintenanceDetailSerializer] Created instance - procedure_template: {instance.procedure_template}")
        
        if topic_ids:
            instance.topics.set(topic_ids)
        if machine_ids:
            instance.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        return instance

    def update(self, instance, validated_data):
        print(f"[PreventiveMaintenanceDetailSerializer] UPDATE - validated_data: {validated_data}")
        print(f"[PreventiveMaintenanceDetailSerializer] procedure_template in data: {validated_data.get('procedure_template')}")
        
        topic_ids = validated_data.pop('topic_ids', None)
        machine_ids = validated_data.pop('machine_ids', None)
        instance = super().update(instance, validated_data)
        
        print(f"[PreventiveMaintenanceDetailSerializer] Updated instance - procedure_template: {instance.procedure_template}")
        
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
            'property_id', 'assigned_to', 'remarks'
        ]
        read_only_fields = ['pm_id', 'next_due_date', 'procedure_template_id', 'procedure_template_name']
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
    
    def to_internal_value(self, data):
        print(f"=== DEBUG: to_internal_value ===")
        print(f"Input data: {data}")
        print(f"Input data type: {type(data)}")
        print(f"Input data keys: {data.keys() if hasattr(data, 'keys') else 'N/A'}")
        
        # CRITICAL: Handle FormData/QueryDict for machine_ids and topic_ids
        # When FormData has multiple values for the same key, QueryDict.get() returns only the last value
        # We need to use getlist() to get all values and convert QueryDict to a regular dict
        if hasattr(data, 'getlist'):
            # This is a QueryDict (from FormData)
            machine_ids_raw = data.getlist('machine_ids')
            topic_ids_raw = data.getlist('topic_ids')
            
            print(f"[to_internal_value] QueryDict detected - machine_ids from getlist(): {machine_ids_raw}")
            print(f"[to_internal_value] QueryDict detected - topic_ids from getlist(): {topic_ids_raw}")
            
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
            print(f"[to_internal_value] Converted QueryDict to dict. machine_ids: {data_dict.get('machine_ids')}, topic_ids: {data_dict.get('topic_ids')}")
            print(f"[to_internal_value] machine_ids type: {type(data_dict.get('machine_ids'))}, length: {len(data_dict.get('machine_ids', []))}")
            
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
                    print(f"Removed invalid before_image from data")
                elif isinstance(data, dict):
                    # Regular dict - remove the key
                    data = {k: v for k, v in data.items() if k != 'before_image' or hasattr(v, 'read')}
                    print(f"Removed invalid before_image from dict")
            
            if after_image is not None and not hasattr(after_image, 'read'):
                # Not a file object - remove it
                if hasattr(data, '_mutable'):
                    # QueryDict - create a copy and remove the key
                    if not isinstance(data, dict):
                        data = data.copy()
                    data.pop('after_image', None)
                    print(f"Removed invalid after_image from data")
                elif isinstance(data, dict):
                    # Regular dict - remove the key
                    data = {k: v for k, v in data.items() if k != 'after_image' or hasattr(v, 'read')}
                    print(f"Removed invalid after_image from dict")
        
        result = super().to_internal_value(data)
        
        # CRITICAL: Ensure machine_ids is preserved after parent serializer processing
        if isinstance(result, dict):
            result_machine_ids = result.get('machine_ids')
            result_topic_ids = result.get('topic_ids')
            
            logger.info(f"[to_internal_value] Result machine_ids: {result_machine_ids} (type: {type(result_machine_ids)})")
            print(f"[to_internal_value] Result machine_ids: {result_machine_ids} (type: {type(result_machine_ids)})")
            print(f"[to_internal_value] Result topic_ids: {result_topic_ids} (type: {type(result_topic_ids)})")
            
            # If machine_ids was lost or is empty but we had it in input data, restore it
            if isinstance(data, dict) and 'machine_ids' in data:
                input_machine_ids = data.get('machine_ids', [])
                if input_machine_ids and (not result_machine_ids or (isinstance(result_machine_ids, list) and len(result_machine_ids) == 0)):
                    logger.warning(f"[to_internal_value] ⚠️ machine_ids lost! Restoring: {input_machine_ids}")
                    print(f"[to_internal_value] ⚠️ machine_ids lost in processing! Restoring from input: {input_machine_ids}")
                    result['machine_ids'] = input_machine_ids if isinstance(input_machine_ids, list) else [input_machine_ids]
        else:
            logger.warning(f"[to_internal_value] Result is not a dict: {type(result)}")
            print(f"[to_internal_value] Result is not a dict: {type(result)}")
        
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
        print(f"=== DEBUG: PreventiveMaintenanceCreateUpdateSerializer.create ===")
        print(f"validated_data: {validated_data}")
        print(f"pmtitle in validated_data: {validated_data.get('pmtitle')}")
        print(f"procedure_template in validated_data: {validated_data.get('procedure_template')}")
        
        # CRITICAL: Pop topic_ids and machine_ids ONCE at the beginning
        # These are ManyToMany relationships that need to be set after instance creation
        topic_ids = validated_data.pop('topic_ids', [])
        machine_ids = validated_data.pop('machine_ids', [])
        
        # Ensure machine_ids is a list (handle case where it might be a string or single value)
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] BEFORE PROCESSING - machine_ids: {machine_ids}, type: {type(machine_ids)}, is_list: {isinstance(machine_ids, list)}")
        if machine_ids and not isinstance(machine_ids, list):
            machine_ids = [machine_ids] if machine_ids else []
        # Filter out empty strings and None values
        if isinstance(machine_ids, list):
            original_count = len(machine_ids)
            machine_ids = [str(mid).strip() for mid in machine_ids if mid and str(mid).strip()]
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] AFTER FILTERING - machine_ids: {machine_ids}, original_count: {original_count}, filtered_count: {len(machine_ids)}")
        else:
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] machine_ids is NOT a list after conversion: {machine_ids}, type: {type(machine_ids)}")
        
        # Ensure topic_ids is a list
        if topic_ids and not isinstance(topic_ids, list):
            topic_ids = [topic_ids] if topic_ids else []
        # Filter out None values and ensure integers
        if isinstance(topic_ids, list):
            topic_ids = [int(tid) for tid in topic_ids if tid is not None]
        
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] Popped machine_ids: {machine_ids} (type: {type(machine_ids)}, length: {len(machine_ids) if isinstance(machine_ids, list) else 'N/A'})")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] Popped topic_ids: {topic_ids} (type: {type(topic_ids)}, length: {len(topic_ids) if isinstance(topic_ids, list) else 'N/A'})")
        
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
                print(f"Auto-calculated scheduled_date based on frequency '{frequency}': {next_schedule}")
        
        print(f"After processing - validated_data keys: {list(validated_data.keys())}")
        
        instance = super().create(validated_data)
        print(f"Created instance: {instance}")
        print(f"Instance pmtitle: {instance.pmtitle}")
        print(f"Instance procedure_template: {instance.procedure_template}")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] ===== INSTANCE CREATED, NOW SETTING RELATIONSHIPS =====")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] machine_ids variable exists: {'machine_ids' in locals()}")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] machine_ids value: {machine_ids if 'machine_ids' in locals() else 'NOT IN LOCALS'}")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] machine_ids type: {type(machine_ids) if 'machine_ids' in locals() else 'N/A'}")
        
        # Set ManyToMany relationships after instance creation
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] ===== SETTING RELATIONSHIPS =====")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] topic_ids check: {topic_ids}, bool: {bool(topic_ids)}, len: {len(topic_ids) if isinstance(topic_ids, list) else 'N/A'}")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] machine_ids check: {machine_ids}, bool: {bool(machine_ids)}, len: {len(machine_ids) if isinstance(machine_ids, list) else 'N/A'}")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] machine_ids repr: {repr(machine_ids)}")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] machine_ids == []: {machine_ids == []}")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] machine_ids is None: {machine_ids is None}")
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] len(machine_ids) if list: {len(machine_ids) if isinstance(machine_ids, list) else 'NOT A LIST'}")
        
        if topic_ids:
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] Setting {len(topic_ids)} topics")
            instance.topics.set(topic_ids)
        else:
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] No topics to set")
            
        # CRITICAL: Check machine_ids more explicitly
        has_machines = machine_ids and len(machine_ids) > 0 if isinstance(machine_ids, list) else bool(machine_ids)
        print(f"[PreventiveMaintenanceCreateUpdateSerializer] has_machines check: {has_machines}")
        
        if has_machines:
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] ===== ENTERING MACHINE SETTING BLOCK =====")
            logger.info(f"[PreventiveMaintenanceCreateUpdateSerializer] Setting {len(machine_ids)} machines: {machine_ids}")
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] Setting {len(machine_ids)} machines: {machine_ids}")
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] Machine IDs type: {type(machine_ids)}, values: {machine_ids}")
            
            # Query machines by machine_id
            machines = Machine.objects.filter(machine_id__in=machine_ids)
            found_count = machines.count()
            found_ids = list(machines.values_list('machine_id', flat=True))
            
            logger.info(f"[PreventiveMaintenanceCreateUpdateSerializer] Found {found_count} machines: {found_ids}")
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] Found {found_count} machines in database")
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] Found machine IDs: {found_ids}")
            
            if found_count == 0:
                logger.warning(f"[PreventiveMaintenanceCreateUpdateSerializer] ⚠️ No machines found for IDs: {machine_ids}")
                print(f"[PreventiveMaintenanceCreateUpdateSerializer] ⚠️ WARNING: No machines found for IDs: {machine_ids}")
            
            # Set the machines relationship
            instance.machines.set(machines)
            
            # Refresh instance to ensure machines are loaded
            instance.refresh_from_db()
            
            # Verify machines were set
            final_machine_count = instance.machines.count()
            final_machine_ids = list(instance.machines.values_list('machine_id', flat=True))
            
            logger.info(f"[PreventiveMaintenanceCreateUpdateSerializer] ✅ Machines set. Count: {final_machine_count}, IDs: {final_machine_ids}")
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] ✅ Machines set. Instance now has {final_machine_count} machines")
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] Final machine IDs: {final_machine_ids}")
            
            if final_machine_count == 0 and found_count > 0:
                logger.error(f"[PreventiveMaintenanceCreateUpdateSerializer] ⚠️ ERROR: Machines found but not set!")
                print(f"[PreventiveMaintenanceCreateUpdateSerializer] ⚠️ ERROR: Machines were found but not set! This is a bug.")
        else:
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] ⚠️ No machine_ids provided - machines will be empty")
            print(f"[PreventiveMaintenanceCreateUpdateSerializer] machine_ids value: {machine_ids}, type: {type(machine_ids)}")
        
        print(f"Final instance pmtitle: {instance.pmtitle}")
        return instance

    def update(self, instance, validated_data):
        print(f"=== DEBUG: PreventiveMaintenanceCreateUpdateSerializer.update ===")
        print(f"validated_data: {validated_data}")
        print(f"procedure_template in validated_data: {validated_data.get('procedure_template')}")
        
        topic_ids = validated_data.pop('topic_ids', None)
        machine_ids = validated_data.pop('machine_ids', None)
        instance = super().update(instance, validated_data)
        
        print(f"Updated instance procedure_template: {instance.procedure_template}")
        
        if topic_ids is not None:
            instance.topics.set(topic_ids)
        if machine_ids is not None:
            instance.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        return instance

    def validate_assigned_to(self, value):
        """Custom validation for assigned_to field"""
        print(f"=== DEBUG: validate_assigned_to ===")
        print(f"Type: {type(value)}")
        print(f"Value: {value}")
        print(f"Repr: {repr(value)}")
        return value

    def validate(self, data):
        print(f"=== DEBUG: validate method ===")
        print(f"assigned_to in data: {'assigned_to' in data}")
        if 'assigned_to' in data:
            print(f"assigned_to value: {data.get('assigned_to')}")
            print(f"assigned_to type: {type(data.get('assigned_to'))}")
        
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

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'pmtitle', 'topics', 'topic_ids', 'scheduled_date', 'completed_date',
            'property_id', 'machine_ids', 'machines', 'frequency', 'custom_days', 'next_due_date',
            'before_image', 'after_image', 'before_image_url', 'after_image_url', 'notes',
            'procedure', 'procedure_template', 'assigned_to', 'remarks',
            'assigned_to_details', 'created_by', 'created_by_details', 'updated_at'
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
    image_url_full = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceTaskImage
        fields = [
            'id', 'task', 'task_name',
            'image_type', 'image_url', 'image_url_full',
            'jpeg_path', 'uploaded_at', 'uploaded_by', 'uploaded_by_username'
        ]
        read_only_fields = ['id', 'jpeg_path', 'uploaded_at']
    
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
class UtilityConsumptionSerializer(serializers.ModelSerializer):
    """Serializer for Utility Consumption records"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    month_display = serializers.CharField(source='get_month_display', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    
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
            'water',
            'nightsale',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_username'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
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
            'water',
            'nightsale',
            'created_at',
            'updated_at'
        ]


class InventorySerializer(serializers.ModelSerializer):
    """Serializer for Inventory items"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    room_id = serializers.CharField(source='room.room_id', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    image_url = serializers.SerializerMethodField()
    job_ids = serializers.SerializerMethodField()
    pm_ids = serializers.SerializerMethodField()
    jobs_detail = serializers.SerializerMethodField()
    preventive_maintenances_detail = serializers.SerializerMethodField()
    
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
            'last_restocked',
            'expiry_date',
            'notes',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_username'
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
                'created_by_id': pm.created_by_id,
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
