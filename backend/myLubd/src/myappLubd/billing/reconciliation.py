"""Authoritative Company billing events and the retryable operation outbox."""
import stripe
from copy import copy
from django.db import transaction
from django.utils import timezone

from ..models import BillingChange, TenantSubscription
from .company_service import (
    MODEL, manifest, process_change, reconcile_company_invoice, sync_company_subscription,
)
from .stripe_service import StripeBillingError, _invoice_subscription_id, _provider_id, _value


def historical_contract(local, subscription_id, invoice=None):
    if not local.external_subscription_id or subscription_id == local.external_subscription_id:
        return False
    if not BillingChange.objects.filter(tenant=local.tenant, confirmed_at__isnull=False,
            quote__previous_subscription_id=subscription_id).exists():
        raise StripeBillingError('stripe_subscription_mismatch', 'Unknown previous Company contract.')
    if invoice:
        from .documents import snapshot_invoice
        previous = copy(local)
        previous.external_subscription_id = subscription_id
        snapshot_invoice(invoice, previous)
    # Past contracts can update their financial documents but cannot replace
    # today's subscription or grant access to today's enrollments.
    return True


def dispatch_company_event(event_type, obj):
    customer = _provider_id(_value(obj, 'customer'))
    local = TenantSubscription.objects.select_related('tenant').get(external_customer_id=customer, tenant__billing_model=MODEL)
    if event_type == 'checkout.session.completed':
        session = stripe.checkout.Session.retrieve(_provider_id(obj))
        if _provider_id(_value(session, 'customer')) != customer:
            raise StripeBillingError('stripe_customer_mismatch', 'Checkout customer mismatch.')
        operation = BillingChange.objects.filter(tenant=local.tenant, checkout_session_id=_provider_id(session), confirmed_at__isnull=False).first()
        if not operation:
            raise StripeBillingError('unapproved_checkout', 'Checkout was not requested by this Company.')
        remote = stripe.Subscription.retrieve(_provider_id(_value(session, 'subscription')))
        sync_company_subscription(remote)
        invoice_id = _provider_id(_value(remote, 'latest_invoice'))
        if invoice_id:
            BillingChange.objects.filter(pk=operation.pk).update(provider_invoice_id=invoice_id)
            reconcile_company_invoice(stripe.Invoice.retrieve(invoice_id))
    elif event_type == 'checkout.session.expired':
        session = stripe.checkout.Session.retrieve(_provider_id(obj))
        if _value(session, 'status') == 'expired':
            with transaction.atomic():
                locked = TenantSubscription.objects.select_for_update().get(pk=local.pk)
                expired = BillingChange.objects.select_for_update().filter(tenant=local.tenant, checkout_session_id=_provider_id(session), state='awaiting_payment').first()
                if expired and not locked.external_subscription_id:
                    expired.state = 'expired'
                    expired.save(update_fields=['state', 'updated_at'])
                    locked.property_enrollments.filter(state='pending_payment').update(state='inactive', ended_at=timezone.now())
                    locked.desired_quantity = 0
                    locked.reconciliation_status = 'synced'
                    locked.save(update_fields=['desired_quantity', 'reconciliation_status', 'updated_at'])
    elif event_type in {'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'}:
        remote = stripe.Subscription.retrieve(_provider_id(obj))
        if historical_contract(local, _provider_id(remote)):
            return
        sync_company_subscription(remote)
    elif event_type in {'invoice.created', 'invoice.finalized', 'invoice.paid', 'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible'}:
        invoice = stripe.Invoice.retrieve(_provider_id(obj))
        subscription_id = _invoice_subscription_id(invoice)
        if not subscription_id:
            return
        if historical_contract(local, subscription_id, invoice):
            return
        remote = stripe.Subscription.retrieve(subscription_id)
        sync_company_subscription(remote)
        document = reconcile_company_invoice(invoice)
        if document and _value(invoice, 'status') in {'void', 'uncollectible'}:
            # Do not guess how to compensate a remote quantity change after
            # voiding a debit. Keep it blocked for explicit reconciliation.
            TenantSubscription.objects.filter(pk=local.pk).update(reconciliation_status='review_required')
        if (event_type == 'invoice.payment_failed' and local.paid_through_at
                and _value(remote, 'status') not in {'canceled', 'incomplete_expired'}):
            TenantSubscription.objects.filter(pk=local.pk).update(status='past_due')
    elif event_type in {'credit_note.created', 'credit_note.updated', 'credit_note.voided', 'charge.refunded'}:
        invoice_id = _provider_id(_value(obj, 'invoice'))
        if invoice_id:
            invoice = stripe.Invoice.retrieve(invoice_id)
            if not historical_contract(local, _invoice_subscription_id(invoice), invoice):
                reconcile_company_invoice(invoice)
        TenantSubscription.objects.filter(pk=local.pk).update(reconciliation_status='credit_review_required')


def reconcile_company(tenant):
    for change in BillingChange.objects.filter(tenant=tenant, state='applying'):
        process_change(change.pk)
    local = TenantSubscription.objects.get(tenant=tenant)
    if not local.external_subscription_id:
        for change in BillingChange.objects.filter(tenant=tenant, state='awaiting_payment').exclude(checkout_session_id=''):
            session = stripe.checkout.Session.retrieve(change.checkout_session_id)
            if _value(session, 'status') in {'complete', 'expired'}:
                dispatch_company_event('checkout.session.completed' if _value(session, 'status') == 'complete' else 'checkout.session.expired', session)
        return
    remote = stripe.Subscription.retrieve(local.external_subscription_id)
    sync_company_subscription(remote)
    # Full pagination: a missed payment may be older than the newest 25 bills.
    invoices = stripe.Invoice.list(customer=local.external_customer_id, subscription=local.external_subscription_id, limit=100)
    iterable = invoices.auto_paging_iter() if hasattr(invoices, 'auto_paging_iter') else _value(invoices, 'data', [])
    for invoice in iterable:
        if _value(invoice, 'status') != 'draft':
            reconcile_company_invoice(invoice)
    local.refresh_from_db()
    if not BillingChange.objects.filter(tenant=tenant, state__in=['applying', 'awaiting_payment']).exists() and local.billing_quantity != len(manifest(local)):
        TenantSubscription.objects.filter(pk=local.pk).update(reconciliation_status='quantity_drift')


def retry_operations(limit=25):
    ids = list(BillingChange.objects.filter(state='applying').order_by('created_at').values_list('pk', flat=True)[:limit])
    results = []
    for operation_id in ids:
        try:
            process_change(operation_id)
            results.append((str(operation_id), 'processed'))
        except (stripe.StripeError, StripeBillingError):
            results.append((str(operation_id), 'retry_required'))
    return results
