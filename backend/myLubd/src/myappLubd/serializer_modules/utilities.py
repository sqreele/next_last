"""Utilities definitions."""
from rest_framework import serializers
from ..models import Property, UtilityConsumption
from .shared import _validate_request_property_access, get_user_display_name, get_user_public_username


_UTILITY_DECIMAL_KWARGS = dict(
    max_digits=10,
    decimal_places=2,
    coerce_to_string=False,
    allow_null=True,
    required=False,
)


class UtilityConsumptionSerializer(serializers.ModelSerializer):
    """Serializer for Utility Consumption records"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property = serializers.PrimaryKeyRelatedField(read_only=True)
    property_id = serializers.SlugRelatedField(
        source='property', slug_field='property_id', queryset=Property.objects.all()
    )
    month_display = serializers.CharField(source='get_month_display', read_only=True)
    created_by_username = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    totalkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    onpeakkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    offpeakkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    totalelectricity = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    electricity_cost_budget = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    water = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    nightsale = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)

    class Meta:
        model = UtilityConsumption
        fields = [
            'id',
            'property',
            'property_id',
            'property_name',
            'month',
            'month_display',
            'year',
            'totalkwh',
            'onpeakkwh',
            'offpeakkwh',
            'totalelectricity',
            'electricity_cost_budget',
            'water',
            'nightsale',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_username',
            'created_by_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return get_user_display_name(obj.created_by)

    def get_created_by_username(self, obj):
        return get_user_public_username(obj.created_by)

    def validate(self, data):
        """Validate that property is provided"""
        property_obj = data.get('property') or getattr(self.instance, 'property', None)
        if not property_obj:
            raise serializers.ValidationError({
                'property': 'Property must be provided.'
            })
        _validate_request_property_access(self, property_obj)

        # Validate month range
        month = data.get('month')
        if month and (month < 1 or month > 12):
            raise serializers.ValidationError({
                'month': 'Month must be between 1 and 12.'
            })

        for field in (
            'totalkwh', 'onpeakkwh', 'offpeakkwh', 'totalelectricity',
            'electricity_cost_budget', 'water', 'nightsale',
        ):
            value = data.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: 'Value cannot be negative.'})

        return data


class UtilityConsumptionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing utility consumption records"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    month_display = serializers.CharField(source='get_month_display', read_only=True)
    totalkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    onpeakkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    offpeakkwh = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    totalelectricity = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    electricity_cost_budget = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    water = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)
    nightsale = serializers.DecimalField(**_UTILITY_DECIMAL_KWARGS)

    class Meta:
        model = UtilityConsumption
        fields = [
            'id',
            'property_id',
            'property_name',
            'month',
            'month_display',
            'year',
            'totalkwh',
            'onpeakkwh',
            'offpeakkwh',
            'totalelectricity',
            'electricity_cost_budget',
            'water',
            'nightsale',
            'created_at',
            'updated_at'
        ]
