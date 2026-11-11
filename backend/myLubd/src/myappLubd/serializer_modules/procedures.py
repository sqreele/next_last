"""Procedures definitions."""
from rest_framework import serializers
from ..models import MaintenanceProcedure, MaintenanceTaskImage, Property
from .shared import _validate_request_property_access
from .shared import get_user_display_name, get_user_public_username
from ..procedure_access import visible_procedure_machines


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
    """Serializer for MaintenanceTask (MaintenanceProcedure) - Generic task templates"""
    property_id = serializers.SlugRelatedField(source="property", slug_field="property_id", queryset=Property.objects.all())
    property_name = serializers.CharField(source="property.name", read_only=True)
    # steps field removed from API - not needed in frontend
    machine_ids = serializers.SerializerMethodField()
    machines = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'property_id', 'property_name', 'name', 'group_id', 'category', 'description', 'frequency', 'estimated_duration',
            'responsible_department', 'required_tools', 'safety_notes',
            'difficulty_level', 'machine_ids', 'machines', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'machine_ids', 'machines', 'created_at', 'updated_at']

    def get_machine_ids(self, obj):
        """Return machine identifiers explicitly linked to this template."""
        return [machine.machine_id for machine in visible_procedure_machines(obj, self.context)]

    def get_machines(self, obj):
        """Return lightweight machine details for filtering template concerns in clients."""
        return [
            {
                'machine_id': machine.machine_id,
                'name': machine.name,
                'group_id': machine.group_id,
                'property_id': machine.property_id,
            }
            for machine in visible_procedure_machines(obj, self.context)
        ]

    def validate(self, data):
        property_obj = data.get('property', getattr(self.instance, 'property', None))
        if property_obj is None:
            raise serializers.ValidationError({'property_id': 'Property is required.'})
        _validate_request_property_access(self, property_obj, 'property_id')
        if self.instance and self.instance.property_id != property_obj.pk:
            raise serializers.ValidationError({'property_id': 'Template property is immutable.'})
        return data

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
    property_id = serializers.CharField(source="property.property_id", read_only=True)
    property_name = serializers.CharField(source="property.name", read_only=True)
    """Simplified serializer for listing maintenance tasks - Generic templates"""
    # steps_count and total_estimated_time removed - steps not used
    schedule_count = serializers.SerializerMethodField()
    machine_ids = serializers.SerializerMethodField()
    machines = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceProcedure
        fields = [
            'id', 'property_id', 'property_name', 'name', 'group_id', 'category', 'frequency', 'estimated_duration',
            'responsible_department', 'difficulty_level',
            'schedule_count', 'machine_ids', 'machines', 'created_at'
        ]

    def get_schedule_count(self, obj):
        """Get count of maintenance schedules for this task"""
        request = self.context.get('request')
        if request is None:
            return 0
        from ..pm_access import canonical_pm_queryset
        return canonical_pm_queryset(request.user).filter(procedure_template=obj).count()

    def get_machine_ids(self, obj):
        """Return machine identifiers explicitly linked to this template."""
        return [machine.machine_id for machine in visible_procedure_machines(obj, self.context)]

    def get_machines(self, obj):
        """Return lightweight machine details for filtering template concerns in clients."""
        return [
            {
                'machine_id': machine.machine_id,
                'name': machine.name,
                'group_id': machine.group_id,
                'property_id': machine.property_id,
            }
            for machine in visible_procedure_machines(obj, self.context)
        ]


class MaintenanceTaskImageSerializer(serializers.ModelSerializer):
    """Serializer for MaintenanceTaskImage model"""
    task_name = serializers.CharField(source='task.name', read_only=True)
    # equipment_name removed - tasks no longer have equipment field
    uploaded_by_username = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    image_url_full = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceTaskImage
        fields = [
            'id', 'task', 'task_name',
            'image_type', 'image_url', 'image_url_full',
            'jpeg_path', 'uploaded_at', 'uploaded_by', 'uploaded_by_username', 'uploaded_by_name'
        ]
        read_only_fields = ['id', 'jpeg_path', 'uploaded_at']

    def get_uploaded_by_name(self, obj):
        return get_user_display_name(obj.uploaded_by)

    def get_uploaded_by_username(self, obj):
        return get_user_public_username(obj.uploaded_by)

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
