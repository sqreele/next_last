"""Pm Write definitions."""
from rest_framework import serializers
from ..models import Topic, Job, PreventiveMaintenance
from django.contrib.auth import get_user_model
import logging
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from ..timezones import object_timezone
from ..tenancy import get_accessible_properties, get_operable_properties
from ..job_property import resolve_external_property_reference
from .shared import _validate_machine_ids_in_request_scope, get_user_display_name
from .locations import TopicSerializer
from .machines import MachineSerializer
from .pm_list import get_pm_property, get_pm_property_external_id
from .pm_images import validate_and_optimize_legacy_pm_images

User = get_user_model()

logger = logging.getLogger(__name__)


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
