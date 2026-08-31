"""Observe/enforce primitives for future operational endpoint wiring."""

import logging

from django.conf import settings
from rest_framework.permissions import BasePermission, SAFE_METHODS

from .entitlements import get_tenant_entitlement
from .models import (
    Inventory,
    Job,
    PreventiveMaintenance,
    Property,
    Tenant,
    TenantSubscription,
)


logger = logging.getLogger(__name__)


def get_subscription_enforcement_mode():
    mode = str(getattr(settings, 'SUBSCRIPTION_ENFORCEMENT_MODE', 'observe')).lower()
    return mode if mode in {'off', 'observe', 'enforce'} else 'off'


def resolve_tenant_from_target(target):
    """Resolve one exact Tenant from a supported operational target.

    Ambiguous PMs deliberately resolve to ``None`` rather than selecting the
    first Tenant. Canonical PM validation should normally keep them within one
    Property/Tenant.
    """
    if target is None:
        return None
    if isinstance(target, Tenant):
        return target
    if isinstance(target, Property):
        return target.tenant
    if isinstance(target, Job):
        return target.property.tenant if target.property_id else None
    if isinstance(target, Inventory):
        return target.property.tenant if target.property_id else None
    if isinstance(target, PreventiveMaintenance):
        tenants = {}
        if target.job_id and target.job.property_id and target.job.property.tenant_id:
            tenants[target.job.property.tenant_id] = target.job.property.tenant
        if target.pk is not None:
            for machine in target.machines.select_related('property__tenant'):
                if machine.property_id and machine.property.tenant_id:
                    tenants[machine.property.tenant_id] = machine.property.tenant
        return next(iter(tenants.values())) if len(tenants) == 1 else None
    return None


def resolve_tenant_from_validated_data(validated_data):
    """Resolve create/update scope after serializer validation."""
    for key in ('tenant', '_resolved_property', 'property', 'job', 'inventory', 'preventive_maintenance'):
        tenant = resolve_tenant_from_target(validated_data.get(key))
        if tenant is not None:
            return tenant
    return None


def subscription_write_allowed(request, tenant):
    """Evaluate and observe one already-authorized target Tenant write."""
    mode = get_subscription_enforcement_mode()
    if mode == 'off' or request.method in SAFE_METHODS:
        return True

    entitlement = get_tenant_entitlement(tenant)
    would_block = not entitlement.can_write
    if would_block:
        try:
            subscription_status = tenant.subscription.status
        except (AttributeError, TenantSubscription.DoesNotExist):
            subscription_status = None
        logger.warning(
            'subscription_write_would_block',
            extra={
                'tenant_id': getattr(tenant, 'tenant_id', None),
                'subscription_status': subscription_status,
                'entitlement_level': entitlement.level.value,
                'reason_code': entitlement.reason_code,
                'request_method': request.method,
                'request_path': request.path,
                'user_id': getattr(getattr(request, 'user', None), 'pk', None),
                'would_block': True,
            },
        )
    return not (mode == 'enforce' and would_block)


class SubscriptionWritePermission(BasePermission):
    """Central future write gate; not yet attached to operational views."""

    message = 'Subscription payment required.'
    code = 'subscription_payment_required'

    def _resolve(self, request, view, obj=None):
        resolver = getattr(view, 'get_subscription_tenant', None)
        if resolver is None:
            return None
        return resolver(request, obj=obj)

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        resolver = getattr(view, 'get_subscription_tenant', None)
        if resolver is None:
            # The permission is reusable infrastructure, not a global gate.
            # A view opts in by defining an exact target-Tenant resolver.
            return True
        tenant = resolver(request, obj=None)
        # Create endpoints may only resolve after serializer validation. A
        # future operational mixin may explicitly defer this check and must
        # call subscription_write_allowed with resolve_tenant_from_validated_data
        # before saving. Every other opted-in unresolved write fails closed in
        # enforce mode and emits an observe-mode would-block log.
        if tenant is None and getattr(view, 'subscription_tenant_after_validation', False):
            return True
        return subscription_write_allowed(request, tenant)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        tenant = self._resolve(request, view, obj=obj)
        # An opted-in object endpoint must fail closed in enforce mode if its
        # target is ambiguous. Observe mode logs the unresolved state.
        return subscription_write_allowed(request, tenant)
