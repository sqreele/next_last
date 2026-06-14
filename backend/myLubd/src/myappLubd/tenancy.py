"""Tenant and billing helpers for SaaS-scoped access control."""

from django.core.exceptions import PermissionDenied
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
    if user.is_staff or user.is_superuser:
        return Tenant.objects.all()
    return Tenant.objects.filter(memberships__user=user, memberships__is_active=True).distinct()


def get_primary_tenant(user):
    if not getattr(user, 'is_authenticated', False):
        return None
    owned = Tenant.objects.filter(owner=user).first()
    if owned:
        return owned
    membership = get_user_tenant_memberships(user).order_by('created_at').first()
    if membership:
        return membership.tenant
    legacy_property = Property.objects.filter(users=user, tenant__isnull=False).select_related('tenant').first()
    if legacy_property:
        return legacy_property.tenant
    return None


def user_can_manage_tenant(user, tenant):
    if not getattr(user, 'is_authenticated', False) or tenant is None:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return TenantMembership.objects.filter(
        tenant=tenant,
        user=user,
        is_active=True,
        role__in=TENANT_ADMIN_ROLES,
    ).exists()


def get_accessible_properties(user):
    if not getattr(user, 'is_authenticated', False):
        return Property.objects.none()
    if user.is_staff or user.is_superuser:
        return Property.objects.all()

    tenant_member_property_q = Q(tenant_memberships__user=user, tenant_memberships__is_active=True)
    tenant_wide_q = Q(
        tenant__memberships__user=user,
        tenant__memberships__is_active=True,
        tenant__memberships__role__in=['owner', 'admin', 'manager'],
    )
    legacy_q = Q(users=user) | Q(user_profiles__user=user)
    return Property.objects.filter(tenant_member_property_q | tenant_wide_q | legacy_q).distinct()


def accessible_property_ids(user):
    if user.is_staff or user.is_superuser:
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
            Q(rooms__properties__tenant=tenant) | Q(area__property__tenant=tenant),
            created_at__gte=start,
        ).distinct().count(),
        'max_assets': Machine.objects.filter(property__tenant=tenant).count(),
        'max_pm_schedules': PreventiveMaintenance.objects.filter(
            Q(job__rooms__properties__tenant=tenant) | Q(machines__property__tenant=tenant)
        ).distinct().count(),
    }


def enforce_subscription_limit(tenant, limit_key, increment=1):
    if tenant is None:
        return
    try:
        subscription = tenant.subscription
    except TenantSubscription.DoesNotExist:
        subscription = TenantSubscription.objects.create(
            tenant=tenant,
            plan=ensure_default_plan(),
            status='trialing',
        )

    if not subscription.is_entitled:
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
