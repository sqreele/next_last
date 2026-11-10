"""Pm Compat definitions."""
from rest_framework import serializers
from ..models import PreventiveMaintenance, Machine
from django.contrib.auth import get_user_model
from .shared import _validate_machine_ids_in_request_scope, get_user_display_name
from .users import UserSummarySerializer
from .locations import TopicSerializer
from .machines import MachineSerializer
from .pm_list import get_pm_property_external_id

User = get_user_model()


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
