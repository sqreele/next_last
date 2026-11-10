"""Company quantity billing. Database intent is durable before remote mutations.

All monetary values are integer minor units. Legacy contracts never enter this
service without an explicit Company Admin quote and confirmation.
"""
from datetime import timedelta
from uuid import UUID

import stripe
from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.db import IntegrityError, transaction
from django.utils import timezone

from ..models import (
    BillingChange, BillingInvoice, BillingInvoiceAllocation, BillingPrice,
    BillingProfile, Job, Property, PropertyBillingEnrollment, Tenant, TenantMembership,
    TenantSubscription,
)
from .documents import issuer_details
from .stripe_service import (
    StripeBillingError, _configure_stripe, _invoice_subscription_id, _provider_id,
    _subscription_period, _timestamp_to_datetime, _value, get_or_create_stripe_customer,
)

MODEL = 'property_quantity_v1'
INFLIGHT = ['applying', 'awaiting_payment']


def complete_invoice_lines(invoice):
    """Follow Stripe's own nested-list URL, including preview line pagination."""
    lines = _value(invoice, 'lines') or {}
    if not _value(lines, 'has_more', False):
        return invoice
    pages = lines if hasattr(lines, 'auto_paging_iter') else stripe.Invoice.list_lines(_provider_id(invoice), limit=100)
    rows = list(pages.auto_paging_iter()) if hasattr(pages, 'auto_paging_iter') else _value(pages, 'data', [])
    if len(rows) > 10000 or _value(pages, 'has_more', False) and not hasattr(pages, 'auto_paging_iter'):
        raise StripeBillingError('invoice_lines_require_review', 'Invoice line pagination could not be completed.')
    return {**dict(invoice), 'lines': {'data': rows, 'has_more': False}}


def conflict(code, message):
    error = StripeBillingError(code, message)
    error.http_status = 409
    return error


def require_enabled():
    if not getattr(settings, 'COMPANY_BILLING_ENABLED', False):
        raise StripeBillingError('company_billing_disabled', 'Company billing is not enabled for this release.')
    _configure_stripe()
    if not str(settings.STRIPE_SECRET_KEY).startswith('sk_test_'):
        raise StripeBillingError('test_mode_required', 'This release supports Stripe test mode only.')


def require_company_admin(user, tenant):
    if getattr(user, 'is_superuser', False):
        return
    if not TenantMembership.objects.filter(user=user, tenant=tenant, is_active=True, role='company_admin').exists():
        raise PermissionDenied('Only a Company Admin can change property subscriptions.')


def catalog_price(method):
    currency = {'card': 'usd', 'promptpay': 'thb'}.get(method)
    if not currency:
        raise StripeBillingError('invalid_payment_method', 'Select card or PromptPay.')
    try:
        price = BillingPrice.objects.get(currency=currency, is_active=True, livemode=False)
    except BillingPrice.DoesNotExist as exc:
        raise StripeBillingError('price_not_configured', f'No approved {currency.upper()} property price is configured.') from exc
    remote = stripe.Price.retrieve(price.stripe_price_id)
    recurring = _value(remote, 'recurring') or {}
    if (price.livemode or _value(remote, 'livemode', True)
            or _value(remote, 'currency') != currency
            or _value(remote, 'unit_amount') != price.unit_amount_minor
            or (currency == 'usd' and price.unit_amount_minor != 2000)
            or _provider_id(_value(remote, 'product')) != price.stripe_product_id
            or not _value(remote, 'active')
            or _value(remote, 'billing_scheme') != 'per_unit'
            or _value(recurring, 'interval') != 'month'
            or _value(recurring, 'interval_count', 1) != 1
            or _value(recurring, 'usage_type', 'licensed') != 'licensed'):
        raise StripeBillingError('invalid_company_price', 'The approved price does not match an active test-mode monthly property price.')
    return price


def manifest(subscription):
    return list(subscription.property_enrollments.filter(
        state__in=['billable', 'pending_payment'], ended_at__isnull=True,
    ).order_by('property_id').values_list('property_id', flat=True))


def validate_remote(remote, local, price=None, allow_new=False):
    if (_value(remote, 'livemode', True)
            or _provider_id(_value(remote, 'customer')) != local.external_customer_id):
        raise StripeBillingError('stripe_customer_mismatch', 'Subscription customer or test mode does not match.')
    if not allow_new and _provider_id(remote) != local.external_subscription_id:
        raise StripeBillingError('stripe_subscription_mismatch', 'Subscription identity does not match.')
    items = _value(_value(remote, 'items', {}), 'data', [])
    if len(items) != 1:
        raise StripeBillingError('unsupported_subscription_items', 'Expected one Company subscription item.')
    item = items[0]
    if not allow_new and local.stripe_subscription_item_id and _provider_id(item) != local.stripe_subscription_item_id:
        raise StripeBillingError('stripe_item_mismatch', 'Subscription item changed outside the approved Company operation.')
    if price and _provider_id(_value(item, 'price')) != price.stripe_price_id:
        raise StripeBillingError('stripe_price_mismatch', 'Subscription price does not match the approved catalog.')
    metadata = _value(remote, 'metadata') or {}
    if _value(metadata, 'tenant_id') != local.tenant.tenant_id or _value(metadata, 'billing_model') != MODEL:
        raise StripeBillingError('stripe_tenant_mismatch', 'Subscription Company metadata does not match.')
    if local.collection_method and _value(remote, 'collection_method') != local.collection_method:
        raise StripeBillingError('stripe_collection_mismatch', 'Collection method changed outside the approved Company contract.')
    return item


