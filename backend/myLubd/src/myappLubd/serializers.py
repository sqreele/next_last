from rest_framework import serializers
from .models import Room, Topic, JobImage, Job, Property, UserProfile, Session, PreventiveMaintenance, Machine, MaintenanceProcedure
from django.contrib.auth.models import User
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
        """Get rooms for this property"""
        rooms = obj.rooms.all()
        return RoomSerializer(rooms, many=True, context=self.context).data
    
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
    created_at = serializers.DateTimeField(source='user.date_joined', read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            'id',
            'username',
            'email',
            'profile_image',
            'positions',
            'properties',
            'created_at',
        ]
        read_only_fields = ['id', 'username', 'email', 'created_at']

# Job image serializer
class JobImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = JobImage
        fields = ['id', 'image_url', 'uploaded_by', 'uploaded_at']

    def get_image_url(self, obj):
        """Return the absolute URL for the image."""
        if obj.image:
            return self.context['request'].build_absolute_uri(obj.image.url)
        return None

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
    profile_image = UserProfileSerializer(source='user.userprofile', read_only=True)
    room_type = serializers.CharField(source='room.room_type', read_only=True)
    name = serializers.CharField(source='room.name', read_only=True)
    rooms = RoomSerializer(many=True, read_only=True)
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
    """General-purpose serializer for Machine model"""
    property_name = serializers.CharField(source='property.name', read_only=True)

    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'description', 'location', 'property', 'property_name',
            'status', 'installation_date', 'last_maintenance_date', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_id', 'created_at', 'updated_at']
    
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
    """Lighter serializer for listing machines"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    maintenance_count = serializers.SerializerMethodField()
    next_maintenance_date = serializers.SerializerMethodField()
    
    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'status', 'property_name', 
            'maintenance_count', 'next_maintenance_date', 'last_maintenance_date'
        ]
    
    def get_maintenance_count(self, obj):
        """Get count of preventive maintenances associated with this machine"""
        return obj.preventive_maintenances.count()
    
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

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'job_id', 'job_description', 'scheduled_date', 'completed_date',
            'frequency', 'next_due_date', 'status', 'topics', 'machines', 'property_id',
            'procedure', 'notes', 'before_image_url', 'after_image_url'
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
    """Detailed serializer for machine details view"""
    property = PropertySerializer(read_only=True)
    property_id = serializers.PrimaryKeyRelatedField(
        queryset=Property.objects.all(),
        source='property',
        write_only=True
    )
    preventive_maintenances = PreventiveMaintenanceListSerializer(many=True, read_only=True)
    days_since_last_maintenance = serializers.SerializerMethodField()
    next_maintenance_date = serializers.SerializerMethodField()
    
    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'description', 'location', 'property', 'property_id',
            'status', 'installation_date', 'last_maintenance_date', 'preventive_maintenances',
            'days_since_last_maintenance', 'next_maintenance_date', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_id', 'created_at', 'updated_at']
    
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
            'before_image_url', 'after_image_url', 'notes', 'procedure', 'created_by', 'updated_at',
            'is_overdue', 'days_remaining', 'machine_ids', 'machines', 'property_id'
        ]
        read_only_fields = ['pm_id', 'created_by', 'updated_at', 'next_due_date']
        extra_kwargs = {
            'before_image': {'required': False},
            'after_image': {'required': False},
            'notes': {'required': False},
            'procedure': {'required': False},
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

    class Meta:
        model = PreventiveMaintenance
        fields = [
            'pm_id', 'pmtitle', 'topics', 'topic_ids', 'scheduled_date', 'completed_date',
            'frequency', 'custom_days', 'next_due_date', 'before_image', 'after_image',
            'before_image_url', 'after_image_url', 'notes', 'procedure', 'machine_ids', 'machines', 'property_id'
        ]
        read_only_fields = ['pm_id', 'next_due_date']
        extra_kwargs = {
            'before_image': {'required': False},
            'after_image': {'required': False},
            'notes': {'required': False},
            'procedure': {'required': False},
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
        
        topic_ids = validated_data.pop('topic_ids', [])
        machine_ids = validated_data.pop('machine_ids', [])
        
        print(f"After popping arrays - validated_data: {validated_data}")
        
        instance = super().create(validated_data)
        print(f"Created instance: {instance}")
        print(f"Instance pmtitle: {instance.pmtitle}")
        
        if topic_ids:
            instance.topics.set(topic_ids)
        if machine_ids:
            instance.machines.set(Machine.objects.filter(machine_id__in=machine_ids))
        
        print(f"Final instance pmtitle: {instance.pmtitle}")
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
            'procedure', 'created_by', 'updated_at'
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
    """Serializer for MaintenanceProcedure model"""
    steps = MaintenanceStepSerializer(many=True, required=False)
    steps_count = serializers.SerializerMethodField()
    total_estimated_time = serializers.SerializerMethodField()
    is_valid_procedure = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'name', 'description', 'steps', 'steps_count', 'total_estimated_time',
            'estimated_duration', 'required_tools', 'safety_notes', 'difficulty_level',
            'is_valid_procedure', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_steps_count(self, obj):
        return obj.get_steps_count()
    
    def get_total_estimated_time(self, obj):
        return obj.get_total_estimated_time()
    
    def get_is_valid_procedure(self, obj):
        is_valid, _ = obj.validate_steps()
        return is_valid
    
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
    """Simplified serializer for listing maintenance procedures"""
    steps_count = serializers.SerializerMethodField()
    total_estimated_time = serializers.SerializerMethodField()
    
    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'name', 'description', 'steps_count', 'total_estimated_time',
            'estimated_duration', 'difficulty_level', 'created_at'
        ]
    
    def get_steps_count(self, obj):
        return obj.get_steps_count()
    
    def get_total_estimated_time(self, obj):
        return obj.get_total_estimated_time()