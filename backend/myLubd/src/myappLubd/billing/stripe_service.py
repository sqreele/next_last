"""Stripe-hosted billing and authoritative subscription synchronization."""

import logging
from datetime import UTC, datetime, timedelta

import stripe
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from ..models import BillingWebhookEvent, SubscriptionPlan, TenantSubscription


logger = logging.getLogger('billing.stripe')


class StripeBillingError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


# Stripe statuses are mapped in one place. Direct lifecycle equivalents remain
# trialing/active/past_due. Stripe ``unpaid`` remains delinquent as past_due;
# ``paused`` and incomplete setup states fail closed as suspended; terminal
# ``incomplete_expired`` and Stripe's US-spelled ``canceled`` become StayMaint's
# canonical ``cancelled``. Unknown future statuses raise instead of mutating.
STRIPE_STATUS_MAP = {
    'trialing': 'trialing',
    'active': 'active',
    'past_due': 'past_due',
    'unpaid': 'past_due',
    'paused': 'suspended',
    'incomplete': 'suspended',
    'incomplete_expired': 'cancelled',
    'canceled': 'cancelled',
}

HANDLED_EVENT_TYPES = {
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed',
}


def _value(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _provider_id(value):
    if isinstance(value, str):
        return value
    return _value(value, 'id')


def _configure_stripe():
    secret_key = str(getattr(settings, 'STRIPE_SECRET_KEY', '') or '')
    if not secret_key:
        raise StripeBillingError('stripe_not_configured', 'Billing is not configured.')
    stripe.api_key = secret_key


def _price_for_plan(plan):
    price_map = getattr(settings, 'STRIPE_PRICE_MAP', {})
    price_id = str(price_map.get(plan.code, '') or '').strip()
    if not plan.is_active or not price_id:
        raise StripeBillingError('plan_not_available', 'This plan is not available for checkout.')
    return price_id


def get_or_create_stripe_customer(tenant, user):
    """Return the one Stripe Customer bound to ``tenant``.

    The database row is locked across creation. A stable provider idempotency
    key also prevents duplication if Stripe succeeds before the DB commit.
    """
    _configure_stripe()
    with transaction.atomic():
        subscription = (
            TenantSubscription.objects.select_for_update()
            .select_related('tenant')
            .get(tenant=tenant)
        )
        if subscription.external_customer_id:
            return subscription.external_customer_id

        email = str(getattr(user, 'email', '') or '').strip() or None
        customer = stripe.Customer.create(
            email=email,
            name=tenant.name,
            metadata={'tenant_id': tenant.tenant_id},
            idempotency_key=f'staymaint-tenant-customer-{tenant.pk}',
        )
        customer_id = _provider_id(customer)
        if not customer_id:
            raise StripeBillingError('invalid_provider_response', 'Stripe did not return a customer.')
        subscription.external_customer_id = customer_id
        subscription.save(update_fields=['external_customer_id', 'updated_at'])
        return customer_id


def create_checkout_session(tenant, user, plan):
    _configure_stripe()
    with transaction.atomic():
        subscription = TenantSubscription.objects.select_for_update().get(tenant=tenant)
        if subscription.external_subscription_id:
            raise StripeBillingError(
                'subscription_already_exists',
                'Use the Billing Portal to change an existing subscription.',
            )
        customer_id = get_or_create_stripe_customer(tenant, user)
        price_id = _price_for_plan(plan)
        frontend = str(settings.FRONTEND_BASE_URL).rstrip('/')
        session = stripe.checkout.Session.create(
            mode='subscription',
            customer=customer_id,
            client_reference_id=tenant.tenant_id,
            line_items=[{'price': price_id, 'quantity': 1}],
            success_url=f'{frontend}/dashboard/settings/billing/success',
            cancel_url=f'{frontend}/dashboard/settings/billing',
            metadata={'tenant_id': tenant.tenant_id},
            subscription_data={'metadata': {'tenant_id': tenant.tenant_id}},
        )
    url = _value(session, 'url')
    if not url:
        raise StripeBillingError('invalid_provider_response', 'Stripe did not return a checkout URL.')
    return url


def create_portal_session(tenant):
    _configure_stripe()
    try:
        customer_id = tenant.subscription.external_customer_id
    except TenantSubscription.DoesNotExist as exc:
        raise StripeBillingError('stripe_customer_missing', 'No billing customer exists.') from exc
    if not customer_id:
        raise StripeBillingError('stripe_customer_missing', 'No billing customer exists.')
    frontend = str(settings.FRONTEND_BASE_URL).rstrip('/')
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f'{frontend}/dashboard/settings/billing',
    )
    url = _value(session, 'url')
    if not url:
        raise StripeBillingError('invalid_provider_response', 'Stripe did not return a portal URL.')
    return url


