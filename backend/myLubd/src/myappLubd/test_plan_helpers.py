"""Canonical commercial-plan setup shared by entitlement-aware tests."""

from datetime import timedelta

from django.utils import timezone

from .models import SubscriptionPlan, TenantSubscription
from .plan_capabilities import PLAN_FEATURES


ENABLED_FEATURES = {
    'starter': set(),
    'pro': {
        'preventive_maintenance', 'pm_schedules', 'technician_kpi',
        'advanced_reports', 'csv_export',
    },
    'enterprise': {
        'preventive_maintenance', 'pm_schedules', 'technician_kpi',
        'advanced_reports', 'csv_export', 'multi_property',
        'advanced_property_permissions',
    },
}

PLAN_DEFAULTS = {
    'starter': {'name': 'Basic', 'max_users': 4, 'max_properties': 1},
    'pro': {'name': 'Pro', 'max_users': 10, 'max_properties': 1},
    'enterprise': {'name': 'Enterprise', 'max_users': 50, 'max_properties': 5},
}


def use_canonical_plan(tenant, code='pro'):
    """Assign a canonical plan, recreating flushed seed data when necessary."""
    enabled = ENABLED_FEATURES[code]
    plan, _ = SubscriptionPlan.objects.update_or_create(
        code=code,
        defaults={
            **PLAN_DEFAULTS[code],
            'features': {feature: feature in enabled for feature in PLAN_FEATURES},
        },
    )
    subscription, _ = TenantSubscription.objects.get_or_create(
        tenant=tenant,
        defaults={'plan': plan},
    )
    subscription.plan = plan
    subscription.status = 'active'
    subscription.current_period_end = timezone.localdate() + timedelta(days=30)
    subscription.save(update_fields=['plan', 'status', 'current_period_end', 'updated_at'])
    return subscription