def assert_no_debt(local):
    if local.external_subscription_id:
        invoices = stripe.Invoice.list(customer=local.external_customer_id,
                                      subscription=local.external_subscription_id, status='open', limit=1)
        if _value(invoices, 'data', []):
            raise conflict('unpaid_invoice', 'Please resolve the outstanding invoice before changing Properties.')


def initial_customer_preview(local, price, quantity):
    customer = stripe.Customer.retrieve(local.external_customer_id)
    if (_value(customer, 'livemode', True) or _value(_value(customer, 'metadata') or {}, 'tenant_id') != local.tenant.tenant_id):
        raise StripeBillingError('stripe_customer_mismatch', 'Customer identity must be verified before quoting.')
    invoice = complete_invoice_lines(stripe.Invoice.create_preview(
        customer=local.external_customer_id, currency=price.currency,
        automatic_tax={'enabled': False},
        subscription_details={'items': [{'price': price.stripe_price_id, 'quantity': quantity}], 'default_tax_rates': []},
    ))
    if _value(invoice, 'currency') != price.currency:
        raise StripeBillingError('invoice_currency_mismatch', 'Invoice preview currency does not match the approved price.')
    return invoice


def preview_change(tenant, user, action, property_ids=None, draft=None, payment_method='card'):
    require_enabled()
    require_company_admin(user, tenant)
    if action not in {'start', 'add', 'remove', 'cancel', 'reactivate'}:
        raise StripeBillingError('invalid_action', 'Unsupported billing action.')
    local = TenantSubscription.objects.select_related('tenant').get(tenant=tenant)
    if BillingChange.objects.filter(tenant=tenant, state__in=INFLIGHT).exists():
        raise conflict('change_pending', 'Complete the pending billing change first.')
    before = manifest(local)
    draft = dict(draft or {})
    if draft and (action != 'add' or not str(draft.get('name', '')).strip()):
        raise StripeBillingError('invalid_property_draft', 'A new Property requires a name and the add action.')
    if draft and Property.objects.filter(name__iexact=draft['name'].strip()).exists():
        raise conflict('property_name_exists', 'A Property with this name already exists.')
    selected = list(Property.objects.filter(
        tenant=tenant, property_id__in=(property_ids or []),
    ).order_by('pk').values_list('pk', flat=True))
    if len(selected) != len(set(property_ids or [])):
        raise StripeBillingError('invalid_properties', 'Select existing Properties owned by this Company.')
    if action == 'start':
        if tenant.billing_model == MODEL and local.external_subscription_id:
            raise conflict('subscription_already_exists', 'Use the existing Company subscription.')
        if local.external_subscription_id:
            raise conflict('legacy_contract_requires_review', 'An existing contract needs an approved migration before enrollment.')
        if not selected:
            raise StripeBillingError('properties_required', 'Select at least one Property to enroll.')
        if (TenantMembership.objects.filter(tenant=tenant, is_active=True, role='technician').exists()
                and Job.objects.filter(property_id__in=selected, assigned_to__isnull=True).exists()):
            raise conflict('legacy_assignments_require_review', 'Review historical technician assignments before enrolling existing Properties. No assignments will be guessed or changed automatically.')
        after = selected
    elif action == 'add':
        if not selected and not draft:
            raise StripeBillingError('properties_required', 'Select a draft Property or enter a new Property name.')
        if set(selected) & set(before):
            raise conflict('property_already_billable', 'A selected Property is already enrolled.')
        after = sorted(set(before) | set(selected))
    elif action == 'remove':
        if not selected or not set(selected).issubset(before):
            raise StripeBillingError('invalid_properties', 'Select billable Properties to remove.')
        after = sorted(set(before) - set(selected))
        if not after:
            raise StripeBillingError('last_property', 'Use Cancel subscription to remove the final billable Property at period end.')
    else:
        after = before
    if action != 'start' and (tenant.billing_model != MODEL or not local.external_subscription_id):
        raise conflict('company_subscription_required', 'Enroll the Company before changing its subscription.')
    method = payment_method if action == 'start' else local.payment_method_type
    price = catalog_price(method)
    issuer_details()
    if not BillingProfile.objects.filter(tenant=tenant).exists():
        raise StripeBillingError('billing_profile_required', 'Save the Company billing identity before requesting a quote.')
    at = timezone.now().replace(microsecond=0)
    quantity = len(after) + bool(draft)
    quote = {
        'currency': price.currency.upper(), 'unit_amount_minor': price.unit_amount_minor,
        'old_quantity': len(before), 'quantity': quantity,
        'monthly_total_minor': quantity * price.unit_amount_minor,
        'amount_due_now_minor': quantity * price.unit_amount_minor if action == 'start' else 0,
        'credit_minor': 0, 'lines': [], 'previous_subscription_id': local.external_subscription_id or '',
        'affected_properties': list(Property.objects.filter(pk__in=selected if action in {'start', 'add', 'remove'} else before, tenant=tenant).order_by('pk').values('property_id', 'name')),
    }
    if draft:
        quote['affected_properties'].append({'property_id': None, 'name': draft['name'].strip()})
    if action != 'start':
        remote = stripe.Subscription.retrieve(local.external_subscription_id)
        item = validate_remote(remote, local, price)
        if _value(remote, 'status') in {'canceled', 'incomplete_expired'}:
            if action != 'reactivate':
                raise conflict('terminal_subscription', 'This contract has ended. Preview reactivation to create a new contract.')
            quote['new_contract'] = True
            quote['amount_due_now_minor'] = quantity * price.unit_amount_minor
        if _value(remote, 'pending_update'):
            raise conflict('change_pending', 'Stripe has a pending update. Reconcile it first.')
        if int(_value(item, 'quantity', 0)) != local.billing_quantity or local.billing_quantity != len(before):
            raise conflict('quantity_drift', 'The Company quantity requires reconciliation before another change.')
        assert_no_debt(local)
        if action in {'add', 'remove'}:
            invoice = complete_invoice_lines(stripe.Invoice.create_preview(
                customer=local.external_customer_id, subscription=local.external_subscription_id,
                subscription_details={
                    'items': [{'id': _provider_id(item), 'quantity': quantity}],
                    'proration_date': int(at.timestamp()),
                    'proration_behavior': 'always_invoice' if action == 'add' else 'create_prorations',
                },
            ))
            if _value(invoice, 'currency') != price.currency or _value(_value(invoice, 'lines', {}), 'has_more', False):
                raise StripeBillingError('invalid_preview', 'The invoice preview needs operator review.')
            quote['lines'] = [{'description': str(_value(line, 'description') or 'Proration'),
                               'amount_minor': int(_value(line, 'amount', 0))}
                              for line in _value(_value(invoice, 'lines', {}), 'data', [])]
            quote['amount_due_now_minor'] = max(0, int(_value(invoice, 'amount_due', 0))) if action == 'add' else 0
            if action == 'remove':
                prorations = [line for line in _value(_value(invoice, 'lines', {}), 'data', [])
                    if _value(line, 'proration', False) or _value(_value(_value(line, 'parent') or {}, 'subscription_item_details') or {}, 'proration', False)]
                quote['credit_minor'] = max(0, -sum(int(_value(line, 'amount', 0)) for line in prorations))
            quote['period_end_at'] = _subscription_period(remote, 'current_period_end')
    if (action == 'start' or quote.get('new_contract')) and local.external_customer_id:
        initial = initial_customer_preview(local, price, quantity)
        quote['amount_due_now_minor'] = max(0, int(_value(initial, 'amount_due', 0)))
        quote['lines'] = [{'description': str(_value(line, 'description') or 'Company subscription'),
                           'amount_minor': int(_value(line, 'amount', 0))}
                          for line in _value(_value(initial, 'lines', {}), 'data', [])]
    # Persist only a preview. No customer, property, invoice or subscription is
    # created by previewing; no browser quantity or money is trusted.
    return BillingChange.objects.create(
        tenant=tenant, actor=user, action=action, revision=local.billing_revision,
        before_manifest=before, after_manifest=after, draft=draft, price=price,
        payment_method=method, quote=quote, proration_at=at,
        expires_at=at + timedelta(seconds=getattr(settings, 'COMPANY_BILLING_QUOTE_SECONDS', 300)),
    )


