"""Pm Master definitions."""
from rest_framework import serializers
from ..models import Topic, PMMasterPlan, Machine
from django.db import transaction
from ..timezones import object_timezone
from ..tenancy import get_accessible_properties, get_operable_properties
from .shared import _validate_machine_ids_in_request_scope
from .users import UserSummarySerializer
from .locations import TopicSerializer
from .machines import MachineSerializer


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
    can_manage_pm_master = serializers.SerializerMethodField()
    generated_pm_id = serializers.SerializerMethodField()
    generated_pm_status = serializers.SerializerMethodField()

    class Meta:
        model = PMMasterPlan
        fields = [
            'plan_id', 'title', 'topics', 'topic_ids', 'machines', 'machine_ids',
            'property_id', 'can_operate', 'can_manage_pm_master', 'procedure_template', 'procedure_template_name', 'frequency',
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

    def get_can_manage_pm_master(self, obj):
        request = self.context.get('request')
        if request is None:
            return False
        from ..tenancy import user_can_manage_pm_master
        machines = list(obj.machines.select_related('property'))
        return bool(machines) and user_can_manage_pm_master(request.user, machines[0].property)

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
        template = data.get('procedure_template', getattr(self.instance, 'procedure_template', None))
        if template and machines and template.property_id != machines[0].property_id:
            raise serializers.ValidationError({'procedure_template': 'Template must belong to the plan property.'})
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
                from ..services import PreventiveMaintenanceService
                plan.next_due_date = PreventiveMaintenanceService.calculate_next_due_date(
                    plan.frequency,
                    plan.custom_days,
                    plan.last_completed_date,
                    object_timezone(plan),
                )
            plan.save(update_fields=['next_due_date', 'updated_at'])
        return plan
