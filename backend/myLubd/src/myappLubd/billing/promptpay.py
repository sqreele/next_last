"""Customer-initiated PromptPay renewal invoices using Stripe Billing."""

import stripe
from django.conf import settings
from django.db import transaction

from ..models import BillingProfile, SubscriptionPlan, TenantSubscription
from .documents import issuer_details, snapshot_invoice
from .stripe_service import (
    StripeBillingError, _configure_stripe, _provider_id, _subscription_price_id,
    _value, get_or_create_stripe_customer,
)


def promptpay_price(plan):
    price_id = str(getattr(settings, 'STRIPE_PROMPTPAY_PRICE_MAP', {}).get(plan.code) or '').strip()
    if not plan.is_active or not price_id:
        raise StripeBillingError('plan_not_available', 'This plan has no configured PromptPay price.')
    price = stripe.Price.retrieve(price_id)
    recurring = _value(price, 'recurring') or {}
    expected_interval = {'monthly': 'month', 'annual': 'year'}.get(plan.billing_interval)
    if (
        _value(price, 'currency') != 'thb' or not _value(price, 'active')
        or _value(recurring, 'interval') != expected_interval
        or _value(recurring, 'interval_count', 1) != 1
        or _value(price, 'billing_scheme') != 'per_unit'
        or not isinstance(_value(price, 'unit_amount'), int)
        or _value(price, 'unit_amount') <= 0
    ):
        raise StripeBillingError('invalid_promptpay_price', 'Configure an active fixed recurring THB price for this plan.')
    return price


def promptpay_quotes():
    from decimal import Decimal
    _configure_stripe()
    configured = [code for code, price in getattr(settings, 'STRIPE_PROMPTPAY_PRICE_MAP', {}).items() if price]
    quotes = []
    for plan in SubscriptionPlan.objects.filter(code__in=configured, is_active=True):
        price = promptpay_price(plan)
        quotes.append({'id': plan.pk, 'name': plan.name, 'billing_interval': plan.billing_interval,
                       'amount': str(Decimal(_value(price, 'unit_amount')) / 100), 'currency': 'THB'})
    return quotes


def update_stripe_profile(customer_id, profile):
    _configure_stripe()
    fields = []
    for name, value in [('Tax ID', profile.tax_id), ('Branch', profile.branch)]:
        if value:
            fields.append({'name': name, 'value': value})
    stripe.Customer.modify(
        customer_id, name=profile.legal_name, email=profile.email,
        address={'line1': profile.address, 'country': 'TH'},
        invoice_settings={'custom_fields': fields or ''},
    )


def create_promptpay_invoice(tenant, user, plan):
    """Serialize creation and reuse the bound subscription on every retry.

    A stable Stripe idempotency key also covers remote success followed by a
    local rollback. A failed finalize can be retried without a second contract.
    """
    _configure_stripe()
    if tenant.billing_model == 'property_quantity_v1':
        raise StripeBillingError('company_checkout_required', 'Use the Company billing preview and confirmation flow.')
    issuer_details()
    with transaction.atomic():
        local = TenantSubscription.objects.select_for_update().get(tenant=tenant)
        try:
            profile = BillingProfile.objects.get(tenant=tenant)
        except BillingProfile.DoesNotExist as exc:
            raise StripeBillingError('billing_profile_required', 'Please save your billing details first.') from exc
        price_id = str(getattr(settings, 'STRIPE_PROMPTPAY_PRICE_MAP', {}).get(plan.code) or '').strip()
        if not price_id:
            raise StripeBillingError('plan_not_available', 'This plan has no configured PromptPay price.')
        if local.external_subscription_id:
            remote = stripe.Subscription.retrieve(local.external_subscription_id)
            if _value(remote, 'collection_method') != 'send_invoice':
                raise StripeBillingError('subscription_already_exists', 'Please manage your existing subscription first.')
            if _provider_id(_value(remote, 'customer')) != local.external_customer_id:
                raise StripeBillingError('stripe_customer_mismatch', 'Stripe customer reference mismatch.')
            if _subscription_price_id(remote) != price_id:
                raise StripeBillingError('subscription_already_exists', 'Please pay the existing invoice before changing plans.')
        else:
            promptpay_price(plan)
            customer_id = get_or_create_stripe_customer(tenant, user)
            local.external_customer_id = customer_id
            update_stripe_profile(customer_id, profile)
            remote = stripe.Subscription.create(
                customer=customer_id, items=[{'price': price_id}],
                collection_method='send_invoice',
                days_until_due=getattr(settings, 'BILLING_INVOICE_DAYS_UNTIL_DUE', 7),
                payment_settings={'payment_method_types': ['promptpay']},
                automatic_tax={'enabled': False}, default_tax_rates=[], discounts=[],
                metadata={'tenant_id': tenant.tenant_id, 'billing_flow': 'promptpay_non_vat'},
                expand=['latest_invoice'],
                idempotency_key=f'staymaint-promptpay-subscription-{local.pk}',
            )
            remote_id = _provider_id(remote)
            if not remote_id:
                raise StripeBillingError('invalid_provider_response', 'Stripe did not return a subscription.')
            local.external_subscription_id = remote_id
            # Do not change paid periods or plan before payment is confirmed.
            local.save(update_fields=['external_subscription_id', 'updated_at'])
        invoice_ref = _value(remote, 'latest_invoice')
        invoice_id = _provider_id(invoice_ref)
        if not invoice_id:
            raise StripeBillingError('invoice_not_ready', 'The invoice is not ready yet. Please refresh shortly.')
    # Commit the subscription identity before finalization. Failure here must
    # not lose the binding or allow a second subscription on retry.
    invoice = stripe.Invoice.retrieve(invoice_id)
    if _value(invoice, 'status') == 'draft':
        invoice = stripe.Invoice.finalize_invoice(invoice_id, auto_advance=True)
    snapshot_invoice(invoice, local)
    url = _value(invoice, 'hosted_invoice_url')
    if not url:
        raise StripeBillingError('invoice_not_ready', 'The invoice is not ready yet. Please refresh shortly.')
    return url


def refresh_invoices(tenant):
    """Bound history only; Stripe remains authoritative across reordered events."""
    _configure_stripe()
    if tenant.billing_model == 'property_quantity_v1':
        from .reconciliation import reconcile_company
        return reconcile_company(tenant)
    local = TenantSubscription.objects.get(tenant=tenant)
    if not local.external_subscription_id:
        return
    remote = stripe.Subscription.retrieve(local.external_subscription_id)
    if _value(remote, 'collection_method') != 'send_invoice':
        return
    invoices = stripe.Invoice.list(
        customer=local.external_customer_id, subscription=local.external_subscription_id,
        limit=25,
    )
    for invoice in _value(invoices, 'data', []):
        if _value(invoice, 'status') != 'draft':
            snapshot_invoice(invoice, local)
    # Recover access from paid invoices even if a webhook was temporarily lost.
    from .stripe_service import sync_provider_subscription
    sync_provider_subscription(remote, local_subscription_id=local.pk, require_bound_subscription=True)


def invoice_payment_url(document):
    _configure_stripe()
    local = TenantSubscription.objects.get(tenant=document.tenant)
    invoice = stripe.Invoice.retrieve(document.provider_invoice_id)
    snapshot_invoice(invoice, local)
    if _value(invoice, 'status') != 'open':
        raise StripeBillingError('invoice_not_payable', 'This invoice is no longer awaiting payment.')
    url = _value(invoice, 'hosted_invoice_url')
    if not url:
        raise StripeBillingError('invoice_not_ready', 'The payment link is not ready yet.')
    return url
