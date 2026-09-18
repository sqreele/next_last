"""Tenant and billing helpers for SaaS-scoped access control."""

from dataclasses import dataclass
from datetime import timezone as datetime_timezone
from zoneinfo import ZoneInfo

from django.core.exceptions import PermissionDenied
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from .models import (
    Job,
    Machine,
    Inventory,
    JobImage,
    PMMasterPlan,
    PreventiveMaintenance,
    Property,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
)


TENANT_ADMIN_ROLES = {'owner', 'admin', 'billing'}
TENANT_OPERATOR_ROLES = {'owner', 'admin', 'manager', 'supervisor', 'technician'}
BILLING_ACCESS_ROLES = {'admin', 'manager'}
CAN_REASSIGN_JOB_ROLES = {'owner', 'admin', 'manager', 'supervisor'}
# These are the existing roles which intentionally see every property in a
# tenant.  Keep this decision here rather than duplicating role checks in API
# views.
TENANT_WIDE_PROPERTY_ROLES = {'owner', 'admin', 'manager'}
TENANT_MEMBERSHIP_GRANT_ADMIN_ROLES = {'owner', 'admin', 'manager'}
# PM master plans are configuration, rather than day-to-day operational work.
# Keep this capability separate from TENANT_OPERATOR_ROLES: supervisors and
# technicians can operate assigned work, but cannot change recurring rules.
PM_MASTER_MANAGE_ROLES = {'owner', 'admin', 'manager'}
INVENTORY_STOCK_MANAGE_ROLES = {'owner', 'admin', 'manager'}
INVENTORY_CONSUME_ROLES = {'owner', 'admin', 'manager', 'supervisor', 'technician'}


@dataclass(frozen=True)
class TenantUserCapacity:
    """Current user-seat capacity for one exact Tenant."""

    current_count: int
    limit: int | None
    remaining: int | None
    can_add: bool
    plan_id: int
    plan_code: str

    @property
    def max_users(self):
        """Compatibility alias for callers using the model field name."""
        return self.limit


