"""Commercial plan capabilities, separate from lifecycle and usage limits."""

from rest_framework import status
from rest_framework.exceptions import APIException

from .models import Property, TenantMembership, TenantSubscription


PLAN_FEATURES = (
    'preventive_maintenance',
    'pm_schedules',
    'technician_kpi',
    'advanced_reports',
    'csv_export',
    'multi_property',
    'advanced_property_permissions',
    'portfolio_dashboard',
)

# Portfolio dashboard is intentionally present but false for every plan until
# the product is implemented. Unknown/missing values are always fail-closed.
DEFAULT_CAPABILITIES = {feature: False for feature in PLAN_FEATURES}


class PlanFeatureNotAvailable(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'feature_not_available'

    def __init__(self, feature):
        detail = 'This feature is not available on your current plan.'
        super().__init__(detail=detail, code=self.default_code)
        self.detail = {
            'code': self.default_code,
            'feature': feature,
            'detail': detail,
        }


def get_plan_capabilities(plan_or_subscription):
    """Return a complete, boolean-only map for a plan or subscription."""
    plan = getattr(plan_or_subscription, 'plan', plan_or_subscription)
    configured = getattr(plan, 'features', None) or {}
    # Only the canonical commercial plans use fail-closed defaults. Preserve
    # access for pre-existing internal/custom plans until each is explicitly
    # assigned a capability map; portfolio remains unavailable everywhere.
    legacy_default = getattr(plan, 'code', None) not in {'starter', 'pro', 'enterprise', None}
    return {
        feature: bool(configured.get(
            feature,
            legacy_default and feature != 'portfolio_dashboard',
        ))
        for feature in PLAN_FEATURES
    }


def tenant_has_feature(tenant, feature):
    if feature not in PLAN_FEATURES or tenant is None:
        return False
    try:
        subscription = tenant.subscription
    except TenantSubscription.DoesNotExist:
        return False
    return get_plan_capabilities(subscription).get(feature, False)


def require_plan_feature(tenant, feature):
    if not tenant_has_feature(tenant, feature):
        raise PlanFeatureNotAvailable(feature)


def resolve_request_tenant(request, *, property_id=None):
    """Resolve an already-authorized request's tenant without widening access."""
    property_ref = (
        property_id
        or request.query_params.get('property_id')
        or (request.data.get('property_id') if hasattr(request.data, 'get') else None)
    )
    if property_ref:
        prop = Property.objects.select_related('tenant').filter(
            property_id=property_ref,
            tenant__memberships__user=request.user,
            tenant__memberships__is_active=True,
        ).first()
        if prop:
            return prop.tenant
    membership = (
        TenantMembership.objects.select_related('tenant')
        .filter(user=request.user, is_active=True)
        .order_by('id')
        .first()
    )
    return membership.tenant if membership else None


def require_request_feature(request, feature, *, property_id=None):
    if request.user.is_superuser:
        return
    require_plan_feature(
        resolve_request_tenant(request, property_id=property_id),
        feature,
    )