def construct_webhook_event(payload, signature):
    webhook_secret = str(getattr(settings, 'STRIPE_WEBHOOK_SECRET', '') or '')
    if not webhook_secret:
        raise StripeBillingError('stripe_webhook_not_configured', 'Webhook is not configured.')
    return stripe.Webhook.construct_event(payload, signature, webhook_secret)


def map_stripe_status(provider_status):
    try:
        return STRIPE_STATUS_MAP[provider_status]
    except KeyError as exc:
        raise StripeBillingError(
            'unknown_subscription_status',
            f'Unsupported Stripe subscription status: {provider_status!r}.',
        ) from exc


def _timestamp_to_datetime(value):
    if value is None:
        return None
    return datetime.fromtimestamp(int(value), tz=UTC)


def _timestamp_to_date(value):
    """Convert a Stripe UTC epoch to its UTC calendar date for DateFields."""
    converted = _timestamp_to_datetime(value)
    return converted.date() if converted else None


def _subscription_price_id(provider_subscription):
    items = _value(_value(provider_subscription, 'items', {}), 'data', [])
    if len(items) != 1:
        raise StripeBillingError('unsupported_subscription_items', 'Expected exactly one subscription item.')
    return _provider_id(_value(items[0], 'price'))


def _subscription_period(provider_subscription, field_name):
    """Read both legacy subscription-level and Basil item-level periods."""
    value = _value(provider_subscription, field_name)
    if value is not None:
        return value
    items = _value(_value(provider_subscription, 'items', {}), 'data', [])
    if len(items) != 1:
        raise StripeBillingError('unsupported_subscription_items', 'Expected exactly one subscription item.')
    return _value(items[0], field_name)


def _plan_for_provider_subscription(provider_subscription):
    price_id = _subscription_price_id(provider_subscription)
    matches = [
        code for code, configured_price in getattr(settings, 'STRIPE_PRICE_MAP', {}).items()
        if configured_price and configured_price == price_id
    ]
    if len(matches) != 1:
        raise StripeBillingError('unknown_stripe_price', 'Stripe price does not map to one StayMaint plan.')
    try:
        # ``is_active`` controls new plan selection only. Existing Stripe
        # subscriptions must remain synchronizable after a plan is retired,
        # especially for payment recovery and terminal cancellation events.
        return SubscriptionPlan.objects.get(code=matches[0])
    except SubscriptionPlan.DoesNotExist as exc:
        raise StripeBillingError('plan_not_found', 'Mapped StayMaint plan does not exist.') from exc


def _assert_tenant_metadata(provider_object, subscription):
    metadata = _value(provider_object, 'metadata') or {}
    metadata_tenant_id = str(_value(metadata, 'tenant_id', '') or '').strip()
    if metadata_tenant_id and metadata_tenant_id != subscription.tenant.tenant_id:
        raise StripeBillingError('stripe_tenant_mismatch', 'Stripe tenant metadata mismatch.')


