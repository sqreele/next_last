"""Pm Complete definitions."""
from rest_framework import serializers
from ..models import PreventiveMaintenance, Machine
from django.utils import timezone
from .shared import _validate_machine_ids_in_request_scope
from .machines import MachineSerializer
from .pm_list import get_pm_property_external_id
from .pm_images import validate_and_optimize_legacy_pm_images


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
