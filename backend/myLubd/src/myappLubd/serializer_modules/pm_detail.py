"""Pm Detail definitions."""
from rest_framework import serializers
from ..models import PreventiveMaintenance, Machine
from django.contrib.auth import get_user_model
import logging
from django.utils import timezone
from django.core.validators import FileExtensionValidator
import math
from .shared import get_user_display_name
from .users import UserSummarySerializer, UserWriteSerializer
from .locations import TopicSerializer
from .machines import MachineSerializer
from .pm_list import get_pm_property_external_id
from .pm_images import get_pm_image_counts, serialize_pm_images, user_can_operate_pm, validate_and_optimize_legacy_pm_images

User = get_user_model()

logger = logging.getLogger(__name__)


class PreventiveMaintenanceDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for single item view, creation and updates"""
    pmtitle = serializers.SerializerMethodField()
    before_image_url = serializers.SerializerMethodField()
    after_image_url = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    created_by = UserWriteSerializer(read_only=True)
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
