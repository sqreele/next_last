from rest_framework import serializers
from .models import Room, Topic, JobImage, Job, Property, UserProfile, Session, PreventiveMaintenance, Machine, MaintenanceProcedure, MaintenanceTaskImage
from django.contrib.auth import get_user_model

User = get_user_model()
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.core.validators import FileExtensionValidator
import math

# User serializer for basic user data
class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = ['url', 'username', 'email', 'is_staff']

# Room serializer defined first to avoid circular import issues
class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = '__all__'


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
            'status', 'installation_date', 'last_maintenance_date', 'task_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_id', 'created_at', 'updated_at']
    
    def get_task_count(self, obj):
        """Get count of maintenance tasks for this equipment"""
        return obj.maintenance_tasks.count()
    
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
        return obj.maintenance_tasks.count()
    
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

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'pmtitle', 'job_id', 'job_description', 'scheduled_date', 'completed_date',
            'frequency', 'next_due_date', 'status', 'topics', 'machines', 'property_id',
            'procedure', 'notes', 'before_image_url', 'after_image_url', 'procedure_template',
            'procedure_template_id', 'procedure_template_name'
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
    days_since_last_maintenance = serializers.SerializerMethodField()
    next_maintenance_date = serializers.SerializerMethodField()
    
    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'description', 'location', 'property', 'property_id',
            'status', 'installation_date', 'last_maintenance_date', 
            'preventive_maintenances', 'maintenance_tasks',
            'days_since_last_maintenance', 'next_maintenance_date', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_id', 'created_at', 'updated_at']
    
    def get_maintenance_tasks(self, obj):
        """Get detailed info about maintenance tasks (ER diagram relationship)"""
        tasks = obj.maintenance_tasks.all()
        return [{
            'id': task.id,
            'name': task.name,
            'frequency': task.frequency,
            'estimated_duration': task.estimated_duration,
            'responsible_department': task.responsible_department,
            'difficulty_level': task.difficulty_level,
            'steps_count': task.get_steps_count()
        } for task in tasks]
    
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
            'is_overdue', 'days_remaining', 'machine_ids', 'machines', 'property_id'
        ]
        read_only_fields = ['pm_id', 'created_by', 'updated_at', 'next_due_date', 'procedure_template_id', 'procedure_template_name']
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
        if machines:
            # All machines must belong to the same property, so return the first one
            return machines.first().property.property_id
        return None

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
        
        if scheduled_date and completed_date and completed_date < scheduled_date:
            raise serializers.ValidationError({
                'completed_date': 'Completion date cannot be earlier than scheduled date'
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

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'pmtitle', 'topics', 'topic_ids', 'scheduled_date', 'completed_date',
            'frequency', 'custom_days', 'next_due_date', 'before_image', 'after_image',
            'before_image_url', 'after_image_url', 'notes', 'procedure', 'procedure_template',
            'procedure_template_id', 'procedure_template_name', 'machine_ids', 'machines', 'property_id'
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
        }
    
    def to_internal_value(self, data):
        print(f"=== DEBUG: to_internal_value ===")
        print(f"Input data: {data}")
        result = super().to_internal_value(data)
        print(f"Result: {result}")
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
        
        topic_ids = validated_data.pop('topic_ids', [])
        machine_ids = validated_data.pop('machine_ids', [])
        
        print(f"After popping arrays - validated_data: {validated_data}")
        
        instance = super().create(validated_data)
        print(f"Created instance: {instance}")
        print(f"Instance pmtitle: {instance.pmtitle}")
        print(f"Instance procedure_template: {instance.procedure_template}")
        
        if topic_ids:
            instance.topics.set(topic_ids)
        if machine_ids:
            instance.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        
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

    def validate(self, data):
        frequency = data.get('frequency')
        custom_days = data.get('custom_days')

        if frequency == 'custom' and not custom_days:
            raise serializers.ValidationError({
                'custom_days': 'Custom days value is required when frequency is set to Custom'
            })

        scheduled_date = data.get('scheduled_date')
        completed_date = data.get('completed_date')

        if scheduled_date and completed_date and completed_date < scheduled_date:
            raise serializers.ValidationError({
                'completed_date': 'Completion date cannot be earlier than scheduled date'
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
            'completed_date', 'after_image', 'notes', 'machine_ids', 'machines', 'property_id'
        ]

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

        if scheduled_date and completed_date and completed_date < scheduled_date:
            raise serializers.ValidationError({
                'completed_date': 'Completion date cannot be earlier than scheduled date'
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

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'pmtitle', 'topics', 'topic_ids', 'scheduled_date', 'completed_date',
            'property_id', 'machine_ids', 'machines', 'frequency', 'custom_days', 'next_due_date',
            'before_image', 'after_image', 'before_image_url', 'after_image_url', 'notes',
            'procedure', 'procedure_template', 'assigned_to', 'remarks',
            'created_by', 'updated_at'
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
    """Serializer for MaintenanceTask (MaintenanceProcedure) following ER diagram"""
    # steps field removed from API - not needed in frontend
    equipment_name = serializers.CharField(source='equipment.name', read_only=True)
    equipment_id = serializers.PrimaryKeyRelatedField(
        queryset=Machine.objects.all(),
        source='equipment',
        required=False
    )
    
    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'equipment', 'equipment_id', 'equipment_name', 
            'name', 'description', 'frequency', 'estimated_duration', 'responsible_department',
            'required_tools', 'safety_notes', 'difficulty_level',
            'created_at', 'updated_at'
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
    """Simplified serializer for listing maintenance tasks following ER diagram"""
    # steps_count and total_estimated_time removed - steps not used
    equipment_name = serializers.CharField(source='equipment.name', read_only=True)
    schedule_count = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'equipment', 'equipment_name', 'name', 'frequency', 'estimated_duration',
            'responsible_department', 'difficulty_level',
            'schedule_count', 'created_at'
        ]
    
    def get_schedule_count(self, obj):
        """Get count of maintenance schedules for this task"""
        return obj.maintenance_schedules.count()


class MaintenanceTaskImageSerializer(serializers.ModelSerializer):
    """Serializer for MaintenanceTaskImage model"""
    task_name = serializers.CharField(source='task.name', read_only=True)
    equipment_name = serializers.CharField(source='task.equipment.name', read_only=True)
    uploaded_by_username = serializers.CharField(source='uploaded_by.username', read_only=True)
    image_url_full = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceTaskImage
        fields = [
            'id', 'task', 'task_name', 'equipment_name',
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