def change_summary(change):
    return {'id': str(change.pk), 'action': change.action, 'state': change.state,
            'quote': {key: value for key, value in change.quote.items() if key != 'previous_subscription_id'}, 'expires_at': change.expires_at.isoformat(),
            'revision': change.revision, 'url': change.hosted_url or None,
            'error_code': change.error_code or None}


def confirm_change(tenant, user, operation_id):
    require_enabled()
    require_company_admin(user, tenant)
    # Revalidate catalog before committing intent, so changes to a configured
    # price invalidate a quote rather than silently changing its money.
    try:
        change_id = UUID(str(operation_id))
    except (ValueError, TypeError):
        raise StripeBillingError('invalid_operation', 'Invalid quote identity.')
    candidate = BillingChange.objects.select_related('price').filter(pk=change_id, tenant=tenant, actor=user).first()
    if candidate is None:
        raise PermissionDenied('This quote is not available to this Company and user.')
    if candidate.state != 'quoted':
        return candidate
    if candidate.expires_at <= timezone.now():
        raise conflict('stale_quote', 'This quote expired. Request a new quote.')
    price = catalog_price(candidate.payment_method)
    if price.pk != candidate.price_id or price.unit_amount_minor != candidate.quote['unit_amount_minor']:
        raise conflict('stale_quote', 'The catalog changed. Request a new quote.')
    if candidate.action == 'start' or candidate.quote.get('new_contract'):
        local_check = TenantSubscription.objects.select_related('tenant').get(tenant=tenant)
        if local_check.external_customer_id:
            fresh = initial_customer_preview(local_check, price, candidate.quote['quantity'])
            if (max(0, int(_value(fresh, 'amount_due', 0))) != candidate.quote['amount_due_now_minor']
                    or [int(_value(line, 'amount', 0)) for line in _value(_value(fresh, 'lines', {}), 'data', [])] != [line['amount_minor'] for line in candidate.quote['lines']]):
                raise conflict('stale_quote', 'Customer credits or invoice items changed. Request a new quote.')
    if candidate.action in {'add', 'remove'}:
        local_check = TenantSubscription.objects.select_related('tenant').get(tenant=tenant)
        remote_check = stripe.Subscription.retrieve(local_check.external_subscription_id)
        item_check = validate_remote(remote_check, local_check, price)
        if candidate.quote.get('period_end_at', 0) <= timezone.now().timestamp():
            raise conflict('stale_quote', 'The billing period changed. Preview again.')
        assert_no_debt(local_check)
        fresh = complete_invoice_lines(stripe.Invoice.create_preview(customer=local_check.external_customer_id,
            subscription=local_check.external_subscription_id,
            subscription_details={'items': [{'id': _provider_id(item_check), 'quantity': candidate.quote['quantity']}],
                'proration_date': int(candidate.proration_at.timestamp()),
                'proration_behavior': 'always_invoice' if candidate.action == 'add' else 'create_prorations'}))
        amounts = [int(_value(line, 'amount', 0)) for line in _value(_value(fresh, 'lines', {}), 'data', [])]
        if (_value(fresh, 'currency') != price.currency
                or amounts != [line['amount_minor'] for line in candidate.quote['lines']]
                or (candidate.action == 'add' and max(0, int(_value(fresh, 'amount_due', 0))) != candidate.quote['amount_due_now_minor'])):
            raise conflict('stale_quote', 'The invoice amount changed. Preview and confirm the new quote.')
    with transaction.atomic():
        locked_tenant = Tenant.objects.select_for_update().get(pk=tenant.pk)
        local = TenantSubscription.objects.select_for_update().get(tenant=locked_tenant)
        change = BillingChange.objects.select_for_update().get(pk=change_id)
        if change.state != 'quoted':
            return change
        if change.expires_at <= timezone.now() or change.revision != local.billing_revision or manifest(local) != change.before_manifest:
            raise conflict('stale_quote', 'This quote expired or the Property manifest changed. Preview again.')
        if BillingChange.objects.filter(tenant=tenant, state__in=INFLIGHT).exists():
            raise conflict('change_pending', 'Another billing change is pending.')
        if change.action == 'start' and local.external_subscription_id:
            raise conflict('subscription_already_exists', 'An existing subscription requires review.')
        # Recheck ownership/archive state at confirmation, not just preview.
        expected = set(change.after_manifest) | set(change.before_manifest)
        if Property.objects.filter(pk__in=expected, tenant=tenant).count() != len(expected):
            raise conflict('stale_quote', 'A selected Property changed. Preview again.')
        if change.draft:
            if Property.objects.filter(name__iexact=change.draft['name'].strip()).exists():
                raise conflict('property_name_exists', 'A Property with this name already exists.')
            try:
                with transaction.atomic():
                    prop = Property.objects.create(tenant=tenant, name=change.draft['name'].strip(),
                        description=change.draft.get('description', ''), subscription_status='pending_payment')
            except IntegrityError as exc:
                raise conflict('property_name_exists', 'The Property changed concurrently. Preview a new name.') from exc
            change.after_manifest = sorted([*change.after_manifest, prop.pk])
        change.state = 'applying'
        change.confirmed_at = timezone.now()
        change.save(update_fields=['after_manifest', 'state', 'confirmed_at', 'updated_at'])
        local.desired_quantity = len(change.after_manifest)
        local.reconciliation_status = 'applying'
        # Mode is changed only by this explicit confirmation, not a migration.
        if change.action == 'start' or change.quote.get('new_contract'):
            locked_tenant.billing_model = MODEL
            locked_tenant.billing_currency = price.currency
            locked_tenant.save(update_fields=['billing_model', 'billing_currency', 'updated_at'])
            local.payment_method_type = change.payment_method
            local.collection_method = 'send_invoice' if change.payment_method == 'promptpay' else 'charge_automatically'
            local.stripe_price_id = price.stripe_price_id
        local.save()
        for prop_id in set(change.after_manifest) - set(change.before_manifest):
            enrollment, _ = PropertyBillingEnrollment.objects.get_or_create(property_id=prop_id,
                defaults={'tenant': tenant, 'subscription': local, 'state': 'pending_payment', 'revision': change.revision + 1})
            if enrollment.tenant_id != tenant.pk:
                raise conflict('manifest_mismatch', 'A Property enrollment belongs to another Company.')
            enrollment.state = 'pending_payment'
            enrollment.ended_at = None
            enrollment.revision = change.revision + 1
            enrollment.save(update_fields=['state', 'ended_at', 'revision'])
            Property.objects.filter(pk=prop_id, tenant=tenant).update(subscription_status='pending_payment', archived_at=None)
    process_change(change.pk)
    return BillingChange.objects.get(pk=change.pk)