def validate_stripe_subscription_identity(
    provider_subscription,
    *,
    expected_customer_id=None,
    expected_subscription_id=None,
    expected_tenant_id=None,
    local_subscription_id=None,
    require_bound_subscription=False,
):
    """Lock and validate one exact local/provider subscription identity.

    Expected IDs come from the enclosing Stripe object (for example a
    Checkout Session or invoice).  Existing local provider IDs are never
    reassigned when any authoritative reference disagrees.
    """
    provider_subscription_id = _provider_id(_value(provider_subscription, 'id'))
    customer_id = _provider_id(_value(provider_subscription, 'customer'))
    expected_customer_id = _provider_id(expected_customer_id)
    expected_subscription_id = _provider_id(expected_subscription_id)

    if not provider_subscription_id or not customer_id:
        raise StripeBillingError(
            'subscription_reference_missing',
            'Stripe subscription identifiers are missing.',
        )
    if expected_customer_id and expected_customer_id != customer_id:
        raise StripeBillingError('stripe_customer_mismatch', 'Stripe customer reference mismatch.')
    if expected_subscription_id and expected_subscription_id != provider_subscription_id:
        raise StripeBillingError(
            'stripe_subscription_mismatch',
            'Stripe subscription reference mismatch.',
        )

    if local_subscription_id is None:
        subscription = _resolve_subscription(customer_id, provider_subscription_id)
    else:
        try:
            subscription = (
                TenantSubscription.objects.select_for_update()
                .select_related('tenant', 'plan')
                .get(pk=local_subscription_id)
            )
        except TenantSubscription.DoesNotExist as exc:
            raise StripeBillingError(
                'subscription_resolution_failed',
                'Stripe event did not resolve to exactly one tenant.',
            ) from exc

    if subscription.external_customer_id != customer_id:
        raise StripeBillingError('stripe_customer_mismatch', 'Stripe customer reference mismatch.')
    if subscription.external_subscription_id:
        if subscription.external_subscription_id != provider_subscription_id:
            raise StripeBillingError(
                'stripe_subscription_mismatch',
                'Stripe subscription reference mismatch.',
            )
    elif require_bound_subscription:
        raise StripeBillingError(
            'stripe_subscription_mismatch',
            'Stripe subscription is not bound to the local tenant.',
        )

    if expected_tenant_id and subscription.tenant.tenant_id != expected_tenant_id:
        raise StripeBillingError('stripe_tenant_mismatch', 'Stripe tenant reference mismatch.')
    _assert_tenant_metadata(provider_subscription, subscription)
    return subscription


def _resolve_subscription(customer_id=None, provider_subscription_id=None):
    customer_id = _provider_id(customer_id)
    provider_subscription_id = _provider_id(provider_subscription_id)
    if not customer_id and not provider_subscription_id:
        raise StripeBillingError('subscription_reference_missing', 'Stripe event has no subscription reference.')

    queryset = TenantSubscription.objects.select_for_update().select_related('tenant', 'plan')
    if customer_id and provider_subscription_id:
        # Lock all rows referenced by either ID in stable PK order.  This both
        # detects cross-tenant disagreement and avoids opposite lock ordering
        # when inconsistent events arrive concurrently.
        referenced = list(queryset.filter(
            Q(external_customer_id=customer_id)
            | Q(external_subscription_id=provider_subscription_id)
        ).order_by('pk')[:4])
        customer_matches = [
            item for item in referenced if item.external_customer_id == customer_id
        ]
        if len(customer_matches) != 1:
            raise StripeBillingError(
                'subscription_resolution_failed',
                'Stripe event did not resolve to exactly one tenant.',
            )
        subscription = customer_matches[0]
        subscription_matches = [
            item for item in referenced
            if item.external_subscription_id == provider_subscription_id
        ]
        if len(subscription_matches) > 1:
            raise StripeBillingError(
                'subscription_resolution_failed',
                'Stripe event did not resolve to exactly one tenant.',
            )
        if subscription_matches and subscription_matches[0].pk != subscription.pk:
            raise StripeBillingError(
                'stripe_subscription_mismatch',
                'Stripe subscription is bound to a different customer.',
            )
        if (
            subscription.external_subscription_id
            and subscription.external_subscription_id != provider_subscription_id
        ):
            raise StripeBillingError(
                'stripe_subscription_mismatch',
                'Stripe subscription reference mismatch.',
            )
        return subscription

    if customer_id:
        matches = list(queryset.filter(external_customer_id=customer_id)[:2])
        if len(matches) != 1:
            raise StripeBillingError(
                'subscription_resolution_failed',
                'Stripe event did not resolve to exactly one tenant.',
            )
        return matches[0]

    matches = list(queryset.filter(
        external_subscription_id=provider_subscription_id
    )[:2])
    if len(matches) != 1:
        raise StripeBillingError('subscription_resolution_failed', 'Stripe event did not resolve to exactly one tenant.')
    return matches[0]


