"""Company contract tests with a deterministic, fault-injectable Stripe boundary."""
from copy import deepcopy
from datetime import timedelta
from unittest.mock import patch

import stripe
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .billing.company_service import confirm_change, preview_change, sync_company_subscription
from .billing.stripe_service import process_webhook_event
from .entitlements import get_tenant_entitlement
from .models import (
    BillingChange, BillingInvoice, BillingInvoiceAllocation, BillingPrice, BillingProfile, Job, Machine,
    Property, PropertyBillingEnrollment, SubscriptionPlan, Tenant, TenantMembership,
    TenantSubscription, User,
)
from .tenancy import get_accessible_jobs, get_accessible_machines, get_operable_properties
from .tests_stripe_billing import TEST_SETTINGS


@override_settings(**{**TEST_SETTINGS, 'COMPANY_BILLING_ENABLED': True,
    'COMPANY_BILLING_GRACE_DAYS': 7,
    'BILLING_ISSUER': {'legal_name': 'Test provider', 'address': 'Bangkok', 'tax_id': '1234567890123', 'email': 'billing@example.test'}})
class CompanyBillingTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('company-admin', email='admin@example.test')
        self.tenant = Tenant.objects.create(name='Company A', owner=self.user)
        self.membership = TenantMembership.objects.create(tenant=self.tenant, user=self.user, role='company_admin')
        self.plan, _ = SubscriptionPlan.objects.get_or_create(code='starter', defaults={'name': 'Legacy Basic'})
        self.local = TenantSubscription.objects.create(tenant=self.tenant, plan=self.plan, status='suspended')
        self.properties = [Property.objects.create(name=f'Hotel {i}', tenant=self.tenant) for i in range(1, 4)]
        self.usd = BillingPrice.objects.create(currency='usd', stripe_product_id='prod_property', stripe_price_id='price_property_usd', unit_amount_minor=2000)
        self.thb = BillingPrice.objects.create(currency='thb', stripe_product_id='prod_property', stripe_price_id='price_property_thb', unit_amount_minor=70000)
        BillingProfile.objects.create(tenant=self.tenant, legal_name='Company A', address='Bangkok', tax_id='1234567890123', email='admin@example.test')
        self.remote = None
        self.invoices = {}
        self.client.force_authenticate(self.user)
        self.enterContext(patch('stripe.Price.retrieve', side_effect=self.price))
        self.customer = self.enterContext(patch('stripe.Customer.create', return_value={'id': 'cus_company'}))
        self.enterContext(patch('stripe.Customer.retrieve', return_value={'id': 'cus_company', 'livemode': False, 'metadata': {'tenant_id': self.tenant.tenant_id}}))
        self.enterContext(patch('stripe.Customer.modify', return_value={}))
        self.checkout = self.enterContext(patch('stripe.checkout.Session.create', return_value={'id': 'cs_company', 'url': 'https://checkout.stripe.com/test'}))
        self.enterContext(patch('stripe.checkout.Session.list', return_value={'data': []}))
        self.enterContext(patch('stripe.Subscription.list', return_value={'data': []}))
        self.create = self.enterContext(patch('stripe.Subscription.create', side_effect=self.create_remote))
        self.retrieve = self.enterContext(patch('stripe.Subscription.retrieve', side_effect=lambda *a, **kw: deepcopy(self.remote)))
        self.modify = self.enterContext(patch('stripe.Subscription.modify', side_effect=self.modify_remote))
        self.preview = self.enterContext(patch('stripe.Invoice.create_preview', side_effect=self.preview_remote))
        self.enterContext(patch('stripe.Invoice.retrieve', side_effect=lambda invoice_id, **kw: deepcopy(self.invoices[invoice_id])))
        self.enterContext(patch('stripe.Invoice.finalize_invoice', side_effect=lambda invoice_id, **kw: deepcopy(self.invoices[invoice_id])))
        self.enterContext(patch('stripe.Invoice.list', side_effect=self.list_invoices))

    def price(self, price_id):
        row = BillingPrice.objects.get(stripe_price_id=price_id)
        return {'id': price_id, 'currency': row.currency, 'unit_amount': row.unit_amount_minor,
                'product': row.stripe_product_id, 'active': True, 'livemode': False,
                'billing_scheme': 'per_unit', 'recurring': {'interval': 'month', 'interval_count': 1, 'usage_type': 'licensed'}}

    def list_invoices(self, **kwargs):
        return {'data': [deepcopy(i) for i in self.invoices.values() if not kwargs.get('status') or i['status'] == kwargs['status']]}

    def create_remote(self, **kwargs):
        operation = BillingChange.objects.get(pk=kwargs['metadata']['billing_change_id'])
        start = int(operation.proration_at.timestamp())
        self.remote = {'id': f'sub_{operation.pk.hex}', 'customer': 'cus_company', 'status': 'active', 'livemode': False,
            'metadata': kwargs['metadata'], 'collection_method': kwargs.get('collection_method', 'charge_automatically'),
            'cancel_at_period_end': False, 'current_period_start': start, 'current_period_end': start + 30 * 86400,
            'items': {'data': [{'id': 'si_company', 'price': {'id': operation.price.stripe_price_id}, 'quantity': len(operation.after_manifest)}]}}
        self.make_invoice(operation, initial=True)
        return deepcopy(self.remote)

    def make_invoice(self, operation, initial=False):
        invoice_id = f'in_{operation.pk.hex}'
        unit = operation.price.unit_amount_minor
        quantity = len(operation.after_manifest)
        start = int(operation.proration_at.timestamp())
        end = self.remote['current_period_end']
        lines = [{'id': f'il_{operation.pk.hex}', 'description': 'StayMaint Property Subscription',
                  'price': {'id': operation.price.stripe_price_id}, 'quantity': quantity,
                  'amount': unit * quantity if initial else unit * quantity // 2,
                  'period': {'start': start, 'end': end}}]
        if not initial:
            lines.insert(0, {'id': 'il_credit', 'description': 'Unused paid units',
                'price': {'id': operation.price.stripe_price_id}, 'quantity': len(operation.before_manifest),
                'amount': -unit * len(operation.before_manifest) // 2, 'period': {'start': start, 'end': end}})
        total = sum(line['amount'] for line in lines)
        self.invoices[invoice_id] = {'id': invoice_id, 'customer': 'cus_company', 'subscription': self.remote['id'],
            'status': 'open', 'livemode': False, 'currency': operation.price.currency,
            'number': 'TEST-001', 'created': start, 'due_date': start + 7 * 86400,
            'billing_reason': 'subscription_create' if initial else 'subscription_update',
            'subscription_details': {'metadata': self.remote['metadata']},
            'total': total, 'amount_due': total, 'amount_paid': 0, 'amount_remaining': total,
            'status_transitions': {'finalized_at': start, 'paid_at': None}, 'lines': {'data': lines},
            'hosted_invoice_url': 'https://invoice.stripe.com/i/company'}
        self.remote['latest_invoice'] = invoice_id
        return invoice_id

    def modify_remote(self, subscription_id, **kwargs):
        if 'metadata' in kwargs:
            self.remote['metadata'] = kwargs['metadata']
        if 'cancel_at_period_end' in kwargs:
            self.remote['cancel_at_period_end'] = kwargs['cancel_at_period_end']
        if 'items' in kwargs:
            operation = BillingChange.objects.get(pk=self.remote['metadata']['billing_change_id'])
            if kwargs.get('payment_behavior') == 'pending_if_incomplete':
                self.remote['pending_update'] = {'quantity': kwargs['items'][0]['quantity']}
            else:
                self.remote['items']['data'][0]['quantity'] = kwargs['items'][0]['quantity']
            if kwargs['proration_behavior'] == 'always_invoice':
                self.make_invoice(operation)
        return deepcopy(self.remote)

    def preview_remote(self, **kwargs):
        quantity = kwargs['subscription_details']['items'][0]['quantity']
        if 'subscription' not in kwargs:
            row = BillingPrice.objects.get(stripe_price_id=kwargs['subscription_details']['items'][0]['price'])
            return {'currency': row.currency, 'amount_due': quantity * row.unit_amount_minor,
                'lines': {'data': [{'description': 'Company subscription', 'amount': quantity * row.unit_amount_minor}]}}
        old = self.remote['items']['data'][0]['quantity']
        unit = BillingPrice.objects.get(stripe_price_id=self.remote['items']['data'][0]['price']['id']).unit_amount_minor
        return {'currency': 'thb' if unit != 2000 else 'usd', 'amount_due': max(0, (quantity - old) * unit // 2),
                'lines': {'data': [{'description': 'Unused units', 'amount': -old * unit // 2, 'proration': True},
                                   {'description': 'New units', 'amount': quantity * unit // 2, 'proration': True}]}}

    def start(self, count=2, method='card', paid=True):
        quote = preview_change(self.tenant, self.user, 'start', property_ids=[p.property_id for p in self.properties[:count]], payment_method=method)
        change = confirm_change(self.tenant, self.user, quote.pk)
        self.tenant.refresh_from_db(); self.local.refresh_from_db()
        if method == 'card':
            self.create_remote(customer='cus_company', metadata={'tenant_id': self.tenant.tenant_id, 'billing_model': 'property_quantity_v1', 'billing_change_id': str(change.pk)})
        if paid:
            self.pay(change)
        return change

    def pay(self, change, event_id=None):
        if self.remote.get('pending_update'):
            self.remote['items']['data'][0]['quantity'] = self.remote.pop('pending_update')['quantity']
        invoice_id = self.remote['latest_invoice']
        invoice = self.invoices[invoice_id]
        invoice.update(status='paid', amount_paid=invoice['total'], amount_remaining=0)
        invoice['status_transitions']['paid_at'] = int(timezone.now().timestamp())
        event = {'id': event_id or f'evt_{change.pk.hex}', 'type': 'invoice.paid', 'created': int(timezone.now().timestamp()), 'data': {'object': deepcopy(invoice)}}
        result = process_webhook_event(event)
        self.local.refresh_from_db(); self.tenant.refresh_from_db()
        return result

    def post(self, endpoint, **data):
        return self.client.post(f'/api/v1/billing/{endpoint}/', {'tenant_id': self.tenant.tenant_id, **data}, format='json')

    def test_one_property_costs_twenty_dollars_and_checkout_quantity_is_one(self):
        self.start(1)
        self.assertEqual(self.checkout.call_args.kwargs['line_items'], [{'price': self.usd.stripe_price_id, 'quantity': 1}])
        self.assertEqual(BillingInvoice.objects.get().total_minor, 2000)
        self.assertEqual(self.local.billing_quantity, 1)

    def test_two_properties_one_consolidated_invoice_forty_dollars(self):
        self.start(2)
        self.assertEqual(BillingInvoice.objects.count(), 1)
        invoice = BillingInvoice.objects.get()
        self.assertEqual(invoice.total_minor, 4000)
        self.assertEqual(len(invoice.property_manifest), 2)
        self.assertEqual(self.local.paid_quantity, 2)
        self.assertEqual(invoice.allocations.count(), 2)
        self.assertEqual(self.customer.call_count, 1)

    def test_add_third_prorates_and_does_not_unlock_it_before_payment(self):
        self.start(2)
        quote = preview_change(self.tenant, self.user, 'add', property_ids=[self.properties[2].property_id])
        self.assertEqual(quote.quote['monthly_total_minor'], 6000)
        self.assertEqual(quote.quote['amount_due_now_minor'], 1000)
        change = confirm_change(self.tenant, self.user, quote.pk)
        self.assertFalse(get_operable_properties(self.user).filter(pk=self.properties[2].pk).exists())
        update = [call.kwargs for call in self.modify.call_args_list if 'items' in call.kwargs][-1]
        self.assertEqual(update['proration_date'], int(quote.proration_at.timestamp()))
        self.assertEqual(update['payment_behavior'], 'pending_if_incomplete')
        self.pay(change)
        self.assertTrue(get_operable_properties(self.user).filter(pk=self.properties[2].pk).exists())
        self.assertEqual(self.local.billing_quantity, 3)
        self.assertEqual(self.local.paid_quantity, 3)

    def test_remove_one_keeps_records_and_changes_base_to_forty(self):
        self.start(3)
        original_ids = list(Property.objects.values_list('pk', 'property_id', 'tenant_id'))
        job = Job.objects.create(property=self.properties[2], user=self.user, description='Preserve me')
        quote = preview_change(self.tenant, self.user, 'remove', property_ids=[self.properties[2].property_id])
        self.assertEqual(quote.quote['monthly_total_minor'], 4000)
        self.assertGreater(quote.quote['credit_minor'], 0)
        confirm_change(self.tenant, self.user, quote.pk)
        self.local.refresh_from_db(); job.refresh_from_db()
        self.assertEqual(self.local.billing_quantity, 2)
        self.assertEqual(list(Property.objects.values_list('pk', 'property_id', 'tenant_id')), original_ids)
        self.assertEqual(job.property_id, self.properties[2].pk)
        self.assertFalse(get_operable_properties(self.user).filter(pk=self.properties[2].pk).exists())

    def test_unpaid_initial_card_active_status_grants_nothing(self):
        self.start(2, paid=False)
        sync_company_subscription(self.remote)
        self.assertFalse(get_tenant_entitlement(Tenant.objects.get(pk=self.tenant.pk)).can_write)
        self.assertEqual(get_operable_properties(self.user).count(), 0)

    def test_successful_promptpay_is_thb_manual_quantity_and_paid_coverage(self):
        self.start(2, method='promptpay')
        args = self.create.call_args.kwargs
        self.assertEqual(args['collection_method'], 'send_invoice')
        self.assertEqual(args['payment_settings']['payment_method_types'], ['promptpay'])
        self.assertEqual(args['items'][0]['quantity'], 2)
        self.assertEqual(BillingInvoice.objects.get().currency, 'thb')
        self.assertEqual(self.local.paid_quantity, 2)

    def test_unpaid_promptpay_has_no_access_or_receipt(self):
        self.start(2, method='promptpay', paid=False)
        self.assertEqual(get_operable_properties(self.user).count(), 0)
        self.assertIsNone(BillingInvoice.objects.get().receipt_number)

    def test_duplicate_and_distinct_payment_events_cannot_duplicate_coverage(self):
        change = self.start(2)
        self.assertFalse(self.pay(change))
        self.assertTrue(self.pay(change, event_id='evt_distinct_same_invoice'))
        self.assertEqual(BillingInvoice.objects.count(), 1)
        self.assertEqual(BillingInvoice.objects.get().allocations.count(), 2)
        self.assertEqual(self.local.billing_revision, 1)

    def test_preview_is_read_only_and_confirmation_replay_reuses_checkout(self):
        quote = preview_change(self.tenant, self.user, 'start', property_ids=[self.properties[0].property_id])
        self.checkout.assert_not_called(); self.customer.assert_not_called()
        confirm_change(self.tenant, self.user, quote.pk)
        confirm_change(self.tenant, self.user, quote.pk)
        self.assertEqual(self.checkout.call_count, 1)

    def test_expired_quote_cannot_charge(self):
        quote = preview_change(self.tenant, self.user, 'start', property_ids=[self.properties[0].property_id])
        BillingChange.objects.filter(pk=quote.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        response = self.post('confirm', operation_id=str(quote.pk))
        self.assertEqual(response.status_code, 409)
        self.checkout.assert_not_called()

    def test_technician_and_property_admin_cannot_mutate_company_billing(self):
        for role in ['technician', 'property_admin']:
            user = User.objects.create_user(f'limited-{role}')
            TenantMembership.objects.create(tenant=self.tenant, user=user, role=role).properties.add(self.properties[0])
            self.client.force_authenticate(user)
            self.assertEqual(self.post('preview', action='start', property_ids=[self.properties[0].property_id]).status_code, 403)

    def test_company_b_cannot_read_company_a_or_confirm_its_quote(self):
        quote = preview_change(self.tenant, self.user, 'start', property_ids=[self.properties[0].property_id])
        user = User.objects.create_user('company-b-admin')
        tenant = Tenant.objects.create(name='Company B')
        TenantMembership.objects.create(tenant=tenant, user=user, role='company_admin')
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/v1/billing/company/', {'tenant_id': self.tenant.tenant_id}).status_code, 404)
        self.assertEqual(self.post('confirm', operation_id=str(quote.pk)).status_code, 404)

    def test_same_company_technician_cannot_self_grant_another_property(self):
        tech = User.objects.create_user('tech-grants')
        membership = TenantMembership.objects.create(tenant=self.tenant, user=tech, role='technician')
        membership.properties.add(self.properties[0])
        self.client.force_authenticate(tech)
        self.assertEqual(self.client.post(f'/api/v1/properties/{self.properties[1].property_id}/add_user/').status_code, 403)
        self.assertEqual(self.client.post('/api/v1/properties/assign_properties/', {'property_ids': [self.properties[1].property_id]}, format='json').status_code, 403)
        self.assertEqual(list(membership.properties.values_list('pk', flat=True)), [self.properties[0].pk])

    def test_ownership_patch_and_hard_delete_are_denied(self):
        other = Tenant.objects.create(name='Ownership target')
        path = f'/api/v1/properties/{self.properties[0].property_id}/'
        self.assertEqual(self.client.patch(path, {'tenant': other.pk}, format='json').status_code, 400)
        self.assertEqual(self.client.delete(path).status_code, 400)
        self.properties[0].refresh_from_db()
        self.assertEqual(self.properties[0].tenant_id, self.tenant.pk)

    def test_company_technician_sees_only_assigned_jobs_and_equipment(self):
        self.start(2)
        tech = User.objects.create_user('assigned-tech')
        TenantMembership.objects.create(tenant=self.tenant, user=tech, role='technician').properties.add(self.properties[0])
        assigned_machine = Machine.objects.create(name='Assigned pump', property=self.properties[0])
        other_machine = Machine.objects.create(name='Other pump', property=self.properties[0])
        assigned = Job.objects.create(property=self.properties[0], user=self.user, assigned_to=tech, machine=assigned_machine, description='Assigned')
        Job.objects.create(property=self.properties[0], user=self.user, machine=other_machine, description='Other work')
        self.assertEqual(list(get_accessible_jobs(tech)), [assigned])
        self.assertEqual(list(get_accessible_machines(tech)), [assigned_machine])
        self.client.force_authenticate(tech)
        response = self.client.get('/api/v1/jobs/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data.get('results', response.data)), 1)
        self.assertEqual(response.data.get('results', response.data)[0]['technician_name'], tech.get_human_display_name())

    def test_failed_payment_grace_expires_and_does_not_cover_new_property(self):
        self.start(2)
        end = timezone.now() - timedelta(days=3)
        PropertyBillingEnrollment.objects.filter(tenant=self.tenant, state='billable').update(paid_through_at=end)
        BillingInvoiceAllocation.objects.all().update(period_start_at=end-timedelta(days=30), period_end_at=end)
        self.assertEqual(get_operable_properties(self.user).count(), 2)
        self.assertEqual(get_tenant_entitlement(Tenant.objects.get(pk=self.tenant.pk)).level.value, 'GRACE')
        PropertyBillingEnrollment.objects.filter(tenant=self.tenant).update(paid_through_at=timezone.now() - timedelta(days=8))
        BillingInvoiceAllocation.objects.all().update(period_end_at=timezone.now() - timedelta(days=8))
        self.assertEqual(get_operable_properties(self.user).count(), 0)

    def test_outstanding_debt_blocks_proration_credit(self):
        self.start(2)
        self.invoices['unpaid'] = {**next(iter(self.invoices.values())), 'id': 'unpaid', 'status': 'open'}
        response = self.post('preview', action='remove', property_ids=[self.properties[1].property_id])
        self.assertEqual(response.status_code, 409)

    @override_settings(COMPANY_BILLING_ENABLED=False)
    def test_disabled_rollout_cannot_enroll_existing_company(self):
        self.assertEqual(self.post('preview', action='start', property_ids=[self.properties[0].property_id]).status_code, 400)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.billing_model, 'legacy_plan')

    def test_last_property_removal_requires_cancellation_not_deletion(self):
        self.start(1)
        self.assertEqual(self.post('preview', action='remove', property_ids=[self.properties[0].property_id]).status_code, 400)

    def test_cancel_and_reactivate_preserve_paid_data(self):
        self.start(2)
        quote = preview_change(self.tenant, self.user, 'cancel')
        confirm_change(self.tenant, self.user, quote.pk)
        self.local.refresh_from_db()
        self.assertTrue(self.local.cancel_at_period_end)
        quote = preview_change(self.tenant, self.user, 'reactivate')
        confirm_change(self.tenant, self.user, quote.pk)
        self.local.refresh_from_db()
        self.assertFalse(self.local.cancel_at_period_end)
        self.assertEqual(Property.objects.count(), 3)

    def test_browser_cannot_override_price_or_quantity(self):
        response = self.post('preview', action='start', property_ids=[self.properties[0].property_id], quantity=1, price_id='price_attacker')
        self.assertEqual(response.status_code, 400)

    def test_usd_invoice_and_receipt_pdfs(self):
        self.start(2)
        invoice = BillingInvoice.objects.get()
        for kind in ['invoice', 'receipt']:
            response = self.client.get('/api/v1/billing/document/', {'tenant_id': self.tenant.tenant_id, 'document_id': invoice.pk, 'kind': kind})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.content.startswith(b'%PDF-'))

    def test_legacy_plan_and_property_ownership_are_not_changed_by_preview(self):
        original = list(Property.objects.values_list('pk', 'property_id', 'tenant_id'))
        preview_change(self.tenant, self.user, 'start', property_ids=[self.properties[0].property_id])
        self.tenant.refresh_from_db(); self.local.refresh_from_db()
        self.assertEqual(self.tenant.billing_model, 'legacy_plan')
        self.assertEqual(self.local.plan_id, self.plan.pk)
        self.assertEqual(list(Property.objects.values_list('pk', 'property_id', 'tenant_id')), original)

    def test_remote_timeout_retains_durable_intent_without_second_checkout(self):
        quote = preview_change(self.tenant, self.user, 'start', property_ids=[self.properties[0].property_id])
        self.checkout.side_effect = stripe.APIConnectionError('timeout')
        self.assertEqual(self.post('confirm', operation_id=str(quote.pk)).status_code, 502)
        quote.refresh_from_db()
        self.assertEqual(quote.state, 'applying')
        from .billing.reconciliation import retry_operations
        self.checkout.side_effect = None
        retry_operations()
        self.assertEqual(self.checkout.call_args_list[0].kwargs['idempotency_key'], self.checkout.call_args_list[1].kwargs['idempotency_key'])

    def test_add_credit_is_net_charge_not_a_promised_future_credit(self):
        self.start(2)
        quote = preview_change(self.tenant, self.user, 'add', property_ids=[self.properties[2].property_id])
        self.assertEqual(quote.quote['amount_due_now_minor'], 1000)
        self.assertEqual(quote.quote['credit_minor'], 0)

    def test_price_or_credit_change_invalidates_confirmation(self):
        self.start(2)
        quote = preview_change(self.tenant, self.user, 'add', property_ids=[self.properties[2].property_id])
        fresh = self.preview_remote(subscription=self.remote['id'], subscription_details={'items': [{'quantity': 3}]})
        fresh['amount_due'] += 100
        self.preview.side_effect = None
        self.preview.return_value = fresh
        count = self.modify.call_count
        self.assertEqual(self.post('confirm', operation_id=str(quote.pk)).status_code, 409)
        self.assertEqual(self.modify.call_count, count)

    def test_two_confirmations_cannot_start_two_company_subscriptions(self):
        first = preview_change(self.tenant, self.user, 'start', property_ids=[self.properties[0].property_id])
        second = preview_change(self.tenant, self.user, 'start', property_ids=[self.properties[1].property_id])
        confirm_change(self.tenant, self.user, first.pk)
        self.assertEqual(self.post('confirm', operation_id=str(second.pk)).status_code, 409)
        self.assertEqual(self.checkout.call_count, 1)

    def test_paid_old_invoice_cannot_revive_removed_property(self):
        old = self.start(2)
        old_invoice = deepcopy(self.invoices[self.remote['latest_invoice']])
        quote = preview_change(self.tenant, self.user, 'remove', property_ids=[self.properties[1].property_id])
        confirm_change(self.tenant, self.user, quote.pk)
        process_webhook_event({'id': 'evt_late_old_paid', 'type': 'invoice.paid', 'data': {'object': old_invoice}})
        enrollment = PropertyBillingEnrollment.objects.get(property=self.properties[1])
        self.assertEqual(enrollment.state, 'inactive')
        self.assertFalse(get_operable_properties(self.user).filter(pk=self.properties[1].pk).exists())

    def test_terminal_reactivation_creates_new_contract_but_reuses_customer(self):
        self.start(2, method='promptpay')
        old_id = self.remote['id']
        self.remote['status'] = 'canceled'
        sync_company_subscription(self.remote)
        PropertyBillingEnrollment.objects.filter(tenant=self.tenant).update(paid_through_at=timezone.now() - timedelta(days=1))
        BillingInvoiceAllocation.objects.all().update(period_start_at=timezone.now() - timedelta(days=30), period_end_at=timezone.now() - timedelta(days=1))
        quote = preview_change(self.tenant, self.user, 'reactivate')
        change = confirm_change(self.tenant, self.user, quote.pk)
        self.local.refresh_from_db()
        self.assertNotEqual(self.local.external_subscription_id, old_id)
        self.assertEqual(self.customer.call_count, 1)
        self.assertEqual(get_operable_properties(self.user).count(), 0)
        self.pay(change)
        self.assertEqual(get_operable_properties(self.user).count(), 2)

    def test_promptpay_addition_keeps_new_property_locked_until_paid(self):
        self.start(2, method='promptpay')
        quote = preview_change(self.tenant, self.user, 'add', property_ids=[self.properties[2].property_id])
        change = confirm_change(self.tenant, self.user, quote.pk)
        update = [call.kwargs for call in self.modify.call_args_list if 'items' in call.kwargs][-1]
        self.assertEqual(update['payment_behavior'], 'allow_incomplete')
        self.assertFalse(get_operable_properties(self.user).filter(pk=self.properties[2].pk).exists())
        self.pay(change)
        self.assertEqual(get_operable_properties(self.user).count(), 3)

    def test_non_usd_twenty_dollar_catalog_is_rejected(self):
        self.enterContext(patch('stripe.Price.retrieve', return_value={**self.price(self.usd.stripe_price_id), 'unit_amount': 1900}))
        self.assertEqual(self.post('preview', action='start', property_ids=[self.properties[0].property_id]).status_code, 400)
        self.checkout.assert_not_called()

    def test_new_company_requires_payment_even_when_global_enforcement_is_off(self):
        self.start(1, paid=False)
        from .subscription_permissions import subscription_write_allowed
        from django.test import RequestFactory
        request = RequestFactory().post('/api/v1/jobs/')
        request.user = self.user
        with override_settings(SUBSCRIPTION_ENFORCEMENT_MODE='off'):
            self.assertFalse(subscription_write_allowed(request, self.tenant))

    def test_existing_trial_is_preserved_but_not_extended(self):
        self.local.status = 'trialing'
        self.local.trial_ends_at = timezone.now() + timedelta(days=1)
        self.local.save()
        self.start(1, paid=False)
        self.assertEqual(get_operable_properties(self.user).count(), 1)
        self.assertTrue(get_tenant_entitlement(Tenant.objects.get(pk=self.tenant.pk)).can_write)
        TenantSubscription.objects.filter(pk=self.local.pk).update(trial_ends_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(get_operable_properties(self.user).count(), 0)

    def test_property_admin_explicit_billing_access_is_read_only_for_enrollment(self):
        self.start(1)
        user = User.objects.create_user('property-billing-viewer')
        membership = TenantMembership.objects.create(tenant=self.tenant, user=user, role='property_admin', can_manage_company_billing=True)
        membership.properties.add(self.properties[0])
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/v1/billing/company/', {'tenant_id': self.tenant.tenant_id}).status_code, 200)
        self.assertEqual(self.post('preview', action='add', property_ids=[self.properties[1].property_id]).status_code, 403)

    def test_company_portal_cannot_bypass_quantity_consent(self):
        self.start(1)
        with override_settings(COMPANY_BILLING_PORTAL_CONFIGURATION='bpc_company'):
            with patch('stripe.billing_portal.Configuration.retrieve', return_value={'features': {'subscription_update': {'enabled': True}}}):
                self.assertEqual(self.post('portal').status_code, 400)

    def test_invoice_with_multiple_line_pages_is_fully_allocated(self):
        change = self.start(2, method='promptpay', paid=False)
        invoice = self.invoices[self.remote['latest_invoice']]
        complete = deepcopy(invoice['lines']['data'])
        invoice['lines'] = {'has_more': True, 'data': []}
        with patch('stripe.Invoice.list_lines', return_value={'data': complete, 'has_more': False}):
            self.pay(change)
        self.assertEqual(self.local.paid_quantity, 2)

    def test_negative_credit_invoice_preserves_paid_coverage_without_negative_cash(self):
        change = self.start(1, method='promptpay', paid=False)
        invoice = self.invoices[self.remote['latest_invoice']]
        invoice = deepcopy(invoice)
        invoice['id'] = 'in_negative_credit'
        self.invoices[invoice['id']] = invoice
        invoice['total'] = -1000
        invoice['amount_due'] = 0
        invoice['lines']['data'].append({'id': 'il_account_credit', 'description': 'Approved credit',
            'amount': -71000, 'quantity': 1, 'period': invoice['lines']['data'][0]['period'], 'price': {'id': self.thb.stripe_price_id}})
        invoice.update(status='paid', amount_paid=0, amount_remaining=0)
        invoice['status_transitions']['paid_at'] = int(timezone.now().timestamp())
        process_webhook_event({'id': 'evt_credit_settlement', 'type': 'invoice.paid', 'data': {'object': deepcopy(invoice)}})
        self.assertEqual(BillingInvoice.objects.get(provider_invoice_id=invoice['id']).total_minor, -1000)
        self.assertEqual(BillingInvoice.objects.get(provider_invoice_id=invoice['id']).amount_paid_minor, 0)
        self.assertEqual(get_operable_properties(self.user).count(), 1)

    def test_future_paid_invoice_cannot_unlock_an_unpaid_gap(self):
        change = self.start(1, method='promptpay', paid=False)
        invoice = self.invoices[self.remote['latest_invoice']]
        start = timezone.now() + timedelta(days=10)
        invoice['lines']['data'][0]['period'] = {'start': int(start.timestamp()), 'end': int((start + timedelta(days=30)).timestamp())}
        self.pay(change)
        self.assertEqual(get_operable_properties(self.user).count(), 0)
        self.assertEqual(self.local.paid_quantity, 0)
        self.assertFalse(get_tenant_entitlement(Tenant.objects.get(pk=self.tenant.pk)).can_write)

    def test_catalog_setup_reuses_the_same_product_for_thb(self):
        from types import SimpleNamespace
        from django.core.management import call_command
        from io import StringIO
        self.thb.delete()
        product = SimpleNamespace(id='prod_property', name='StayMaint Property Subscription', livemode=False)
        with patch('stripe.Product.retrieve', return_value=product), patch('stripe.Product.create') as create_product:
            with patch('stripe.Price.create', return_value=SimpleNamespace(id='price_new_thb', product='prod_property')):
                call_command('setup_company_billing_prices', currency='thb', thb_unit_minor=70000, create=True, apply=True, stdout=StringIO())
        create_product.assert_not_called()
        self.assertEqual(BillingPrice.objects.get(currency='thb').stripe_product_id, self.usd.stripe_product_id)

    def test_legacy_assignment_review_prevents_silent_technician_access_loss(self):
        tech = User.objects.create_user('historical-tech')
        TenantMembership.objects.create(tenant=self.tenant, user=tech, role='technician').properties.add(self.properties[0])
        job = Job.objects.create(property=self.properties[0], user=tech, description='Legacy assignment needs review')
        response = self.post('preview', action='start', property_ids=[self.properties[0].property_id])
        self.assertEqual(response.status_code, 409)
        job.refresh_from_db()
        self.assertIsNone(job.assigned_to_id)
        self.checkout.assert_not_called()

    def test_company_technician_cannot_self_assign_equipment_by_creating_work(self):
        self.start(1)
        tech = User.objects.create_user('tech-create-denied')
        TenantMembership.objects.create(tenant=self.tenant, user=tech, role='technician').properties.add(self.properties[0])
        from .tenancy import require_work_creation_permission
        from django.core.exceptions import PermissionDenied
        with self.assertRaises(PermissionDenied):
            require_work_creation_permission(tech, self.properties[0])
