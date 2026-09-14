"""Canonical platform authorization, separate from tenant membership policy.

Platform roles authorize internal StayMaint functions only.  They never create
or widen a TenantMembership, Property scope, or operational write permission.
"""

from collections.abc import Iterable

from .models import PlatformMembership


class PlatformCapability:
    TENANTS_READ = 'platform.tenants.read'
    BILLING_READ = 'platform.billing.read'
    USAGE_READ = 'platform.usage.read'
    BILLING_DIAGNOSTICS_READ = 'platform.billing.diagnostics.read'
    SUPPORT_READ = 'platform.support.read'
    ROLES_MANAGE = 'platform.roles.manage'


ALL_PLATFORM_CAPABILITIES = frozenset({
    PlatformCapability.TENANTS_READ,
    PlatformCapability.BILLING_READ,
    PlatformCapability.USAGE_READ,
    PlatformCapability.BILLING_DIAGNOSTICS_READ,
    PlatformCapability.SUPPORT_READ,
    PlatformCapability.ROLES_MANAGE,
})

ROLE_CAPABILITIES = {
    PlatformMembership.ROLE_PLATFORM_SUPER_ADMIN: ALL_PLATFORM_CAPABILITIES,
    PlatformMembership.ROLE_PLATFORM_BILLING_ADMIN: frozenset({
        PlatformCapability.TENANTS_READ,
        PlatformCapability.BILLING_READ,
        PlatformCapability.USAGE_READ,
        PlatformCapability.BILLING_DIAGNOSTICS_READ,
    }),
    PlatformMembership.ROLE_PLATFORM_SUPPORT: frozenset({
        PlatformCapability.TENANTS_READ,
        PlatformCapability.SUPPORT_READ,
        PlatformCapability.BILLING_DIAGNOSTICS_READ,
    }),
}


def get_active_platform_memberships(user):
    """Return only active internal memberships; tenant memberships are ignored."""
    if not getattr(user, 'is_authenticated', False):
        return PlatformMembership.objects.none()
    return PlatformMembership.objects.filter(user=user, is_active=True)


def get_platform_roles(user) -> frozenset[str]:
    return frozenset(get_active_platform_memberships(user).values_list('role', flat=True))


def _roles_to_capabilities(roles: Iterable[str]) -> frozenset[str]:
    capabilities = set()
    for role in roles:
        capabilities.update(ROLE_CAPABILITIES.get(role, ()))
    return frozenset(capabilities)


def get_platform_capabilities(user) -> frozenset[str]:
    """Resolve platform capabilities, retaining superuser only as break-glass."""
    if not getattr(user, 'is_authenticated', False):
        return frozenset()
    if getattr(user, 'is_superuser', False):
        return ALL_PLATFORM_CAPABILITIES
    return _roles_to_capabilities(get_platform_roles(user))


def user_has_platform_capability(user, capability: str) -> bool:
    """Return true only for an explicit platform capability or superuser bypass."""
    return capability in get_platform_capabilities(user)


def is_platform_user(user) -> bool:
    """Whether a user has an active platform role or break-glass authority."""
    return bool(get_platform_capabilities(user))