def sync_provider_subscription(
    provider_subscription,
    *,
    force_cancelled=False,
    expected_customer_id=None,
    expected_subscription_id=None,
    expected_tenant_id=None,
    local_subscription_id=None,
    require_bound_subscription=False,
):
    provider_subscription_id = _provider_id(_value(provider_subscription, 'id'))
    customer_id = _provider_id(_value(provider_subscription, 'customer'))
    if not provider_subscription_id or not customer_id:
        raise StripeBillingError('subscription_reference_missing', 'Stripe subscription identifiers are missing.')

    with transaction.atomic():
        subscription = validate_stripe_subscription_identity(
            provider_subscription,
            expected_customer_id=expected_customer_id,
            expected_subscription_id=expected_subscription_id,
            expected_tenant_id=expected_tenant_id,
            local_subscription_id=local_subscription_id,
            require_bound_subscription=require_bound_subscription,
        )
        canonical_status = 'cancelled' if force_cancelled else map_stripe_status(
            _value(provider_subscription, 'status')
        )
        plan = _plan_for_provider_subscription(provider_subscription)
        subscription.external_subscription_id = provider_subscription_id
        subscription.plan = plan
        subscription.status = canonical_status
        subscription.current_period_start = _timestamp_to_date(
            _subscription_period(provider_subscription, 'current_period_start')
        )
        subscription.current_period_end = _timestamp_to_date(
            _subscription_period(provider_subscription, 'current_period_end')
        )
        subscription.trial_ends_at = _timestamp_to_datetime(
            _value(provider_subscription, 'trial_end')
        )
        subscription.cancel_at_period_end = bool(
            _value(provider_subscription, 'cancel_at_period_end', False)
        )
        if canonical_status in {'active', 'trialing'}:
            subscription.grace_period_ends_at = None
        subscription.save(update_fields=[
            'external_subscription_id', 'plan', 'status', 'current_period_start',
            'current_period_end', 'trial_ends_at', 'cancel_at_period_end',
            'grace_period_ends_at', 'updated_at',
        ])
        return subscription


def _retrieve_subscription(provider_subscription_id):
    _configure_stripe()
    return stripe.Subscription.retrieve(provider_subscription_id)


def _invoice_subscription_id(invoice):
    # Support both pre-Basil invoice.subscription and the current
    # invoice.parent.subscription_details.subscription location. Events
    # without an explicit provider reference fail closed instead of using email.
    legacy_id = _provider_id(_value(invoice, 'subscription'))
    if legacy_id:
        return legacy_id
    parent = _value(invoice, 'parent') or {}
    if _value(parent, 'type') != 'subscription_details':
        return None
    details = _value(parent, 'subscription_details') or {}
    return _provider_id(_value(details, 'subscription'))


def _process_invoice_paid(invoice):
    provider_subscription_id = _invoice_subscription_id(invoice)
    customer_id = _provider_id(_value(invoice, 'customer'))
    if not provider_subscription_id or not customer_id:
        raise StripeBillingError('subscription_reference_missing', 'Invoice has no customer or subscription reference.')
    provider_subscription = _retrieve_subscription(provider_subscription_id)
    subscription = sync_provider_subscription(
        provider_subscription,
        expected_customer_id=customer_id,
        expected_subscription_id=provider_subscription_id,
        require_bound_subscription=True,
    )
    if subscription.status == 'active' and subscription.grace_period_ends_at is not None:
        subscription.grace_period_ends_at = None
        subscription.save(update_fields=['grace_period_ends_at', 'updated_at'])


def _process_invoice_failed(invoice, event_created):
    provider_subscription_id = _invoice_subscription_id(invoice)
    customer_id = _provider_id(_value(invoice, 'customer'))
    if not provider_subscription_id or not customer_id:
        raise StripeBillingError('subscription_reference_missing', 'Invoice has no customer or subscription reference.')
    provider_subscription = _retrieve_subscription(provider_subscription_id)
    with transaction.atomic():
        subscription = validate_stripe_subscription_identity(
            provider_subscription,
            expected_customer_id=customer_id,
            expected_subscription_id=provider_subscription_id,
            require_bound_subscription=True,
        )
        if subscription.status != 'past_due' or subscription.grace_period_ends_at is None:
            subscription.grace_period_ends_at = _timestamp_to_datetime(event_created) + timedelta(days=7)
        subscription.status = 'past_due'
        subscription.save(update_fields=['status', 'grace_period_ends_at', 'updated_at'])


