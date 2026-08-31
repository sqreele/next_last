"""Pure subscription-entitlement decisions for a target Tenant.

This module reads billing state but never provisions or mutates it. Role and
Property authorization remain separate and must run before this decision.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone


class EntitlementLevel(str, Enum):
    FULL = 'FULL'
    GRACE = 'GRACE'
    READ_ONLY = 'READ_ONLY'
    BILLING_ONLY = 'BILLING_ONLY'


@dataclass(frozen=True)
class TenantEntitlement:
    level: EntitlementLevel
    can_read: bool
    can_write: bool
    can_manage_billing: bool
    reason_code: str
    grace_ends_at: datetime | None = None


def _result(
    level: EntitlementLevel,
    reason_code: str,
    *,
    grace_ends_at: datetime | None = None,
) -> TenantEntitlement:
    return TenantEntitlement(
        level=level,
        can_read=level is not EntitlementLevel.BILLING_ONLY,
        can_write=level in {EntitlementLevel.FULL, EntitlementLevel.GRACE},
        # Role authorization decides which user may manage billing. This flag
        # means the entitlement state itself never prevents billing recovery.
        can_manage_billing=True,
        reason_code=reason_code,
        grace_ends_at=grace_ends_at,
    )


def _effective_local_date(tenant, at: datetime):
    timezone_name = str(getattr(tenant, 'timezone', '') or '').strip()
    if not timezone_name:
        raise ZoneInfoNotFoundError('Tenant timezone is missing.')
    tenant_timezone = ZoneInfo(timezone_name)
    return timezone.localtime(at, tenant_timezone).date()


def get_tenant_entitlement(tenant, at=None) -> TenantEntitlement:
    """Return the effective billing entitlement for exactly ``tenant``.

    ``current_period_end`` is a DateField. A cancelled subscription remains
    FULL through the end of that calendar day in the Tenant's configured
    timezone, and becomes READ_ONLY on the following local day.
    """
    at = at or timezone.now()
    if timezone.is_naive(at):
        raise ValueError('Entitlement evaluation requires a timezone-aware datetime.')

    if tenant is None:
        return _result(EntitlementLevel.READ_ONLY, 'subscription_missing')

    try:
        subscription = tenant.subscription
    except ObjectDoesNotExist:
        return _result(EntitlementLevel.READ_ONLY, 'subscription_missing')

    status = subscription.status
    if status == 'trialing':
        return _result(EntitlementLevel.FULL, 'subscription_trialing')
    if status == 'active':
        return _result(EntitlementLevel.FULL, 'subscription_active')
    if status == 'past_due':
        grace_ends_at = subscription.grace_period_ends_at
        if grace_ends_at is None:
            return _result(
                EntitlementLevel.READ_ONLY,
                'past_due_missing_grace_period',
            )
        if timezone.is_naive(grace_ends_at):
            return _result(
                EntitlementLevel.READ_ONLY,
                'past_due_invalid_grace_period',
            )
        if grace_ends_at >= at:
            return _result(
                EntitlementLevel.GRACE,
                'past_due_within_grace_period',
                grace_ends_at=grace_ends_at,
            )
        return _result(
            EntitlementLevel.READ_ONLY,
            'past_due_grace_period_expired',
            grace_ends_at=grace_ends_at,
        )
    if status == 'suspended':
        return _result(EntitlementLevel.READ_ONLY, 'subscription_suspended')
    if status == 'cancelled':
        period_end = subscription.current_period_end
        if period_end is None:
            return _result(
                EntitlementLevel.READ_ONLY,
                'cancelled_missing_period_end',
            )
        try:
            local_date = _effective_local_date(tenant, at)
        except (ZoneInfoNotFoundError, ValueError):
            return _result(
                EntitlementLevel.READ_ONLY,
                'cancelled_invalid_tenant_timezone',
            )
        if local_date <= period_end:
            return _result(
                EntitlementLevel.FULL,
                'cancelled_period_still_effective',
            )
        return _result(EntitlementLevel.READ_ONLY, 'cancelled_period_ended')

    return _result(EntitlementLevel.READ_ONLY, 'subscription_status_unknown')
