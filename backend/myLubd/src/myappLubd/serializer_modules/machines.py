"""Machines definitions."""
from rest_framework import serializers
from ..models import Property, Machine
from .shared import _validate_request_property_access


class MachineSerializer(serializers.ModelSerializer):
    """General-purpose serializer for Equipment (Machine) following ER diagram"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    task_count = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    lifecycle_state = serializers.CharField(read_only=True)
    is_under_warranty = serializers.BooleanField(read_only=True)

    class Meta:
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'description', 'location', 'property', 'property_name',
            'status', 'group_id', 'installation_date', 'last_maintenance_date', 'task_count',
            'purchase_date', 'purchase_cost', 'warranty_start_date', 'warranty_end_date',
            'expected_replacement_date', 'replacement_cost_estimate', 'supplier',
            'supplier_contact', 'asset_tag', 'lifecycle_notes', 'lifecycle_state',
            'is_under_warranty', 'image', 'image_url', 'created_at', 'updated_at'
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


class MachineDateListSerializer(serializers.ListSerializer):
    def to_representation(self, data):
        from ..machine_maintenance import get_next_maintenance_dates
        machines = list(data.all() if hasattr(data, 'all') else data)
        dates = get_next_maintenance_dates(machines)
        for machine in machines:
            machine._next_maintenance_date = dates[machine.pk]
        return super().to_representation(machines)


class MachineListSerializer(serializers.ModelSerializer):
    """Lighter serializer for listing equipment following ER diagram"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    task_count = serializers.SerializerMethodField()
    next_maintenance_date = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    lifecycle_state = serializers.CharField(read_only=True)
    is_under_warranty = serializers.BooleanField(read_only=True)

    class Meta:
        list_serializer_class = MachineDateListSerializer
        model = Machine
        fields = [
            'id', 'machine_id', 'name', 'brand', 'category', 'serial_number',
            'status', 'location', 'property_id', 'property_name',
            'task_count', 'next_maintenance_date', 'last_maintenance_date',
            'expected_replacement_date', 'warranty_end_date', 'lifecycle_state',
            'is_under_warranty', 'image_url'
        ]

    def get_task_count(self, obj):
        """Get count of maintenance tasks for this equipment"""
        # maintenance_tasks relationship removed - equipment no longer linked to task templates
        return 0

    def get_next_maintenance_date(self, obj):
        """Get the next scheduled maintenance date"""
        return obj.get_next_maintenance_date()

    def get_image_url(self, obj):
        """Get the absolute URL for the machine image"""
        request = self.context.get('request')
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        elif obj.image:
            return obj.image.url
        return None


class MachineCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating machines"""
    property_id = serializers.SlugRelatedField(
        source='property', slug_field='property_id', queryset=Property.objects.all()
    )

    class Meta:
        model = Machine
        fields = [
            'name', 'brand', 'category', 'serial_number', 'description', 'location', 'property_id',
            'status', 'group_id', 'installation_date', 'last_maintenance_date',
            'purchase_date', 'purchase_cost', 'warranty_start_date', 'warranty_end_date',
            'expected_replacement_date', 'replacement_cost_estimate', 'supplier',
            'supplier_contact', 'asset_tag', 'lifecycle_notes', 'image'
        ]

    def validate(self, data):
        """Custom validation for machine creation"""
        _validate_request_property_access(self, data.get('property'))
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
    property_id = serializers.SlugRelatedField(
        source='property', slug_field='property_id', queryset=Property.objects.all(), required=False
    )

    class Meta:
        model = Machine
        fields = [
            'name', 'brand', 'category', 'serial_number', 'description', 'location', 'property_id',
            'status', 'group_id', 'installation_date', 'last_maintenance_date',
            'purchase_date', 'purchase_cost', 'warranty_start_date', 'warranty_end_date',
            'expected_replacement_date', 'replacement_cost_estimate', 'supplier',
            'supplier_contact', 'asset_tag', 'lifecycle_notes', 'image'
        ]

    def validate(self, data):
        """Custom validation for machine updates"""
        _validate_request_property_access(self, data.get('property') or getattr(self.instance, 'property', None))
        installation_date = data.get('installation_date')
        last_maintenance_date = data.get('last_maintenance_date')

        if installation_date and last_maintenance_date:
            if last_maintenance_date.date() < installation_date:
                raise serializers.ValidationError({
                    'last_maintenance_date': 'Maintenance date cannot be earlier than installation date'
                })

        return data
