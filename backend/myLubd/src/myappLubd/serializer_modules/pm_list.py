"""Pm List definitions."""
from rest_framework import serializers
from ..models import Property, PreventiveMaintenance
from django.utils import timezone
from .shared import get_user_display_name
from .users import UserSummarySerializer
from .locations import TopicSerializer
from .machines import MachineSerializer


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