def process_change(operation_id):
    """Retryable outbox consumer. Lease and remote idempotency survive crashes."""
    require_enabled()
    with transaction.atomic():
        change = BillingChange.objects.select_for_update().select_related('tenant', 'price', 'actor').get(pk=operation_id)
        if change.state != 'applying' or (change.lease_until and change.lease_until > timezone.now()):
            return
        change.lease_until = timezone.now() + timedelta(minutes=3)
        change.attempts += 1
        change.save(update_fields=['lease_until', 'attempts', 'updated_at'])
    try:
        _execute_change(change)
    except (stripe.StripeError, StripeBillingError) as exc:
        # Keep intent locked against other changes after uncertain remote
        # success. Reconciliation retries with the SAME provider keys.
        BillingChange.objects.filter(pk=change.pk).update(
            error_code=getattr(exc, 'code', None) or 'provider_unavailable', lease_until=None,
        )
        raise


def _execute_change(change):
    local = TenantSubscription.objects.select_related('tenant').get(tenant=change.tenant)
    key = f'staymaint-company-{change.pk}'
    metadata = {'tenant_id': change.tenant.tenant_id, 'billing_model': MODEL, 'billing_change_id': str(change.pk)}
    if change.action == 'start' or change.quote.get('new_contract'):
        customer = get_or_create_stripe_customer(change.tenant, change.actor)
        customer_record = stripe.Customer.retrieve(customer)
        if (_value(customer_record, 'livemode', True)
                or _value(_value(customer_record, 'metadata') or {}, 'tenant_id') != change.tenant.tenant_id):
            raise StripeBillingError('stripe_customer_mismatch', 'Existing Customer identity must be verified before updating billing details.')
        from .promptpay import update_stripe_profile
        update_stripe_profile(customer, BillingProfile.objects.get(tenant=change.tenant))
        local.external_customer_id = customer
        # Provider idempotency retention is finite. Recover by durable operation
        # metadata too, so a delayed retry cannot create a second contract.
        subscriptions = stripe.Subscription.list(customer=customer, status='all', limit=100)
        subscription_rows = subscriptions.auto_paging_iter() if hasattr(subscriptions, 'auto_paging_iter') else _value(subscriptions, 'data', [])
        recovered = None
        for existing in subscription_rows:
            if _value(_value(existing, 'metadata') or {}, 'billing_change_id') == str(change.pk):
                recovered = existing
            elif _value(existing, 'status') not in {'canceled', 'incomplete_expired'}:
                raise conflict('remote_contract_requires_review', 'An existing Stripe contract must be reconciled before creating another.')
        sessions = stripe.checkout.Session.list(customer=customer, limit=100)
        session_rows = sessions.auto_paging_iter() if hasattr(sessions, 'auto_paging_iter') else _value(sessions, 'data', [])
        session = None
        for existing in session_rows:
            if _value(_value(existing, 'metadata') or {}, 'billing_change_id') == str(change.pk):
                session = existing
            elif _value(existing, 'mode') == 'subscription' and _value(existing, 'status') == 'open':
                raise conflict('checkout_requires_review', 'Resolve an existing open Checkout before creating another contract.')
        if change.payment_method == 'card':
            frontend = str(settings.FRONTEND_BASE_URL).rstrip('/')
            if session is None and recovered:
                sync_company_subscription(recovered)
                reconcile_company_invoice(stripe.Invoice.retrieve(_provider_id(_value(recovered, 'latest_invoice'))))
                return
            session = session or stripe.checkout.Session.create(
                mode='subscription', customer=customer, payment_method_types=['card'],
                line_items=[{'price': change.price.stripe_price_id, 'quantity': len(change.after_manifest)}],
                subscription_data={'metadata': metadata, 'default_tax_rates': []},
                automatic_tax={'enabled': False}, client_reference_id=change.tenant.tenant_id,
                success_url=f'{frontend}/dashboard/settings/billing/success/?tenant_id={change.tenant.tenant_id}',
                cancel_url=f'{frontend}/dashboard/settings/billing/',
                metadata=metadata, idempotency_key=f'{key}-checkout',
            )
            BillingChange.objects.filter(pk=change.pk).update(
                checkout_session_id=_provider_id(session), hosted_url=_value(session, 'url') or '',
                state='awaiting_payment', lease_until=None,
            )
            return
        remote = recovered or stripe.Subscription.create(
            customer=customer, items=[{'price': change.price.stripe_price_id, 'quantity': len(change.after_manifest)}],
            collection_method='send_invoice', days_until_due=getattr(settings, 'BILLING_INVOICE_DAYS_UNTIL_DUE', 7),
            payment_settings={'payment_method_types': ['promptpay']},
            automatic_tax={'enabled': False}, default_tax_rates=[], metadata=metadata,
            idempotency_key=f'{key}-subscription',
        )
        validate_remote(remote, local, change.price, allow_new=True)
        with transaction.atomic():
            locked = TenantSubscription.objects.select_for_update().get(pk=local.pk)
            if locked.external_subscription_id and locked.external_subscription_id != _provider_id(remote) and not (
                    change.quote.get('new_contract') and locked.external_subscription_id == change.quote.get('previous_subscription_id')):
                raise conflict('subscription_conflict', 'Another subscription is already bound.')
            locked.external_subscription_id = _provider_id(remote)
            if change.quote.get('new_contract'):
                locked.stripe_subscription_item_id = None
            locked.save(update_fields=['external_subscription_id', 'stripe_subscription_item_id', 'updated_at'])
        local.refresh_from_db()
    else:
        remote = stripe.Subscription.retrieve(local.external_subscription_id)
        item = validate_remote(remote, local, change.price)
        if change.action in {'add', 'remove'} and _value(remote, 'status') not in {'active', 'trialing', 'past_due'}:
            raise conflict('subscription_requires_review', 'Resolve the current subscription state before changing Properties.')
        if change.action in {'cancel', 'reactivate'}:
            remote = stripe.Subscription.modify(local.external_subscription_id,
                cancel_at_period_end=change.action == 'cancel', idempotency_key=f'{key}-lifecycle')
            sync_company_subscription(remote)
            BillingChange.objects.filter(pk=change.pk).update(state='completed', lease_until=None, error_code='')
            TenantSubscription.objects.filter(pk=local.pk).update(reconciliation_status='synced')
            TenantSubscription.objects.filter(pk=local.pk).update(billing_revision=change.revision + 1)
            return
        if int(_value(item, 'quantity', 0)) != len(change.before_manifest) and _value(_value(remote, 'metadata') or {}, 'billing_change_id') != str(change.pk):
            raise conflict('quantity_drift', 'Stripe quantity changed after the quote; reconciliation is required.')
        # Metadata is not a supported pending-update attribute. Pin the
        # manifest separately before requesting the payment-pending update.
        stripe.Subscription.modify(local.external_subscription_id, metadata=metadata,
                                   idempotency_key=f'{key}-manifest')
        remote = stripe.Subscription.modify(
            local.external_subscription_id,
            items=[{'id': _provider_id(item), 'quantity': len(change.after_manifest)}],
            proration_date=int(change.proration_at.timestamp()),
            proration_behavior='always_invoice' if change.action == 'add' else 'create_prorations',
            payment_behavior=('pending_if_incomplete' if change.payment_method == 'card' and change.action == 'add' else 'allow_incomplete'),
            idempotency_key=f'{key}-quantity',
        )
        if change.action == 'remove':
            _complete_removal(change, remote)
            return
    sync_company_subscription(remote)
    invoice_id = _provider_id(_value(remote, 'latest_invoice'))
    if not invoice_id:
        raise StripeBillingError('invoice_not_ready', 'Stripe has not returned the adjustment invoice yet.')
    # Save correlation BEFORE finalization can emit a paid webhook.
    BillingChange.objects.filter(pk=change.pk).update(provider_invoice_id=invoice_id)
    invoice = stripe.Invoice.retrieve(invoice_id)
    if _value(invoice, 'status') == 'draft':
        invoice = stripe.Invoice.finalize_invoice(invoice_id, auto_advance=True, idempotency_key=f'{key}-finalize')
    reconcile_company_invoice(invoice)
    BillingChange.objects.filter(pk=change.pk).exclude(state='completed').update(
        state='awaiting_payment', hosted_url=_value(invoice, 'hosted_invoice_url') or '', lease_until=None,
    )


