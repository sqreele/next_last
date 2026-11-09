"""Pure exact-property coverage predicates, independent of legacy observe mode."""
from datetime import timedelta

from django.conf import settings
from django.db.models import F, Q
from django.utils import timezone


def renewal_grace():
    return timedelta(days=max(0, int(getattr(settings, 'COMPANY_BILLING_GRACE_DAYS', 7))))


def paid_allocations(at=None):
    from ..models import BillingInvoiceAllocation
    at = at or timezone.now()
    return BillingInvoiceAllocation.objects.filter(
        paid_at__isnull=False, property__archived_at__isnull=True,
        property__billing_enrollment__state='billable',
        property__billing_enrollment__ended_at__isnull=True,
        property__billing_enrollment__effective_at__lte=at,
    )


def paid_property_ids(at=None):
    at = at or timezone.now()
    return paid_allocations(at).filter(period_start_at__lte=at, period_end_at__gt=at).values('property_id')


def operable_property_filter(at=None):
    at = at or timezone.now()
    # Only a previously paid enrollment can receive renewal grace. Drafts,
    # additions awaiting payment, removed Properties and initial bills cannot.
    current = paid_property_ids(at)
    grace = paid_allocations(at).filter(period_start_at__lte=at,
        period_end_at__lte=at, period_end_at__gt=at - renewal_grace(),
        invoice__provider_subscription_id=F('property__billing_enrollment__subscription__external_subscription_id'),
    ).exclude(property__billing_enrollment__subscription__status='cancelled').values('property_id')
    preserved_trial = Q(tenant__billing_model='property_quantity_v1',
        billing_enrollment__state='pending_payment', billing_enrollment__revision=1,
        billing_enrollment__subscription__trial_ends_at__gt=at)
    return Q(tenant__billing_model='legacy_plan') | preserved_trial | Q(pk__in=current) | Q(pk__in=grace)


def company_entitlement(tenant, at):
    from ..entitlements import EntitlementLevel, _result
    allocations = paid_allocations(at).filter(property__tenant=tenant)
    trial_end = tenant.subscription.trial_ends_at
    if trial_end and trial_end > at and tenant.subscription.property_enrollments.filter(state='pending_payment', revision=1).exists():
        return _result(EntitlementLevel.FULL, 'company_preserved_trial')
    if allocations.filter(period_start_at__lte=at, period_end_at__gt=at).exists():
        return _result(EntitlementLevel.FULL, 'company_paid_coverage')
    current_end = allocations.filter(period_start_at__lte=at, period_end_at__lte=at,
        invoice__provider_subscription_id=tenant.subscription.external_subscription_id).order_by('-period_end_at').values_list('period_end_at', flat=True).first()
    if current_end and current_end + renewal_grace() > at and tenant.subscription.status != 'cancelled':
        return _result(EntitlementLevel.GRACE, 'company_renewal_grace', grace_ends_at=current_end + renewal_grace())
    return _result(EntitlementLevel.READ_ONLY, 'company_payment_required')
