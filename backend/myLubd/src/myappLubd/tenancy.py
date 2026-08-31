"""Tenant and billing helpers for SaaS-scoped access control."""

from django.core.exceptions import PermissionDenied
from django.db import models
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import (
    Job,
    Machine,
    PreventiveMaintenance,
    Property,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
)


TENANT_ADMIN_ROLES = {'owner', 'admin', 'billing'}
TENANT_OPERATOR_ROLES = {'owner', 'admin', 'manager', 'supervisor', 'technician'}
# These are the existing roles which intentionally see every property in a
# tenant.  Keep this decision here rather than duplicating role checks in API
# views.
TENANT_WIDE_PROPERTY_ROLES = {'owner', 'admin', 'manager'}
TENANT_MEMBERSHIP_GRANT_ADMIN_ROLES = {'owner', 'admin'}


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

    Billing access and Django ``is_staff`` are deliberately not invitation or
    membership-grant authority. Platform superusers remain the explicit
    break-glass path.
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
            'name': 'Starter',
            'description': 'Starter plan for a single property maintenance team.',
            'max_properties': 1,
            'max_users': 10,
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
    property_obj.tenant = tenant
    property_obj.save(update_fields=['tenant'])
    if user and getattr(user, 'is_authenticated', False):
        membership, _ = TenantMembership.objects.get_or_create(
            tenant=tenant,
            user=user,
            defaults={'role': 'owner'},
        )
        membership.properties.add(property_obj)
    return tenant


def tenant_usage_counts(tenant):
    start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    properties = Property.objects.filter(tenant=tenant)
    return {
        'max_properties': properties.count(),
        'max_users': TenantMembership.objects.filter(tenant=tenant, is_active=True).count(),
        'max_monthly_work_orders': Job.objects.filter(
            property__tenant=tenant,
            created_at__gte=start,
        ).distinct().count(),
        'max_assets': Machine.objects.filter(property__tenant=tenant).count(),
        'max_pm_schedules': PreventiveMaintenance.objects.filter(
            Q(job__property__tenant=tenant) | Q(machines__property__tenant=tenant)
        ).distinct().count(),
    }


def enforce_subscription_limit(tenant, limit_key, increment=1):
    if tenant is None:
        return
    try:
        subscription = tenant.subscription
    except TenantSubscription.DoesNotExist:
        # Runtime authorization must never provision paid authority. Tenant
        # bootstrap paths explicitly create their subscription instead.
        raise PermissionDenied("This tenant does not have a subscription.")

    from .entitlements import get_tenant_entitlement

    if not get_tenant_entitlement(tenant).can_write:
        raise PermissionDenied("This tenant's subscription is not active.")

    usage = tenant_usage_counts(tenant)
    current = usage.get(limit_key, 0)
    allowed, limit = subscription.check_limit(limit_key, current, increment=increment)
    if not allowed:
        raise ValidationError({
            'billing_limit': f"Subscription limit reached for {limit_key}: {current}/{limit}.",
            'limit_key': limit_key,
            'current': current,
            'limit': limit,
        })