@transaction.atomic
def _complete_removal(change, remote):
    local = TenantSubscription.objects.select_for_update().get(tenant=change.tenant)
    removed = set(change.before_manifest) - set(change.after_manifest)
    PropertyBillingEnrollment.objects.filter(subscription=local, property_id__in=removed).update(state='inactive', ended_at=change.proration_at)
    Property.objects.filter(pk__in=removed, tenant=change.tenant).update(archived_at=change.proration_at, subscription_status='inactive')
    _bind_remote(local, remote, change.price)
    local.billing_revision = change.revision + 1
    local.reconciliation_status = 'synced'
    from .coverage import paid_property_ids
    local.paid_quantity = Property.objects.filter(tenant=local.tenant, pk__in=paid_property_ids()).count()
    local.save()
    BillingChange.objects.filter(pk=change.pk).update(state='completed', lease_until=None, error_code='')


def _bind_remote(local, remote, price):
    item = validate_remote(remote, local, price)
    local.stripe_subscription_item_id = _provider_id(item)
    local.stripe_price_id = price.stripe_price_id
    local.billing_quantity = int(_value(item, 'quantity', 0))
    local.provider_period_start_at = _timestamp_to_datetime(_subscription_period(remote, 'current_period_start'))
    local.provider_period_end_at = _timestamp_to_datetime(_subscription_period(remote, 'current_period_end'))
    local.cancel_at_period_end = bool(_value(remote, 'cancel_at_period_end', False))
    from .stripe_service import map_stripe_status
    local.status = map_stripe_status(_value(remote, 'status'))