class SubscriptionUserLimitReached(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'subscription_user_limit_reached'

    def __init__(self, capacity):
        message = f'Your current plan allows up to {capacity.limit} users.'
        # APIException normally coerces every leaf to ErrorDetail (a string).
        # Keep the public numeric contract numeric after initializing the base
        # exception and before DRF's exception handler reads ``detail``.
        super().__init__(detail=message, code=self.default_code)
        self.detail = {
            'code': self.default_code,
            'detail': message,
            'limit': int(capacity.limit),
        }


class SubscriptionLimitReached(APIException):
    """Stable API error for quantitative commercial usage limits."""

    status_code = status.HTTP_409_CONFLICT
    default_code = 'subscription_limit_reached'

    def __init__(self, limit_key, current, limit, detail=None):
        super().__init__(detail=detail or f'Subscription limit reached for {limit_key}.', code=self.default_code)
        self.detail = {
            'code': self.default_code,
            'limit': limit_key,
            'current': current,
            'limit_value': limit,
            'detail': detail or f'Subscription limit reached for {limit_key}.',
        }


def get_user_tenant_memberships(user):
    if not getattr(user, 'is_authenticated', False):
        return TenantMembership.objects.none()
    return (
        TenantMembership.objects.select_related('tenant', 'user')
        .prefetch_related('properties')
        .filter(user=user, is_active=True)
    )


def get_user_tenants(user):
    if not getattr(user, 'is_authenticated', False):
        return Tenant.objects.none()
    if user.is_superuser:
        return Tenant.objects.all()
    return Tenant.objects.filter(memberships__user=user, memberships__is_active=True).distinct()


def get_billing_tenants(user):
    """Return tenants where the user has canonical Billing access."""
    if not getattr(user, 'is_authenticated', False):
        return Tenant.objects.none()
    if user.is_superuser:
        return Tenant.objects.all()
    return Tenant.objects.filter(
        memberships__user=user,
        memberships__is_active=True,
        memberships__role__in=BILLING_ACCESS_ROLES,
    ).distinct()


def user_can_access_billing(user, tenant=None):
    """Authorize Billing via active TenantMembership, with platform break-glass."""
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser:
        return True
    tenants = get_billing_tenants(user)
    if tenant is None:
        return tenants.exists()
    return tenants.filter(pk=tenant.pk).exists()


def get_active_membership(user, tenant):
    """Return a user's active membership for ``tenant``, if any.

    This is the canonical tenant gate for request-facing code.  Platform staff
    are deliberately handled by callers as an existing global-admin bypass;
    they are not treated as tenant members.
    """
    if not getattr(user, 'is_authenticated', False) or tenant is None:
        return None
    return get_user_tenant_memberships(user).filter(tenant=tenant).first()


def membership_can_access_all_properties(membership):
    return bool(membership and membership.is_active and membership.role in TENANT_WIDE_PROPERTY_ROLES)


def get_primary_tenant(user):
    if not getattr(user, 'is_authenticated', False):
        return None
    owned = Tenant.objects.filter(owner=user).first()
    if owned:
        return owned
    membership = get_user_tenant_memberships(user).order_by('created_at').first()
    if membership:
        return membership.tenant
    return None


def user_can_manage_tenant(user, tenant):
    if not getattr(user, 'is_authenticated', False) or tenant is None:
        return False
    if user.is_superuser:
        return True
    return TenantMembership.objects.filter(
        tenant=tenant,
        user=user,
        is_active=True,
        role__in=TENANT_ADMIN_ROLES,
    ).exists()


def can_manage_membership_property_grants(user, tenant):
    """Return whether a principal may create tenant membership grants.

    Managers share invitation membership-grant authority with owners and
    admins. Billing access and Django ``is_staff`` remain excluded. Platform
    superusers remain the explicit break-glass path.
    """
    if not getattr(user, 'is_authenticated', False) or tenant is None:
        return False
    if user.is_superuser:
        return True
    return TenantMembership.objects.filter(
        tenant=tenant,
        user=user,
        is_active=True,
        role__in=TENANT_MEMBERSHIP_GRANT_ADMIN_ROLES,
    ).exists()


def user_can_manage_pm_master(user, property_obj):
    """Return whether ``user`` may change PM master plans for one Property.

    The decision is deliberately derived from the active membership that
    belongs to the property's tenant.  ``is_staff`` and client role claims
    are not inputs; Django superuser retains the established break-glass path.
    """
    if not getattr(user, 'is_authenticated', False) or property_obj is None:
        return False
    if user.is_superuser:
        return True
    return TenantMembership.objects.filter(
        tenant_id=property_obj.tenant_id,
        user=user,
        is_active=True,
        role__in=PM_MASTER_MANAGE_ROLES,
    ).exists() and get_accessible_properties(user).filter(pk=property_obj.pk).exists()


def _user_has_inventory_capability(user, property_obj, roles):
    if not getattr(user, 'is_authenticated', False) or property_obj is None:
        return False
    if user.is_superuser:
        return True
    return TenantMembership.objects.filter(
        tenant_id=property_obj.tenant_id,
        user=user,
        is_active=True,
        role__in=roles,
    ).exists() and get_accessible_properties(user).filter(pk=property_obj.pk).exists()


def user_can_manage_inventory_stock(user, property_obj):
    """Authorize inventory creation, stock increases, adjustments, and deletion."""
    return _user_has_inventory_capability(user, property_obj, INVENTORY_STOCK_MANAGE_ROLES)


def user_can_consume_inventory(user, property_obj):
    """Authorize a positive, property-scoped inventory consumption."""
    return _user_has_inventory_capability(user, property_obj, INVENTORY_CONSUME_ROLES)


def get_accessible_properties(user, tenant=None):
    """Return the sole property queryset used for authorization.

    Tenant-backed properties require an active TenantMembership.  Restricted
    roles receive only the membership's ``properties`` M2M; owner/admin/
    manager roles have explicit tenant-wide access.  Direct legacy property
    relations are deliberately not authorization inputs.
    """
    if not getattr(user, 'is_authenticated', False):
        return Property.objects.none()
    if user.is_superuser:
        qs = Property.objects.all()
        return qs.filter(tenant=tenant) if tenant is not None else qs

    # A membership property grant must belong to the same active membership;
    # the old implementation accidentally matched any active membership for
    # the user because the two joins were independent.
    tenant_member_property_q = Q(
        tenant_memberships__user=user,
        tenant_memberships__is_active=True,
        tenant_memberships__tenant=models.F('tenant'),
    )
    tenant_wide_q = Q(
        tenant__memberships__user=user,
        tenant__memberships__is_active=True,
        tenant__memberships__role__in=TENANT_WIDE_PROPERTY_ROLES,
    )
    qs = Property.objects.filter(tenant_member_property_q | tenant_wide_q).distinct()
    return qs.filter(tenant=tenant) if tenant is not None else qs


def get_operable_properties(user, tenant=None):
    """Properties on which the user may perform operational writes."""
    if not getattr(user, 'is_authenticated', False):
        return Property.objects.none()
    if user.is_superuser:
        qs = Property.objects.all()
        return qs.filter(tenant=tenant) if tenant is not None else qs

    assigned_operator_q = Q(
        tenant_memberships__user=user,
        tenant_memberships__is_active=True,
        tenant_memberships__role__in=TENANT_OPERATOR_ROLES,
        tenant_memberships__tenant=models.F('tenant'),
    )
    tenant_wide_operator_q = Q(
        tenant__memberships__user=user,
        tenant__memberships__is_active=True,
        tenant__memberships__role__in=TENANT_WIDE_PROPERTY_ROLES & TENANT_OPERATOR_ROLES,
    )
    qs = Property.objects.filter(assigned_operator_q | tenant_wide_operator_q).distinct()
    return qs.filter(tenant=tenant) if tenant is not None else qs


def get_job_reassignable_properties(user, tenant=None):
    """Properties on which the user may reassign Jobs.

    Reassignment is narrower than general operational writes: technicians may
    update work assigned to them but may not choose another assignee. Owners,
    admins, and managers retain tenant-wide access, while supervisors must have
    an explicit grant from their active membership for the Job's Property.
    """
    if not getattr(user, 'is_authenticated', False):
        return Property.objects.none()
    if user.is_superuser:
        qs = Property.objects.all()
        return qs.filter(tenant=tenant) if tenant is not None else qs

    assigned_reassigner_q = Q(
        tenant_memberships__user=user,
        tenant_memberships__is_active=True,
        tenant_memberships__role__in=CAN_REASSIGN_JOB_ROLES,
        tenant_memberships__tenant=models.F('tenant'),
    )
    tenant_wide_reassigner_q = Q(
        tenant__memberships__user=user,
        tenant__memberships__is_active=True,
        tenant__memberships__role__in=TENANT_WIDE_PROPERTY_ROLES & CAN_REASSIGN_JOB_ROLES,
    )
    qs = Property.objects.filter(
        assigned_reassigner_q | tenant_wide_reassigner_q
    ).distinct()
    return qs.filter(tenant=tenant) if tenant is not None else qs


def get_property_summary_recipients(property_obj):
    """Return unique users authorized to receive one property's summary.

    Recipients are derived solely from active memberships.
    """
    user_model = TenantMembership._meta.get_field('user').remote_field.model
    if property_obj is None:
        return user_model.objects.none()
    return user_model.objects.filter(
        Q(
            tenant_memberships__is_active=True,
            tenant_memberships__tenant_id=property_obj.tenant_id,
            tenant_memberships__properties=property_obj,
        )
        | Q(
            tenant_memberships__is_active=True,
            tenant_memberships__tenant_id=property_obj.tenant_id,
            tenant_memberships__role__in=TENANT_WIDE_PROPERTY_ROLES,
        )
    ).distinct()


def get_property_summary_email_users(property_obj):
    """Return active, opted-in users authorized for a property summary."""
    return (
        get_property_summary_recipients(property_obj)
        .filter(is_active=True)
        .exclude(email__isnull=True)
        .exclude(email__exact='')
        .filter(
            Q(userprofile__email_notifications_enabled=True)
            | Q(userprofile__isnull=True)
        )
        .distinct()
    )


def user_can_access_property(user, property_obj):
    if property_obj is None:
        return False
    return get_accessible_properties(user).filter(pk=property_obj.pk).exists()


def accessible_property_ids(user):
    if user.is_superuser:
        return None
    return set(get_accessible_properties(user).values_list('id', flat=True))


def ensure_default_plan():
    return SubscriptionPlan.objects.get_or_create(
        code='starter',
        defaults={
            'name': 'Basic',
            'description': 'For small hotel teams that need a simple and reliable way to manage daily maintenance work.',
            'monthly_price': '15.00',
            'max_properties': 1,
            'max_users': 4,
            'max_monthly_work_orders': 500,
            'max_assets': 250,
            'max_storage_mb': 10240,
            'max_pm_schedules': 100,
            'allow_offline_mode': False,
            'allow_advanced_analytics': False,
        },
    )[0]


def ensure_tenant_for_user(user, name=None):
    tenant = get_primary_tenant(user)
    if tenant:
        return tenant

    tenant_name = name or getattr(user, 'property_name', None) or f"{user.get_username()}'s Account"
    tenant = Tenant.objects.create(
        name=tenant_name,
        owner=user,
        billing_email=getattr(user, 'email', '') or None,
        status='trialing',
    )
    TenantMembership.objects.create(tenant=tenant, user=user, role='owner')
    TenantSubscription.objects.create(tenant=tenant, plan=ensure_default_plan(), status='trialing')
    return tenant


def ensure_tenant_for_property(property_obj, user=None):
    if property_obj.tenant_id:
        return property_obj.tenant
    if user and getattr(user, 'is_authenticated', False):
        tenant = ensure_tenant_for_user(user, name=property_obj.name)
    else:
        tenant = Tenant.objects.create(name=f"{property_obj.name} Account", status='trialing')
        TenantSubscription.objects.create(tenant=tenant, plan=ensure_default_plan(), status='trialing')
    with transaction.atomic():
        locked_tenant = Tenant.objects.select_for_update().get(pk=tenant.pk)
        locked_property = Property.objects.select_for_update().get(pk=property_obj.pk)
        if locked_property.tenant_id:
            return locked_property.tenant
        membership = None
        if user and getattr(user, 'is_authenticated', False):
            membership = TenantMembership.objects.select_for_update().filter(
                tenant=locked_tenant,
                user=user,
            ).first()
            if membership is None:
                enforce_tenant_user_limit(locked_tenant)
        locked_property.tenant = locked_tenant
        locked_property.save(update_fields=['tenant'])
        property_obj.tenant = locked_tenant
        if user and getattr(user, 'is_authenticated', False):
            if membership is None:
                membership = TenantMembership.objects.create(
                    tenant=locked_tenant,
                    user=user,
                    role='owner',
                )
            membership.properties.add(locked_property)
    return locked_tenant


def _tenant_month_bounds(tenant, at=None):
    """Return the current tenant-local month as UTC-aware bounds."""
    at = at or timezone.now()
    tzinfo = ZoneInfo(str(getattr(tenant, 'timezone', '') or 'UTC'))
    local_at = timezone.localtime(at, tzinfo)
    start_local = local_at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start_local.month == 12:
        next_local = start_local.replace(year=start_local.year + 1, month=1)
    else:
        next_local = start_local.replace(month=start_local.month + 1)
    return start_local.astimezone(datetime_timezone.utc), next_local.astimezone(datetime_timezone.utc)


def get_monthly_job_usage(tenant, at=None):
    start, end = _tenant_month_bounds(tenant, at=at)
    return Job.objects.filter(
        property__tenant=tenant,
        created_at__gte=start,
        created_at__lt=end,
    ).count()


def get_pm_schedule_usage(tenant):
    """Count recurring/master PM schedules, not generated occurrences."""
    return PMMasterPlan.objects.filter(
        machines__property__tenant=tenant,
    ).distinct().count()


def get_asset_usage(tenant):
    return Machine.objects.filter(property__tenant=tenant).count()


def _tenant_file_records(tenant):
    """Yield (field file, tenant) for every tenant-owned media family."""
    for image in JobImage.objects.filter(job__property__tenant=tenant).select_related('job__property__tenant'):
        if image.image:
            yield image.image

    pm_qs = PreventiveMaintenance.objects.filter(
        Q(job__property__tenant=tenant) | Q(machines__property__tenant=tenant),
    ).distinct().prefetch_related('machines__property')
    for pm in pm_qs:
        if pm.before_image:
            yield pm.before_image
        if pm.after_image:
            yield pm.after_image
        for image in pm.images.all():
            if image.image:
                yield image.image

    for machine in Machine.objects.filter(property__tenant=tenant):
        if machine.image:
            yield machine.image

    for item in Inventory.objects.filter(property__tenant=tenant):
        if item.image:
            yield item.image

    # Workspace reports are property-linked tenant media. They are currently
    # admin-oriented, but must remain part of authoritative accounting.
    from .models import WorkspaceReport
    report_fields = [f'image_{index}' for index in range(1, 16)]
    for report in WorkspaceReport.objects.filter(property__tenant=tenant):
        for field_name in report_fields:
            field_file = getattr(report, field_name, None)
            if field_file:
                yield field_file


def get_tenant_storage_usage_bytes(tenant):
    total = 0
    for field_file in _tenant_file_records(tenant):
        try:
            total += int(field_file.size or 0)
        except (OSError, ValueError):
            # A missing external object contributes no stored bytes; the DB
            # record remains visible and can be repaired independently.
            continue
    return total


def enforce_storage_limit(tenant, additional_bytes):
    if tenant is None or not additional_bytes:
        return
    try:
        subscription = tenant.subscription
    except TenantSubscription.DoesNotExist:
        # Legacy/unprovisioned tenants are handled by the existing lifecycle
        # gate; quantitative limits apply once a commercial subscription row
        # exists, preserving read/write compatibility for bootstrap flows.
        return
    from .entitlements import get_tenant_entitlement

    if not get_tenant_entitlement(tenant).can_write:
        raise PermissionDenied("This tenant's subscription is not active.")
    limit_mb = subscription.plan.max_storage_mb
    if limit_mb is None:
        return
    current = get_tenant_storage_usage_bytes(tenant)
    limit_bytes = int(limit_mb) * 1024 * 1024
    if current + int(additional_bytes) > limit_bytes:
        raise SubscriptionLimitReached(
            'max_storage_mb',
            current,
            limit_mb,
            detail=f'Subscription storage limit reached: {current + int(additional_bytes)} bytes exceeds {limit_mb} MB.',
        )


def tenant_usage_counts(tenant, at=None):
    storage_bytes = get_tenant_storage_usage_bytes(tenant)
    properties = Property.objects.filter(tenant=tenant)
    return {
        'max_properties': properties.count(),
        'max_users': TenantMembership.objects.filter(tenant=tenant, is_active=True).count(),
        'max_monthly_work_orders': get_monthly_job_usage(tenant, at=at),
        'max_assets': get_asset_usage(tenant),
        'max_pm_schedules': get_pm_schedule_usage(tenant),
        'max_storage_mb': round(storage_bytes / (1024 * 1024), 2),
        'storage_bytes': storage_bytes,
    }


def tenant_limit_snapshot(tenant, at=None, usage_counts=None):
    """Return provider-safe quantitative limits, usage, and remaining values."""
    try:
        subscription = tenant.subscription
    except TenantSubscription.DoesNotExist:
        subscription = None
    plan = getattr(subscription, 'plan', None)
    usage_counts = usage_counts or tenant_usage_counts(tenant, at=at)
    usage = {
        'monthly_work_orders': usage_counts['max_monthly_work_orders'],
        'pm_schedules': usage_counts['max_pm_schedules'],
        'assets': usage_counts['max_assets'],
        'storage_mb': usage_counts['max_storage_mb'],
    }
    limits = {
        'monthly_work_orders': getattr(plan, 'max_monthly_work_orders', None),
        'pm_schedules': getattr(plan, 'max_pm_schedules', None),
        'assets': getattr(plan, 'max_assets', None),
        'storage_mb': getattr(plan, 'max_storage_mb', None),
    }
    remaining = {
        key: None if value is None else max(value - usage[key], 0)
        for key, value in limits.items()
    }
    return {'limits': limits, 'usage': usage, 'remaining': remaining}


def get_tenant_user_capacity(tenant, increment=1):
    """Return active-member capacity for exactly ``tenant``.

    Callers that can create or reactivate a membership must lock the Tenant
    before evaluating this helper. Pending invitations, global users, Auth0
    identities, and property grants are deliberately not counted.
    """
    if tenant is None or tenant.pk is None:
        raise PermissionDenied("This tenant does not have a subscription.")
    try:
        subscription = TenantSubscription.objects.select_related('plan').get(
            tenant_id=tenant.pk,
        )
    except TenantSubscription.DoesNotExist as exc:
        raise PermissionDenied("This tenant does not have a subscription.") from exc

    current_count = TenantMembership.objects.filter(
        tenant_id=tenant.pk,
        is_active=True,
    ).count()
    limit = subscription.plan.max_users
    can_add = limit is None or current_count + increment <= limit
    return TenantUserCapacity(
        current_count=current_count,
        limit=limit,
        remaining=None if limit is None else max(limit - current_count, 0),
        can_add=can_add,
        plan_id=subscription.plan_id,
        plan_code=subscription.plan.code,
    )


def enforce_tenant_user_limit(tenant, increment=1):
    capacity = get_tenant_user_capacity(tenant, increment=increment)
    if not capacity.can_add:
        raise SubscriptionUserLimitReached(capacity)
    return capacity


def lock_tenants_for_membership_change(*tenants):
    """Lock exact source/destination Tenants in deterministic primary-key order.

    This helper must be called inside ``transaction.atomic()``. Locking the
    Tenant serializes both the count and an otherwise-absent membership insert.
    """
    tenant_ids = sorted({
        tenant.pk if isinstance(tenant, Tenant) else int(tenant)
        for tenant in tenants
        if tenant is not None
    })
    locked = list(
        Tenant.objects.select_for_update()
        .filter(pk__in=tenant_ids)
        .order_by('pk')
    )
    if len(locked) != len(tenant_ids):
        raise PermissionDenied("One or more tenants are unavailable.")
    return {tenant.pk: tenant for tenant in locked}


def enforce_subscription_limit(tenant, limit_key, increment=1):
    if tenant is None:
        return
    if limit_key == 'max_users':
        return enforce_tenant_user_limit(tenant, increment=increment)
    try:
        subscription = tenant.subscription
    except TenantSubscription.DoesNotExist:
        if limit_key in {'max_monthly_work_orders', 'max_pm_schedules', 'max_assets', 'max_storage_mb'}:
            return
        # Runtime authorization must never provision paid authority. Tenant
        # bootstrap paths explicitly create their subscription instead.
        raise PermissionDenied("This tenant does not have a subscription.")

    from .entitlements import get_tenant_entitlement

    if not get_tenant_entitlement(tenant).can_write:
        raise PermissionDenied("This tenant's subscription is not active.")

    if limit_key == 'max_storage_mb':
        return enforce_storage_limit(tenant, increment)
    usage_helpers = {
        'max_properties': lambda: Property.objects.filter(tenant=tenant).count(),
        'max_monthly_work_orders': lambda: get_monthly_job_usage(tenant),
        'max_pm_schedules': lambda: get_pm_schedule_usage(tenant),
        'max_assets': lambda: get_asset_usage(tenant),
    }
    current = usage_helpers.get(limit_key, lambda: tenant_usage_counts(tenant).get(limit_key, 0))()
    allowed, limit = subscription.check_limit(limit_key, current, increment=increment)
    if not allowed and limit_key in {'max_monthly_work_orders', 'max_pm_schedules', 'max_assets'}:
        raise SubscriptionLimitReached(
            limit_key,
            current,
            limit,
            detail=f'Subscription limit reached for {limit_key}: {current}/{limit}.',
        )
    if not allowed:
        raise ValidationError({
            'billing_limit': f"Subscription limit reached for {limit_key}: {current}/{limit}.",
            'limit_key': limit_key,
            'current': current,
            'limit': limit,
        })
