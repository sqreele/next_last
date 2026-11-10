"""Locations definitions."""
from rest_framework import serializers
from ..models import Room, Topic, Job, Property, Area
from django.core.exceptions import ValidationError
from django.db import transaction
from ..tenancy import user_can_edit_property
from ..job_property import resolve_property_reference
from ..room_property import resolve_room_property
from .shared import _validate_request_property_access


class RoomPropertiesCompatibilityField(serializers.Field):
    """Legacy ``properties[]`` wire field backed only by ``Room.property``."""

    def get_attribute(self, instance):
        # This is a projection; no model field named ``properties`` exists.
        return instance

    def to_representation(self, room):
        return [room.property_id]


class RoomSerializer(serializers.ModelSerializer):
    properties = RoomPropertiesCompatibilityField(read_only=True)
    # The canonical FK is both the singular read contract and a supported
    # write reference. ``properties`` is output-only compatibility.
    property_id = serializers.CharField(required=False)
    property_pk = serializers.IntegerField(source='property_id', read_only=True)

    class Meta:
        model = Room
        fields = [
            'room_id', 'name', 'room_type', 'is_active', 'created_at',
            'properties', 'property_id', 'property_pk',
        ]

    @staticmethod
    def _as_drf_validation_error(error):
        if hasattr(error, 'message_dict'):
            return serializers.ValidationError(error.message_dict)
        return serializers.ValidationError(str(error))

    def validate(self, attrs):
        if 'properties' in self.initial_data:
            raise serializers.ValidationError({
                'properties': 'properties is read-only; use property_id.',
            })
        explicit_value = attrs.pop('property_id', serializers.empty)

        explicit_property = None
        if explicit_value is not serializers.empty:
            try:
                explicit_property = resolve_property_reference(explicit_value)
            except ValidationError as error:
                raise self._as_drf_validation_error(error)

        existing_property = self.instance.property if self.instance and self.instance.property_id else None
        if explicit_property is None and existing_property is not None:
            resolved_property = existing_property
        else:
            try:
                resolved_property = resolve_room_property(
                    explicit_property=explicit_property,
                    existing_property=existing_property,
                )
            except ValidationError as error:
                raise self._as_drf_validation_error(error)

        _validate_request_property_access(self, resolved_property, 'property_id')
        attrs['_canonical_room_property'] = resolved_property
        return attrs

    def create(self, validated_data):
        canonical_property = validated_data.pop('_canonical_room_property')
        with transaction.atomic():
            room = Room.objects.create(property=canonical_property, **validated_data)
        return room

    def update(self, instance, validated_data):
        canonical_property = validated_data.pop('_canonical_room_property')
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['room_id'] = data.get('room_id') or getattr(instance, 'room_id', None)
        data['name'] = data.get('name') or 'Unnamed room'
        data['room_type'] = data.get('room_type') or 'Room'
        data['is_active'] = bool(data.get('is_active'))
        # Compatibility output is deliberately derived from the canonical FK,
        # never from the transitional Room.properties M2M.
        data['property_id'] = instance.property.property_id
        data['property_pk'] = instance.property_id
        data['properties'] = [instance.property_id] if instance.property_id else []
        return data


class RoomSummarySerializer(serializers.ModelSerializer):
    """
    Lightweight room serializer for nested usage (e.g., inside jobs/properties).
    Returns only essential fields and a simplified list of property_ids to
    avoid deep nesting and large payloads.
    """
    properties = serializers.SerializerMethodField()
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    property_pk = serializers.IntegerField(source='property_id', read_only=True)

    class Meta:
        model = Room
        fields = ['room_id', 'name', 'room_type', 'property_id', 'property_pk', 'properties']

    def get_properties(self, obj):
        return [obj.property_id] if obj.property_id else []

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['room_id'] = data.get('room_id') or getattr(instance, 'room_id', None)
        data['name'] = data.get('name') or 'Unnamed room'
        data['room_type'] = data.get('room_type') or 'Room'
        data['property_id'] = instance.property.property_id
        data['property_pk'] = instance.property_id
        data['properties'] = data.get('properties') if isinstance(data.get('properties'), list) else []
        return data


class PropertyPMStatusSerializer(serializers.ModelSerializer):
    """Serializer for property preventive maintenance status endpoint"""
    is_preventivemaintenance = serializers.BooleanField(read_only=True)

    class Meta:
        model = Property
        fields = ['property_id', 'name', 'is_preventivemaintenance']


class PropertySerializer(serializers.ModelSerializer):
    can_edit = serializers.SerializerMethodField()
    rooms = serializers.SerializerMethodField()
    is_preventivemaintenance = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    timezone = serializers.CharField(source='tenant.timezone', read_only=True)

    class Meta:
        model = Property
        fields = [
            'id',
            'tenant',
            'tenant_name',
            'timezone',
            'property_id',
            'name',
            'description',
            'created_at',
            'rooms',
            'is_preventivemaintenance',
            'can_edit',
        ]
        read_only_fields = ['property_id', 'created_at', 'is_preventivemaintenance']

    def get_can_edit(self, obj):
        request = self.context.get('request')
        return user_can_edit_property(getattr(request, 'user', None), obj)

    def validate(self, attrs):
        if self.instance and 'tenant' in attrs and attrs['tenant'] != self.instance.tenant:
            raise serializers.ValidationError({'tenant': 'Property ownership transfers require explicit operator approval.'})
        return attrs

    def get_rooms(self, obj):
        """Get rooms for this property.
        To reduce payload size on list views, rooms are only included when
        context['include_rooms'] is True. Otherwise, return an empty list.
        """
        include_rooms = self.context.get('include_rooms', False)
        if not include_rooms:
            return []
        rooms = obj.canonical_rooms.all()
        return RoomSummarySerializer(rooms, many=True, context=self.context).data

    def get_is_preventivemaintenance(self, obj):
        """
        Check if this property has any preventive maintenance jobs
        Only calculated if explicitly requested to avoid extra queries
        """
        calculate_pm = self.context.get('calculate_pm', False)
        if not calculate_pm:
            return None

        has_pm_jobs = Job.objects.filter(
            property=obj,
            is_preventivemaintenance=True
        ).exists()

        return has_pm_jobs


class TopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ['title', 'description', 'id', 'is_visible_in_create_job']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['id'] = data.get('id') or getattr(instance, 'id', None)
        data['title'] = data.get('title') or 'Untitled topic'
        data['description'] = data.get('description') or ''
        data['is_visible_in_create_job'] = bool(data.get('is_visible_in_create_job', True))
        return data


class AreaSerializer(serializers.ModelSerializer):
    property_id = serializers.SlugRelatedField(
        source='property',
        slug_field='property_id',
        queryset=Property.objects.all(),
        write_only=True,
    )
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_uuid = serializers.CharField(source='property.property_id', read_only=True)
    jobs_count = serializers.SerializerMethodField()

    class Meta:
        model = Area
        fields = [
            'id', 'name', 'description', 'is_active',
            'property', 'property_id', 'property_name', 'property_uuid',
            'jobs_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'property', 'created_at', 'updated_at', 'jobs_count']

    def get_jobs_count(self, obj):
        if hasattr(obj, 'jobs_count_value'):
            return obj.jobs_count_value
        return obj.jobs.count()

    def validate(self, data):
        _validate_request_property_access(self, data.get('property') or getattr(self.instance, 'property', None))
        return data


class AreaSummarySerializer(serializers.ModelSerializer):
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)

    class Meta:
        model = Area
        fields = ['id', 'name', 'is_active', 'property_id', 'property_name']
        read_only_fields = fields