def _dispatch_event(event):
    event_type = _value(event, 'type')
    if event_type not in HANDLED_EVENT_TYPES:
        return
    provider_object = _value(_value(event, 'data', {}), 'object')
    if not provider_object:
        raise StripeBillingError('event_object_missing', 'Stripe event object is missing.')

    if event_type == 'checkout.session.completed':
        provider_subscription_id = _provider_id(_value(provider_object, 'subscription'))
        customer_id = _provider_id(_value(provider_object, 'customer'))
        if not provider_subscription_id or not customer_id:
            raise StripeBillingError(
                'subscription_reference_missing',
                'Checkout Session has no customer or subscription reference.',
            )
        with transaction.atomic():
            pending_subscription = _resolve_subscription(
                customer_id, provider_subscription_id
            )
            _assert_tenant_metadata(provider_object, pending_subscription)
        provider_subscription = _retrieve_subscription(provider_subscription_id)
        sync_provider_subscription(
            provider_subscription,
            expected_customer_id=customer_id,
            expected_subscription_id=provider_subscription_id,
            expected_tenant_id=pending_subscription.tenant.tenant_id,
            local_subscription_id=pending_subscription.pk,
        )
    elif event_type in {'customer.subscription.created', 'customer.subscription.updated'}:
        sync_provider_subscription(provider_object)
    elif event_type == 'customer.subscription.deleted':
        sync_provider_subscription(provider_object, force_cancelled=True)
    elif event_type == 'invoice.paid':
        _process_invoice_paid(provider_object)
    elif event_type == 'invoice.payment_failed':
        _process_invoice_failed(provider_object, _value(event, 'created'))


def _record_failed_webhook_event(event_id, event_type, error_code):
    """Durably record failure without overwriting a concurrent success."""
    with transaction.atomic():
        receipt, _ = BillingWebhookEvent.objects.get_or_create(
            provider='stripe',
            event_id=event_id,
            defaults={
                'event_type': event_type,
                'status': 'failed',
                'error_code': error_code,
                'processed_at': timezone.now(),
            },
        )
        receipt = BillingWebhookEvent.objects.select_for_update().get(pk=receipt.pk)
        if receipt.status != 'processed':
            receipt.event_type = event_type
            receipt.status = 'failed'
            receipt.error_code = error_code
            receipt.processed_at = timezone.now()
            receipt.save(update_fields=[
                'event_type', 'status', 'error_code', 'processed_at',
            ])


def process_webhook_event(event):
    event_id = str(_value(event, 'id', '') or '')
    event_type = str(_value(event, 'type', '') or '')
    if not event_id or not event_type:
        raise StripeBillingError('invalid_event_envelope', 'Stripe event ID or type is missing.')

    try:
        # The receipt lock is deliberately held through dispatch.  This keeps
        # the ownership decision and all local state transitions in one DB
        # transaction.  A worker crash rolls the transaction back to ``failed``
        # (or removes a new uncommitted receipt), so no durable ``processing``
        # claim can poison future Stripe retries.
        with transaction.atomic():
            receipt, created = BillingWebhookEvent.objects.get_or_create(
                provider='stripe',
                event_id=event_id,
                defaults={'event_type': event_type, 'status': 'processing'},
            )
            receipt = BillingWebhookEvent.objects.select_for_update().get(pk=receipt.pk)
            if not created:
                if receipt.event_type != event_type:
                    raise StripeBillingError(
                        'stripe_event_type_mismatch',
                        'Stripe event type does not match its durable receipt.',
                    )
                if receipt.status in {'processing', 'processed'}:
                    return False
                receipt.status = 'processing'
                receipt.error_code = None
                receipt.processed_at = None
                receipt.save(update_fields=['status', 'error_code', 'processed_at'])
            _dispatch_event(event)
            receipt.status = 'processed'
            receipt.error_code = None
            receipt.processed_at = timezone.now()
            receipt.save(update_fields=['status', 'error_code', 'processed_at'])
    except Exception as exc:
        error_code = exc.code if isinstance(exc, StripeBillingError) else 'provider_processing_error'
        _record_failed_webhook_event(event_id, event_type, error_code)
        logger.exception('stripe_webhook_processing_failed', extra={
            'event_id': event_id,
            'event_type': event_type,
            'error_code': error_code,
        })
        raise
    return True
