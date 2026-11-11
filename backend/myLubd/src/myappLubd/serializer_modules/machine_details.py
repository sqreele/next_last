"""Machine Details definitions."""
from rest_framework import serializers
from ..models import Property, PreventiveMaintenance, Machine
import logging
from django.db.utils import ProgrammingError
from django.utils import timezone
from .locations import PropertySerializer
from .pm_list import PreventiveMaintenanceListSerializer, get_pm_property

logger = logging.getLogger(__name__)


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

            procedures = obj.maintenance_procedures.filter(property_id=obj.property_id)
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
        if len(pm_ids) != len(set(pm_ids)):
            raise serializers.ValidationError({
                'preventive_maintenance_ids': 'Duplicate maintenance IDs are not allowed.'
            })

        pm_instances = list(
            PreventiveMaintenance.objects.filter(pm_id__in=pm_ids)
            .select_related('job__property')
            .prefetch_related('machines__property')
        )
        if len(pm_instances) != len(pm_ids):
            raise serializers.ValidationError({
                'preventive_maintenance_ids': 'One or more maintenance IDs are invalid.'
            })

        invalid_property = [
            pm.pm_id for pm in pm_instances
            if get_pm_property(pm) != instance.property
        ]
        if invalid_property:
            raise serializers.ValidationError({
                'preventive_maintenance_ids': (
                    'Every maintenance record must belong to the machine property.'
                )
            })

        instance.preventive_maintenances.set(pm_instances)

        if pm_instances:
            latest_completed = max(
                (pm for pm in pm_instances if pm.completed_date),
                key=lambda pm: pm.completed_date,
                default=None,
            )
            if latest_completed:
                instance.last_maintenance_date = latest_completed.completed_date
                instance.save(update_fields=['last_maintenance_date', 'updated_at'])
        return instance
