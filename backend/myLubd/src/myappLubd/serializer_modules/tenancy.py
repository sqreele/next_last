"""Tenancy definitions."""
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from ..models import Property, Tenant, TenantMembership, SubscriptionPlan, TenantSubscription, UsageMetric
from django.contrib.auth import get_user_model
from ..timezones import is_valid_timezone
from ..tenancy import user_can_access_billing
from .users import UserSummarySerializer

User = get_user_model()


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = [
            'id', 'code', 'name', 'description', 'monthly_price', 'billing_interval',
            'max_properties', 'max_users', 'max_monthly_work_orders', 'max_assets',
            'max_storage_mb', 'max_pm_schedules', 'allow_offline_mode',
            'allow_advanced_analytics', 'allow_api_access', 'is_active',
            'sort_order', 'features',
        ]
        read_only_fields = ['id']


class TenantSubscriptionSerializer(serializers.ModelSerializer):
    plan = SubscriptionPlanSerializer(read_only=True)

    class Meta:
        model = TenantSubscription
        fields = [
            'id', 'tenant', 'plan', 'status', 'current_period_start',
            'current_period_end', 'trial_ends_at', 'grace_period_ends_at',
            'cancel_at_period_end', 'created_at', 'updated_at',
        ]
        # This API is a status projection, not billing authority. Provider and
        # lifecycle fields are managed only through platform administration.
        read_only_fields = [
            'id', 'tenant', 'plan', 'status', 'current_period_start',
            'current_period_end', 'trial_ends_at', 'grace_period_ends_at',
            'cancel_at_period_end', 'created_at', 'updated_at',
        ]


class TenantMembershipSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='user',
        write_only=True,
    )
    properties = serializers.PrimaryKeyRelatedField(
        queryset=Property.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = TenantMembership
        fields = [
            'id', 'tenant', 'user', 'user_id', 'role', 'is_active',
            'properties', 'invited_by', 'created_at', 'updated_at',
            'can_manage_company_billing',
        ]
        read_only_fields = ['id', 'invited_by', 'created_at', 'updated_at']

    def validate(self, attrs):
        tenant = attrs.get('tenant', self.instance.tenant if self.instance else None)
        if self.instance and tenant != self.instance.tenant:
            raise serializers.ValidationError({'tenant': 'Membership transfers require explicit operator approval.'})
        role = attrs.get('role', self.instance.role if self.instance else '')
        if role == 'technician' and attrs.get('can_manage_company_billing', False):
            raise serializers.ValidationError('Technicians cannot manage Company billing.')
        return attrs


class UsageMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = UsageMetric
        fields = [
            'id', 'tenant', 'period_start', 'period_end', 'property_count',
            'active_user_count', 'work_order_count', 'asset_count',
            'pm_schedule_count', 'storage_mb', 'calculated_at',
        ]
        read_only_fields = ['id', 'calculated_at']


class TenantSerializer(serializers.ModelSerializer):
    subscription = serializers.SerializerMethodField()
    property_count = serializers.IntegerField(read_only=True)
    active_user_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tenant
        fields = [
            'id', 'tenant_id', 'name', 'slug', 'status', 'owner',
            'billing_email', 'timezone', 'metadata', 'subscription',
            'billing_model', 'billing_currency',
            'property_count', 'active_user_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tenant_id', 'slug', 'owner', 'created_at', 'updated_at', 'billing_model', 'billing_currency']

    def validate(self, attrs):
        billing_fields = {'billing_email', 'status'} & set(attrs)
        if billing_fields:
            request = self.context.get('request')
            user = getattr(request, 'user', None)
            allowed = (
                user_can_access_billing(user, self.instance)
                if self.instance is not None
                else bool(getattr(user, 'is_superuser', False))
            )
            if not allowed:
                raise PermissionDenied(
                    'You do not have permission to update tenant billing fields.'
                )
        return attrs

    def get_subscription(self, obj):
        request = self.context.get('request')
        if not user_can_access_billing(getattr(request, 'user', None), obj):
            return None
        try:
            subscription = obj.subscription
        except TenantSubscription.DoesNotExist:
            return None
        return TenantSubscriptionSerializer(subscription, context=self.context).data

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        request = self.context.get('request')
        if not user_can_access_billing(getattr(request, 'user', None), instance):
            for field in ('billing_email', 'status', 'subscription'):
                representation.pop(field, None)
        return representation

    def validate_timezone(self, value):
        if not is_valid_timezone(value):
            raise serializers.ValidationError(
                "Use a valid IANA timezone name, for example 'Asia/Bangkok' or 'UTC'."
            )
        return value