@transaction.atomic
def sync_company_subscription(remote):
    customer = _provider_id(_value(remote, 'customer'))
    local = TenantSubscription.objects.select_for_update().select_related('tenant').filter(external_customer_id=customer, tenant__billing_model=MODEL).first()
    if not local:
        raise StripeBillingError('subscription_resolution_failed', 'No Company subscription matches this customer.')
    metadata = _value(remote, 'metadata') or {}
    operation_id = _value(metadata, 'billing_change_id')
    operation = BillingChange.objects.filter(pk=operation_id, tenant=local.tenant).select_related('price').first() if operation_id else None
    if local.external_subscription_id and local.external_subscription_id != _provider_id(remote):
        if (operation and operation.confirmed_at and operation.quote.get('new_contract')
                and operation.quote.get('previous_subscription_id') == local.external_subscription_id
                and _value(stripe.Subscription.retrieve(local.external_subscription_id), 'status') in {'canceled', 'incomplete_expired'}):
            local.external_subscription_id = _provider_id(remote)
            local.stripe_subscription_item_id = None
        else:
            raise StripeBillingError('stripe_subscription_mismatch', 'An unrelated subscription cannot replace the Company contract.')
    if not local.external_subscription_id:
        if not operation or operation.action != 'start' or not operation.confirmed_at:
            raise StripeBillingError('unapproved_subscription', 'Subscription is not linked to a confirmed enrollment.')
        local.external_subscription_id = _provider_id(remote)
    price = BillingPrice.objects.get(stripe_price_id=local.stripe_price_id)
    _bind_remote(local, remote, price)
    # Provider active/quantity is a projection, never evidence of payment.
    local.save()
    return local


