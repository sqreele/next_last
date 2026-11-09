from copy import deepcopy
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import stripe
from django.test import override_settings
from rest_framework.test import APITestCase

from .billing.documents import snapshot_invoice
from .billing.stripe_service import process_webhook_event, sync_provider_subscription
from .entitlements import get_tenant_entitlement
from .models import BillingInvoice, BillingProfile, SubscriptionPlan, Tenant, TenantMembership, TenantSubscription, User
from .tests_stripe_billing import TEST_SETTINGS


@override_settings(**{
    **TEST_SETTINGS,
    'STRIPE_PROMPTPAY_PRICE_MAP': {'starter': 'price_thb_starter'},
    'BILLING_ISSUER': {
        'legal_name': 'ผู้ให้บริการ ทดสอบ', 'address': 'กรุงเทพมหานคร',
        'tax_id': '1234567890123', 'email': 'billing@example.test',
    },
})
class PromptPayBillingTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user('promptpay-owner', email='owner@example.test')
        self.tenant = Tenant.objects.create(name='PromptPay tenant', owner=self.owner, timezone='UTC')
        TenantMembership.objects.create(tenant=self.tenant, user=self.owner, role='admin')
        self.plan, _ = SubscriptionPlan.objects.get_or_create(code='starter', defaults={'name': 'Starter'})
        self.subscription = TenantSubscription.objects.create(tenant=self.tenant, plan=self.plan, status='suspended')
        self.profile = BillingProfile.objects.create(
            tenant=self.tenant, legal_name='บริษัท ลูกค้า', address='ที่อยู่เดิม', tax_id='1234567890123',
            email='customer@example.test', branch='สำนักงานใหญ่',
        )
        self.client.force_authenticate(self.owner)
        start = datetime(2026, 11, 1, tzinfo=UTC)
        self.start = int(start.timestamp())
        self.end = int((start + timedelta(days=30)).timestamp())
        self.remote = {
            'id': 'sub_promptpay', 'customer': 'cus_promptpay', 'collection_method': 'send_invoice',
            'status': 'active', 'latest_invoice': 'in_promptpay',
            'current_period_start': self.start, 'current_period_end': self.end,
            'metadata': {'tenant_id': self.tenant.tenant_id},
            'items': {'data': [{'price': {'id': 'price_thb_starter'}}]},
        }
        self.invoice = {
            'id': 'in_promptpay', 'customer': 'cus_promptpay', 'subscription': 'sub_promptpay',
            'number': 'STRIPE-001', 'status': 'open', 'currency': 'thb',
            'created': self.start, 'due_date': self.start + 7 * 86400,
            'status_transitions': {'finalized_at': self.start, 'paid_at': None},
            'total': 99000, 'amount_paid': 0, 'amount_remaining': 99000,
            'customer_name': 'บริษัท ลูกค้า', 'customer_address': {'line1': 'ที่อยู่เดิม'},
            'customer_email': 'customer@example.test',
            'custom_fields': [{'name': 'Tax ID', 'value': '1234567890123'}],
            'lines': {'data': [{'description': 'StayMaint Starter', 'amount': 99000,
                                'price': {'id': 'price_thb_starter'},
                                'period': {'start': self.start, 'end': self.end}}]},
            'hosted_invoice_url': 'https://invoice.stripe.com/i/test',
        }
        self.price = {
            'id': 'price_thb_starter', 'currency': 'thb', 'active': True,
            'unit_amount': 99000, 'billing_scheme': 'per_unit',
            'recurring': {'interval': 'month', 'interval_count': 1},
        }

    def bind(self):
        self.subscription.external_customer_id = 'cus_promptpay'
        self.subscription.external_subscription_id = 'sub_promptpay'
        self.subscription.save()

    def paid_invoice(self):
        invoice = deepcopy(self.invoice)
        invoice.update(status='paid', amount_paid=99000, amount_remaining=0)
        invoice['status_transitions']['paid_at'] = self.start + 100
        return invoice

    def post(self, action, **values):
        return self.client.post(f'/api/v1/billing/{action}/', {'tenant_id': self.tenant.tenant_id, **values}, format='json')

    def get(self, action, **values):
        return self.client.get(f'/api/v1/billing/{action}/', {'tenant_id': self.tenant.tenant_id, **values})

    def test_profile_validation_and_update(self):
        body = {'legal_name': 'ชื่อลูกค้าใหม่', 'address': 'ที่อยู่ใหม่', 'tax_id': '', 'branch': '', 'email': 'new@example.test'}
        self.assertEqual(self.post('profile', **{**body, 'tax_id': '123'}).status_code, 400)
        self.assertEqual(self.post('profile', **body).status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.legal_name, 'ชื่อลูกค้าใหม่')
        self.assertEqual(self.post('profile', **{**body, 'vat_rate': 7}).status_code, 400)

    @patch('myappLubd.billing.promptpay.stripe.Customer.modify', side_effect=stripe.APIConnectionError('unavailable'))
    def test_profile_update_rolls_back_if_provider_fails(self, modify):
        self.bind()
        response = self.post('profile', legal_name='New name', address='New address', tax_id='', branch='', email='new@example.test')
        self.assertEqual(response.status_code, 502)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.address, 'ที่อยู่เดิม')

    @override_settings(BILLING_ISSUER={})
    @patch('myappLubd.billing.promptpay.stripe.Subscription.create')
    def test_missing_issuer_blocks_invoice_creation(self, create):
        response = self.post('promptpay', plan=self.plan.pk)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['code'], 'billing_issuer_missing')
        self.assertFalse(self.get('profile').data['promptpay_available'])
        create.assert_not_called()

    @patch('myappLubd.billing.promptpay.stripe.Price.retrieve')
    def test_quotes_use_stripe_thb_price_instead_of_legacy_dollar_amount(self, retrieve):
        retrieve.return_value = self.price
        response = self.get('promptpay')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['amount'], '990')
        self.assertEqual(response.data['results'][0]['currency'], 'THB')

    @patch('myappLubd.billing.promptpay.stripe.Subscription.create')
    @patch('myappLubd.billing.promptpay.stripe.Price.retrieve')
    def test_non_thb_prices_are_rejected(self, retrieve, create):
        retrieve.return_value = {**self.price, 'currency': 'usd'}
        self.assertEqual(self.post('promptpay', plan=self.plan.pk).status_code, 400)
        create.assert_not_called()

    @patch('myappLubd.billing.promptpay.stripe.Invoice.retrieve')
    @patch('myappLubd.billing.promptpay.stripe.Subscription.create')
    @patch('myappLubd.billing.promptpay.stripe.Price.retrieve')
    @patch('myappLubd.billing.promptpay.stripe.Customer.modify')
    @patch('myappLubd.billing.stripe_service.stripe.Customer.create')
    def test_creation_is_non_vat_send_invoice_and_does_not_activate_access(self, customer, modify, price, create, invoice):
        customer.return_value = {'id': 'cus_promptpay'}
        price.return_value = self.price
        create.return_value = self.remote
        invoice.return_value = self.invoice
        response = self.post('promptpay', plan=self.plan.pk)
        self.assertEqual(response.status_code, 200, response.data)
        kwargs = create.call_args.kwargs
        self.assertEqual(kwargs['collection_method'], 'send_invoice')
        self.assertEqual(kwargs['payment_settings'], {'payment_method_types': ['promptpay']})
        self.assertEqual(kwargs['automatic_tax'], {'enabled': False})
        self.assertEqual(kwargs['default_tax_rates'], [])
        self.assertIn('idempotency_key', kwargs)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.external_subscription_id, 'sub_promptpay')
        self.assertIsNone(self.subscription.current_period_end)
        self.assertFalse(get_tenant_entitlement(self.subscription.tenant).can_write)
        self.assertEqual(BillingInvoice.objects.count(), 1)

    @patch('myappLubd.billing.promptpay.stripe.Invoice.finalize_invoice')
    @patch('myappLubd.billing.promptpay.stripe.Invoice.retrieve')
    @patch('myappLubd.billing.promptpay.stripe.Subscription.retrieve')
    @patch('myappLubd.billing.promptpay.stripe.Subscription.create')
    def test_retry_reuses_existing_subscription_and_finalizes_draft(self, create, retrieve, invoice, finalize):
        self.bind()
        retrieve.return_value = self.remote
        invoice.return_value = {**self.invoice, 'status': 'draft'}
        finalize.return_value = self.invoice
        self.assertEqual(self.post('promptpay', plan=self.plan.pk).status_code, 200)
        self.assertEqual(self.post('promptpay', plan=self.plan.pk).status_code, 200)
        create.assert_not_called()
        self.assertEqual(BillingInvoice.objects.count(), 1)

    def test_active_remote_subscription_without_paid_invoice_never_grants_access(self):
        self.bind()
        sync_provider_subscription(self.remote)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, 'suspended')
        self.assertIsNone(self.subscription.current_period_end)

    def test_open_invoice_does_not_grant_access_or_receipt(self):
        self.bind()
        document = snapshot_invoice(self.invoice, self.subscription)
        sync_provider_subscription(self.remote)
        self.assertFalse(get_tenant_entitlement(Tenant.objects.get(pk=self.tenant.pk)).can_write)
        response = self.get('document', document_id=document.pk, kind='receipt')
        self.assertEqual(response.status_code, 400)

    @patch('myappLubd.billing.stripe_service.stripe.Invoice.retrieve')
    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_paid_webhook_grants_exact_paid_period_and_is_idempotent(self, remote, invoice):
        self.bind()
        remote.return_value = self.remote
        invoice.return_value = self.paid_invoice()
        event = {'id': 'evt_promptpay_paid', 'type': 'invoice.paid', 'created': self.start + 100,
                 'data': {'object': self.paid_invoice()}}
        self.assertTrue(process_webhook_event(event))
        self.assertFalse(process_webhook_event(event))
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.current_period_end.isoformat(), '2026-11-30')
        self.assertEqual(BillingInvoice.objects.count(), 1)
        self.assertTrue(self.get('invoices').data['results'][0]['receipt_number'])
        self.assertTrue(get_tenant_entitlement(Tenant.objects.get(pk=self.tenant.pk), at=datetime(2026, 11, 9, tzinfo=UTC)).can_write)
        self.assertFalse(get_tenant_entitlement(Tenant.objects.get(pk=self.tenant.pk), at=datetime(2026, 12, 1, tzinfo=UTC)).can_write)

    def test_next_unpaid_period_cannot_extend_paid_access(self):
        self.bind()
        snapshot_invoice(self.paid_invoice(), self.subscription)
        sync_provider_subscription(self.remote)
        next_remote = {**self.remote, 'current_period_start': self.end, 'current_period_end': self.end + 31 * 86400}
        sync_provider_subscription(next_remote)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.current_period_end.isoformat(), '2026-11-30')

    def test_old_invoice_cannot_shorten_paid_access(self):
        self.bind()
        snapshot_invoice(self.paid_invoice(), self.subscription)
        old = self.paid_invoice()
        old['id'] = 'in_older'
        old['lines']['data'][0]['period'] = {'start': self.start - 30 * 86400, 'end': self.start}
        snapshot_invoice(old, self.subscription)
        sync_provider_subscription(self.remote)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.current_period_end.isoformat(), '2026-11-30')

    def test_document_identity_and_totals_are_immutable_after_profile_changes(self):
        self.bind()
        document = snapshot_invoice(self.invoice, self.subscription)
        self.profile.address = 'ที่อยู่ใหม่'
        self.profile.save()
        changed = self.paid_invoice()
        changed['customer_name'] = 'ชื่อใหม่'
        changed['total'] = 10
        snapshot_invoice(changed, self.subscription)
        document.refresh_from_db()
        self.assertEqual(document.customer['legal_name'], 'บริษัท ลูกค้า')
        self.assertEqual(document.total_minor, 99000)
        self.assertEqual(document.status, 'paid')

    def test_late_open_snapshot_cannot_regress_paid_status_or_receipt_amount(self):
        self.bind()
        document = snapshot_invoice(self.paid_invoice(), self.subscription)
        snapshot_invoice(self.invoice, self.subscription)
        document.refresh_from_db()
        self.assertEqual(document.status, 'paid')
        self.assertEqual(document.amount_paid_minor, 99000)
        self.assertIsNotNone(document.paid_at)

    def test_pdf_invoice_and_paid_receipt_are_downloadable_and_private(self):
        self.bind()
        document = snapshot_invoice(self.paid_invoice(), self.subscription)
        for kind, number in [('invoice', document.number), ('receipt', document.receipt_number)]:
            response = self.get('document', document_id=document.pk, kind=kind)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response['Content-Type'], 'application/pdf')
            self.assertEqual(response['Cache-Control'], 'private, no-store')
            self.assertIn(number, response['Content-Disposition'])
            self.assertTrue(response.content.startswith(b'%PDF-'))

    def test_other_tenant_cannot_read_documents_or_pay_invoice(self):
        self.bind()
        document = snapshot_invoice(self.invoice, self.subscription)
        other = User.objects.create_user('other-owner')
        tenant = Tenant.objects.create(name='Other tenant', owner=other)
        TenantMembership.objects.create(tenant=tenant, user=other, role='admin')
        self.client.force_authenticate(other)
        self.assertEqual(self.get('invoices').status_code, 404)
        self.assertEqual(self.client.get('/api/v1/billing/document/', {
            'tenant_id': tenant.tenant_id, 'document_id': document.pk,
        }).status_code, 404)
        self.assertEqual(self.client.post('/api/v1/billing/invoice-pay/', {
            'tenant_id': tenant.tenant_id, 'document_id': document.pk,
        }, format='json').status_code, 404)

    def test_viewer_cannot_access_billing_profile_or_documents(self):
        viewer = User.objects.create_user('viewer')
        TenantMembership.objects.create(tenant=self.tenant, user=viewer, role='viewer')
        self.client.force_authenticate(viewer)
        for action in ('profile', 'invoices', 'document', 'promptpay'):
            self.assertEqual(self.get(action).status_code, 403)

    def test_unsigned_requests_cannot_mark_invoice_paid(self):
        self.bind()
        snapshot_invoice(self.invoice, self.subscription)
        self.assertEqual(self.post('promptpay', plan=self.plan.pk, status='paid').status_code, 400)
        self.assertEqual(self.post('profile', status='paid').status_code, 400)
        self.assertIsNone(BillingInvoice.objects.get().paid_at)

    @patch('myappLubd.billing.promptpay.stripe.Invoice.retrieve')
    def test_pay_refreshes_status_and_rejects_paid_invoice(self, retrieve):
        self.bind()
        document = snapshot_invoice(self.invoice, self.subscription)
        retrieve.return_value = self.paid_invoice()
        self.assertEqual(self.post('invoice-pay', document_id=document.pk).status_code, 400)
        document.refresh_from_db()
        self.assertEqual(document.status, 'paid')

    @patch('myappLubd.billing.promptpay.stripe.Subscription.retrieve')
    @patch('myappLubd.billing.promptpay.stripe.Invoice.list')
    def test_refresh_recovers_missed_payment_webhook(self, invoices, remote):
        self.bind()
        remote.return_value = self.remote
        invoices.return_value = {'data': [self.paid_invoice()]}
        self.assertEqual(self.post('invoices').status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, 'active')
        self.assertEqual(self.subscription.current_period_end.isoformat(), '2026-11-30')

    def test_invalid_document_id_is_a_validation_error(self):
        self.assertEqual(self.get('document', document_id='invalid').status_code, 400)

    def test_vat_invoice_is_rejected(self):
        self.bind()
        taxed = {**self.invoice, 'total_tax_amounts': [{'amount': 700}]}
        from .billing.stripe_service import StripeBillingError
        with self.assertRaises(StripeBillingError):
            snapshot_invoice(taxed, self.subscription)
        self.assertEqual(BillingInvoice.objects.count(), 0)

    def test_modern_stripe_invoice_lines_and_parent_are_supported(self):
        self.bind()
        invoice = self.paid_invoice()
        invoice.pop('subscription')
        invoice['parent'] = {'type': 'subscription_details', 'subscription_details': {'subscription': 'sub_promptpay'}}
        line = invoice['lines']['data'][0]
        line.pop('price')
        line['pricing'] = {'price_details': {'price': 'price_thb_starter'}}
        snapshot_invoice(invoice, self.subscription)
        sync_provider_subscription(self.remote)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.current_period_end.isoformat(), '2026-11-30')