def invoice_manifest_operation(invoice, local):
    metadata = _value(invoice, 'metadata') or {}
    details = _value(_value(invoice, 'parent') or {}, 'subscription_details') or _value(invoice, 'subscription_details') or {}
    metadata = _value(details, 'metadata') or metadata
    operation_id = _value(metadata, 'billing_change_id')
    try:
        operation = BillingChange.objects.filter(pk=operation_id, tenant=local.tenant, confirmed_at__isnull=False).select_related('price').first() if operation_id else None
    except (ValueError, TypeError):
        operation = None
    if not operation:
        operation = BillingChange.objects.filter(tenant=local.tenant, provider_invoice_id=_provider_id(invoice), confirmed_at__isnull=False).select_related('price').first()
    if not operation:
        raise StripeBillingError('unallocated_invoice', 'Invoice has no provable Company Property manifest.')
    return operation


@transaction.atomic
def reconcile_company_invoice(invoice):
    from .documents import snapshot_invoice
    customer = _provider_id(_value(invoice, 'customer'))
    local = TenantSubscription.objects.select_for_update().select_related('tenant').get(external_customer_id=customer, tenant__billing_model=MODEL)
    if _invoice_subscription_id(invoice) != local.external_subscription_id:
        raise StripeBillingError('stripe_subscription_mismatch', 'Invoice subscription does not match the Company.')
    if _value(invoice, 'status') == 'draft':
        return
    operation = invoice_manifest_operation(invoice, local)
    if _value(invoice, 'currency') != operation.price.currency or _value(invoice, 'livemode', True):
        raise StripeBillingError('invalid_invoice', 'Invoice currency or test mode does not match.')
    invoice = complete_invoice_lines(invoice)
    document = snapshot_invoice(invoice, local)
    document.credited_minor = sum(int(_value(invoice, key, 0) or 0) for key in ('pre_payment_credit_notes_amount', 'post_payment_credit_notes_amount'))
    lines = _value(_value(invoice, 'lines') or {}, 'data', [])
    purpose = 'adjustment' if _value(invoice, 'billing_reason') == 'subscription_update' else 'renewal'
    selected = operation.after_manifest
    if purpose == 'adjustment':
        selected = sorted(set(operation.after_manifest) - set(operation.before_manifest))
    coverage_lines = []
    for line in lines:
        price_id = _provider_id(_value(line, 'price')) or _value(_value(_value(line, 'pricing') or {}, 'price_details') or {}, 'price')
        if price_id != operation.price.stripe_price_id or int(_value(line, 'amount', 0)) < 0:
            continue
        # Renewal line quantity must prove the complete manifest. Adjustment
        # debit lines commonly contain the new total quantity, not just delta.
        if int(_value(line, 'quantity', 0)) != len(operation.after_manifest):
            raise StripeBillingError('invoice_quantity_mismatch', 'Invoice quantity does not match the approved manifest.')
        period = _value(line, 'period') or {}
        start, end = _value(period, 'start'), _value(period, 'end')
        if not start or not end or end <= start:
            raise StripeBillingError('invalid_invoice_period', 'Invoice coverage period is missing.')
        coverage_lines.append((str(_value(line, 'id') or ''), _timestamp_to_datetime(start), _timestamp_to_datetime(end)))
    if not coverage_lines or any(not line[0] for line in coverage_lines):
        raise StripeBillingError('unallocated_invoice', 'Invoice has no matching subscription coverage lines.')
    document.billing_revision = operation.revision + 1
    document.quantity = len(operation.after_manifest)
    document.unit_amount_minor = operation.price.unit_amount_minor
    document.purpose = purpose
    # Identity comes from the operation manifest, never a current company list.
    if not document.property_manifest:
        document.property_manifest = list(Property.objects.filter(pk__in=operation.after_manifest, tenant=local.tenant).order_by('pk').values('property_id', 'name'))
    document.save(update_fields=['billing_revision', 'quantity', 'unit_amount_minor', 'purpose', 'property_manifest', 'credited_minor'])
    if len(document.property_manifest) != len(operation.after_manifest):
        raise StripeBillingError('manifest_mismatch', 'A billed Property is no longer owned by the Company.')
    is_paid = _value(invoice, 'status') == 'paid' and int(_value(invoice, 'amount_remaining', -1)) == 0 and document.paid_at
    for prop_id in selected:
        for line_id, start, end in coverage_lines:
            allocation, _ = BillingInvoiceAllocation.objects.get_or_create(invoice=document, property_id=prop_id, line_id=line_id,
                defaults={'period_start_at': start, 'period_end_at': end})
            if is_paid and allocation.paid_at is None:
                allocation.paid_at = document.paid_at
                allocation.save(update_fields=['paid_at'])
    if is_paid:
        from .documents import send_paid_receipt_email
        transaction.on_commit(lambda invoice_id=document.pk: send_paid_receipt_email(invoice_id))
        for prop_id in selected:
            end = max(line[2] for line in coverage_lines)
            enrollment, _ = PropertyBillingEnrollment.objects.get_or_create(property_id=prop_id,
                defaults={'tenant': local.tenant, 'subscription': local})
            if enrollment.tenant_id != local.tenant_id:
                raise StripeBillingError('manifest_mismatch', 'Property enrollment Company mismatch.')
            # Old payments cannot revive a removed Property or shorten a newer period.
            if enrollment.revision > operation.revision + 1 or (enrollment.ended_at and enrollment.ended_at >= operation.proration_at):
                continue
            enrollment.state = 'billable'
            enrollment.effective_at = enrollment.effective_at or min(line[1] for line in coverage_lines)
            enrollment.paid_through_at = max(filter(None, [enrollment.paid_through_at, end]))
            enrollment.paid_subscription_id = local.external_subscription_id
            enrollment.revision = max(enrollment.revision, operation.revision + 1)
            enrollment.save()
            Property.objects.filter(pk=prop_id, archived_at__isnull=True).update(subscription_status='active')
            Property.objects.filter(pk=prop_id, activated_at__isnull=True, archived_at__isnull=True).update(activated_at=enrollment.effective_at)
        local.billing_revision = max(local.billing_revision, operation.revision + 1)
        from .coverage import paid_property_ids
        local.paid_quantity = Property.objects.filter(tenant=local.tenant, pk__in=paid_property_ids()).count()
        local.paid_through_at = max(filter(None, [local.paid_through_at, *[line[2] for line in coverage_lines]]))
        local.reconciliation_status = 'synced'
        local.save()
        if operation.state in INFLIGHT:
            operation.state = 'completed'
            operation.provider_invoice_id = _provider_id(invoice)
            operation.lease_until = None
            operation.save(update_fields=['state', 'provider_invoice_id', 'lease_until', 'updated_at'])
    return document
