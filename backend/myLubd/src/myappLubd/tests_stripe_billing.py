from datetime import UTC, datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
import threading
import time
from unittest.mock import patch

from django.db import close_old_connections
from django.test import RequestFactory, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import (
    BillingWebhookEvent,
    Property,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
    User,
)
from .subscription_permissions import subscription_write_allowed
from .billing.stripe_service import (
    map_stripe_status,
    process_webhook_event,
    sync_provider_subscription,
)


TEST_SETTINGS = {
    'STRIPE_SECRET_KEY': 'sk_test_unit',
    'STRIPE_PUBLISHABLE_KEY': 'pk_test_unit',
    'STRIPE_WEBHOOK_SECRET': 'whsec_unit',
    'STRIPE_PRICE_MAP': {'starter': 'price_starter', 'pro': 'price_pro', 'enterprise': ''},
    'FRONTEND_BASE_URL': 'https://staymaint.test',
    'SUBSCRIPTION_ENFORCEMENT_MODE': 'observe',
    'SECURE_SSL_REDIRECT': False,
}


@override_settings(**TEST_SETTINGS)
class StripeBillingTests(APITestCase):
    def setUp(self):
        self.plan = SubscriptionPlan.objects.create(code='starter', name='Starter')
        self.pro = SubscriptionPlan.objects.create(code='pro', name='Pro')
        self.owner = User.objects.create_user('owner', email='owner@example.test')
        self.tenant = Tenant.objects.create(name='Tenant A', owner=self.owner, timezone='UTC')
        self.subscription = TenantSubscription.objects.create(
            tenant=self.tenant, plan=self.plan, status='trialing'
        )
        TenantMembership.objects.create(tenant=self.tenant, user=self.owner, role='owner')
        self.now = int(datetime(2026, 9, 1, 12, tzinfo=UTC).timestamp())

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def make_user(self, role):
        user = User.objects.create_user(f'user-{role}', email=f'{role}@example.test')
        TenantMembership.objects.create(tenant=self.tenant, user=user, role=role)
        return user

    def provider_subscription(self, status='active', **updates):
        value = {
            'id': 'sub_test',
            'customer': 'cus_test',
            'status': status,
            'current_period_start': self.now,
            'current_period_end': self.now + 30 * 86400,
            'trial_end': None,
            'cancel_at_period_end': False,
            'metadata': {'tenant_id': self.tenant.tenant_id},
            'items': {'data': [{
                'price': {'id': 'price_starter'},
                'current_period_start': self.now,
                'current_period_end': self.now + 30 * 86400,
            }]},
        }
        value.update(updates)
        return value

    def event(self, event_id, event_type, obj, created=None):
        return {
            'id': event_id,
            'type': event_type,
            'created': created or self.now,
            'data': {'object': obj},
        }

    def post_verified_event(self, event):
        with patch('myappLubd.billing.views.construct_webhook_event', return_value=event):
            return self.client.post(
                '/api/v1/billing/webhooks/stripe/',
                data=b'{}', content_type='application/json',
                HTTP_STRIPE_SIGNATURE='verified',
            )

    @patch('myappLubd.billing.stripe_service.stripe.checkout.Session.create')
    @patch('myappLubd.billing.stripe_service.stripe.Customer.create')
    def test_owner_admin_and_billing_can_create_checkout(self, customer_create, checkout_create):
        customer_create.return_value = {'id': 'cus_test'}
        checkout_create.return_value = {'url': 'https://checkout.stripe.com/test'}
        for role, user in [('owner', self.owner), ('admin', self.make_user('admin')), ('billing', self.make_user('billing'))]:
            with self.subTest(role=role):
                self.subscription.external_customer_id = None
                self.subscription.save(update_fields=['external_customer_id'])
                customer_create.return_value = {'id': f'cus_{role}'}
                self.authenticate(user)
                response = self.client.post('/api/v1/billing/checkout/', {
                    'tenant_id': self.tenant.tenant_id, 'plan': self.plan.id,
                }, format='json')
                self.assertEqual(response.status_code, 200)

    def test_manager_cannot_create_checkout(self):
        self.authenticate(self.make_user('manager'))
        response = self.client.post('/api/v1/billing/checkout/', {
            'tenant_id': self.tenant.tenant_id, 'plan': self.plan.id,
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_browser_cannot_submit_arbitrary_price_id(self):
        self.authenticate(self.owner)
        response = self.client.post('/api/v1/billing/checkout/', {
            'tenant_id': self.tenant.tenant_id,
            'plan': self.plan.id,
            'price_id': 'price_attacker',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    @patch('myappLubd.billing.stripe_service.stripe.checkout.Session.create')
    def test_existing_subscription_must_change_plan_in_portal(self, checkout_create):
        self.subscription.external_customer_id = 'cus_test'
        self.subscription.external_subscription_id = 'sub_test'
        self.subscription.save()
        self.authenticate(self.owner)
        response = self.client.post('/api/v1/billing/checkout/', {
            'tenant_id': self.tenant.tenant_id, 'plan': self.pro.id,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'subscription_already_exists')
        checkout_create.assert_not_called()

    @patch('myappLubd.billing.stripe_service.stripe.checkout.Session.create')
    @patch('myappLubd.billing.stripe_service.stripe.Customer.create')
    def test_stripe_customer_created_once_then_reused(self, customer_create, checkout_create):
        customer_create.return_value = {'id': 'cus_once'}
        checkout_create.return_value = {'url': 'https://checkout.stripe.com/test'}
        self.authenticate(self.owner)
        body = {'tenant_id': self.tenant.tenant_id, 'plan': self.plan.id}
        self.assertEqual(self.client.post('/api/v1/billing/checkout/', body, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/billing/checkout/', body, format='json').status_code, 200)
        self.assertEqual(customer_create.call_count, 1)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.external_customer_id, 'cus_once')

    @patch('myappLubd.billing.stripe_service.stripe.checkout.Session.create')
    @patch('myappLubd.billing.stripe_service.stripe.Customer.create')
    def test_checkout_uses_subscription_mode_and_server_mapped_price(self, customer_create, checkout_create):
        customer_create.return_value = {'id': 'cus_checkout'}
        checkout_create.return_value = {'url': 'https://checkout.stripe.com/test'}
        self.authenticate(self.owner)
        response = self.client.post('/api/v1/billing/checkout/', {
            'tenant_id': self.tenant.tenant_id,
            'plan': self.plan.id,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        kwargs = checkout_create.call_args.kwargs
        self.assertEqual(kwargs['mode'], 'subscription')
        self.assertEqual(kwargs['customer'], 'cus_checkout')
        self.assertEqual(kwargs['line_items'], [{'price': 'price_starter', 'quantity': 1}])
        self.assertEqual(kwargs['metadata'], {'tenant_id': self.tenant.tenant_id})

    def test_portal_requires_customer(self):
        self.authenticate(self.owner)
        response = self.client.post('/api/v1/billing/portal/', {
            'tenant_id': self.tenant.tenant_id,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'stripe_customer_missing')

    @patch('myappLubd.billing.stripe_service.stripe.billing_portal.Session.create')
    def test_portal_returns_only_hosted_url(self, portal_create):
        self.subscription.external_customer_id = 'cus_test'
        self.subscription.save(update_fields=['external_customer_id'])
        portal_create.return_value = {'url': 'https://billing.stripe.com/test', 'id': 'secret'}
        self.authenticate(self.owner)
        response = self.client.post('/api/v1/billing/portal/', {
            'tenant_id': self.tenant.tenant_id,
        }, format='json')
        self.assertEqual(response.data, {'url': 'https://billing.stripe.com/test'})

    @patch('myappLubd.billing.stripe_service.stripe.Webhook.construct_event')
    def test_invalid_webhook_signature_rejected(self, construct):
        import stripe
        construct.side_effect = stripe.SignatureVerificationError('bad', 'sig')
        response = self.client.post(
            '/api/v1/billing/webhooks/stripe/', data=b'{}',
            content_type='application/json', HTTP_STRIPE_SIGNATURE='bad',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(BillingWebhookEvent.objects.count(), 0)

    def bind_customer(self):
        self.subscription.external_customer_id = 'cus_test'
        self.subscription.save(update_fields=['external_customer_id'])

    def bind_subscription(self):
        self.subscription.external_customer_id = 'cus_test'
        self.subscription.external_subscription_id = 'sub_test'
        self.subscription.save(update_fields=[
            'external_customer_id', 'external_subscription_id',
        ])

    def billing_snapshot(self):
        self.subscription.refresh_from_db()
        return (
            self.subscription.external_customer_id,
            self.subscription.external_subscription_id,
            self.subscription.plan_id,
            self.subscription.status,
            self.subscription.current_period_start,
            self.subscription.current_period_end,
            self.subscription.grace_period_ends_at,
        )

    def test_duplicate_webhook_is_idempotent(self):
        event = self.event('evt_duplicate', 'unhandled.safe', {'id': 'object'})
        first = self.post_verified_event(event)
        second = self.post_verified_event(event)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data['duplicate'])
        self.assertEqual(BillingWebhookEvent.objects.count(), 1)

    def test_failed_webhook_receipt_can_retry_without_duplicate_mutation(self):
        self.bind_subscription()
        invoice = {'id': 'in_retry', 'customer': 'cus_test', 'subscription': 'sub_test'}
        event = self.event('evt_retry', 'invoice.paid', invoice)
        with patch(
            'myappLubd.billing.stripe_service.stripe.Subscription.retrieve',
            side_effect=[RuntimeError('temporary provider failure'), self.provider_subscription('active')],
        ):
            first = self.post_verified_event(event)
            second = self.post_verified_event(event)
        self.assertEqual(first.status_code, 500)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data['duplicate'])
        receipt = BillingWebhookEvent.objects.get(event_id='evt_retry')
        self.assertEqual(receipt.status, 'processed')
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, 'active')

    def test_subscription_created_maps_exact_tenant_and_external_id(self):
        self.bind_customer()
        response = self.post_verified_event(self.event(
            'evt_created', 'customer.subscription.created', self.provider_subscription()
        ))
        self.assertEqual(response.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.external_subscription_id, 'sub_test')
        self.assertEqual(self.subscription.status, 'active')

    def test_email_cannot_resolve_tenant(self):
        invoice = {
            'id': 'in_email', 'customer': 'cus_unknown',
            'subscription': 'sub_unknown', 'customer_email': self.owner.email,
        }
        with patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve', return_value={
            **self.provider_subscription(), 'id': 'sub_unknown', 'customer': 'cus_unknown'
        }):
            response = self.post_verified_event(self.event('evt_email', 'invoice.paid', invoice))
        self.assertEqual(response.status_code, 500)
        self.subscription.refresh_from_db()
        self.assertIsNone(self.subscription.external_subscription_id)

    def test_active_and_trialing_status_sync(self):
        self.bind_customer()
        for index, provider_status in enumerate(('active', 'trialing')):
            event = self.event(f'evt_status_{index}', 'customer.subscription.updated', self.provider_subscription(provider_status))
            self.assertEqual(self.post_verified_event(event).status_code, 200)
            self.subscription.refresh_from_db()
            self.assertEqual(self.subscription.status, provider_status)

    def test_central_status_mapping_covers_provider_lifecycle(self):
        expected = {
            'trialing': 'trialing',
            'active': 'active',
            'past_due': 'past_due',
            'unpaid': 'past_due',
            'paused': 'suspended',
            'incomplete': 'suspended',
            'incomplete_expired': 'cancelled',
            'canceled': 'cancelled',
        }
        self.assertEqual({status: map_stripe_status(status) for status in expected}, expected)

    def test_past_due_status_sync(self):
        self.bind_customer()
        response = self.post_verified_event(self.event(
            'evt_past_due', 'customer.subscription.updated', self.provider_subscription('past_due')
        ))
        self.assertEqual(response.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, 'past_due')

    def test_payment_failure_sets_one_seven_day_grace_without_extension(self):
        self.bind_subscription()
        provider = self.provider_subscription('past_due')
        invoice = {'id': 'in_failed', 'customer': 'cus_test', 'subscription': 'sub_test'}
        with patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve', return_value=provider):
            first = self.post_verified_event(self.event('evt_failed_1', 'invoice.payment_failed', invoice))
            self.assertEqual(first.status_code, 200)
            self.subscription.refresh_from_db()
            expected = datetime.fromtimestamp(self.now, tz=UTC) + timedelta(days=7)
            self.assertEqual(self.subscription.status, 'past_due')
            self.assertEqual(self.subscription.grace_period_ends_at, expected)
            second = self.post_verified_event(self.event(
                'evt_failed_2', 'invoice.payment_failed', invoice, created=self.now + 86400
            ))
            self.assertEqual(second.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.grace_period_ends_at, expected)

    def test_invoice_paid_restores_active_and_clears_grace(self):
        self.bind_customer()
        self.subscription.external_subscription_id = 'sub_test'
        self.subscription.status = 'past_due'
        self.subscription.grace_period_ends_at = timezone.now() + timedelta(days=2)
        self.subscription.save()
        invoice = {'id': 'in_paid', 'customer': 'cus_test', 'subscription': 'sub_test'}
        with patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve', return_value=self.provider_subscription('active')):
            response = self.post_verified_event(self.event('evt_paid', 'invoice.paid', invoice))
        self.assertEqual(response.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, 'active')
        self.assertIsNone(self.subscription.grace_period_ends_at)

    def test_current_stripe_invoice_parent_and_item_periods_are_supported(self):
        self.bind_customer()
        self.subscription.external_subscription_id = 'sub_test'
        self.subscription.status = 'past_due'
        self.subscription.grace_period_ends_at = timezone.now() + timedelta(days=2)
        self.subscription.save()
        provider = self.provider_subscription('active')
        provider.pop('current_period_start')
        provider.pop('current_period_end')
        invoice = {
            'id': 'in_basil',
            'customer': 'cus_test',
            'parent': {
                'type': 'subscription_details',
                'subscription_details': {'subscription': 'sub_test'},
            },
        }
        with patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve', return_value=provider):
            response = self.post_verified_event(self.event('evt_basil', 'invoice.paid', invoice))
        self.assertEqual(response.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, 'active')
        self.assertEqual(
            self.subscription.current_period_end,
            datetime.fromtimestamp(self.now + 30 * 86400, tz=UTC).date(),
        )

    def test_cancellation_at_period_end_and_deletion_sync(self):
        self.bind_customer()
        scheduled = self.provider_subscription('active', cancel_at_period_end=True)
        self.assertEqual(self.post_verified_event(self.event(
            'evt_scheduled', 'customer.subscription.updated', scheduled
        )).status_code, 200)
        self.subscription.refresh_from_db()
        self.assertTrue(self.subscription.cancel_at_period_end)
        self.assertEqual(self.subscription.status, 'active')
        deleted = self.provider_subscription('canceled', cancel_at_period_end=False)
        self.assertEqual(self.post_verified_event(self.event(
            'evt_deleted', 'customer.subscription.deleted', deleted
        )).status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, 'cancelled')
        self.assertTrue(TenantSubscription.objects.filter(pk=self.subscription.pk).exists())

    def test_retired_plan_still_synchronizes_existing_subscription(self):
        self.bind_customer()
        self.plan.is_active = False
        self.plan.save(update_fields=['is_active'])
        response = self.post_verified_event(self.event(
            'evt_retired_plan',
            'customer.subscription.updated',
            self.provider_subscription('active'),
        ))
        self.assertEqual(response.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, 'active')
        self.assertEqual(self.subscription.plan_id, self.plan.id)

    def test_unknown_provider_status_fails_closed(self):
        self.bind_customer()
        response = self.post_verified_event(self.event(
            'evt_unknown', 'customer.subscription.updated', self.provider_subscription('future_status')
        ))
        self.assertEqual(response.status_code, 500)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, 'trialing')
        self.assertEqual(BillingWebhookEvent.objects.get(event_id='evt_unknown').status, 'failed')

    def test_cross_tenant_metadata_mismatch_rejected(self):
        self.bind_customer()
        provider = self.provider_subscription(metadata={'tenant_id': 'TWRONG'})
        response = self.post_verified_event(self.event(
            'evt_mismatch', 'customer.subscription.created', provider
        ))
        self.assertEqual(response.status_code, 500)
        self.subscription.refresh_from_db()
        self.assertIsNone(self.subscription.external_subscription_id)

    def test_membership_and_property_grants_unchanged_by_sync(self):
        self.bind_customer()
        membership = TenantMembership.objects.get(tenant=self.tenant, user=self.owner)
        property_obj = Property.objects.create(name='Hotel', tenant=self.tenant)
        membership.properties.add(property_obj)
        membership_ids = list(TenantMembership.objects.values_list('pk', flat=True))
        grant_ids = list(membership.properties.values_list('pk', flat=True))
        self.post_verified_event(self.event(
            'evt_unchanged', 'customer.subscription.updated', self.provider_subscription()
        ))
        self.assertEqual(list(TenantMembership.objects.values_list('pk', flat=True)), membership_ids)
        self.assertEqual(list(membership.properties.values_list('pk', flat=True)), grant_ids)

    def test_observe_mode_remains_non_blocking(self):
        self.subscription.status = 'suspended'
        self.subscription.save(update_fields=['status'])
        request = RequestFactory().post('/api/v1/jobs/')
        request.user = self.owner
        self.assertTrue(subscription_write_allowed(request, self.tenant, resource_type='job'))

    def test_billing_status_is_normalized_and_hides_external_ids(self):
        self.bind_customer()
        self.subscription.external_subscription_id = 'sub_test'
        self.subscription.cancel_at_period_end = True
        self.subscription.save()
        self.authenticate(self.owner)
        response = self.client.get(
            '/api/v1/tenant-subscriptions/entitlement/',
            {'tenant_id': self.tenant.tenant_id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['can_manage_billing'])
        self.assertIn('plan', response.data)
        self.assertIn('cancel_at_period_end', response.data)
        self.assertFalse(response.data['can_start_checkout'])
        self.assertNotIn('external_customer_id', response.data)
        self.assertNotIn('external_subscription_id', response.data)

    def checkout_event(self, event_id='evt_checkout_identity', **updates):
        session = {
            'id': 'cs_test',
            'customer': 'cus_test',
            'subscription': 'sub_test',
            'metadata': {'tenant_id': self.tenant.tenant_id},
        }
        session.update(updates)
        return self.event(event_id, 'checkout.session.completed', session)

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_checkout_identity_agreement_is_accepted(self, retrieve):
        self.bind_customer()
        retrieve.return_value = self.provider_subscription('active')
        response = self.post_verified_event(self.checkout_event())
        self.assertEqual(response.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.external_subscription_id, 'sub_test')
        self.assertEqual(self.subscription.status, 'active')

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_checkout_customer_disagreement_is_rejected_without_mutation(self, retrieve):
        self.bind_customer()
        before = self.billing_snapshot()
        retrieve.return_value = self.provider_subscription(customer='cus_other')
        response = self.post_verified_event(self.checkout_event(event_id='evt_checkout_customer'))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.billing_snapshot(), before)
        self.assertEqual(
            BillingWebhookEvent.objects.get(event_id='evt_checkout_customer').error_code,
            'stripe_customer_mismatch',
        )

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_checkout_subscription_disagreement_is_rejected_without_mutation(self, retrieve):
        self.bind_customer()
        before = self.billing_snapshot()
        retrieve.return_value = self.provider_subscription(id='sub_other')
        response = self.post_verified_event(self.checkout_event(event_id='evt_checkout_subscription'))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.billing_snapshot(), before)
        self.assertEqual(
            BillingWebhookEvent.objects.get(event_id='evt_checkout_subscription').error_code,
            'stripe_subscription_mismatch',
        )

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_checkout_tenant_metadata_disagreement_is_rejected(self, retrieve):
        self.bind_customer()
        before = self.billing_snapshot()
        retrieve.return_value = self.provider_subscription(metadata={'tenant_id': 'TOTHER'})
        response = self.post_verified_event(self.checkout_event(event_id='evt_checkout_tenant'))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.billing_snapshot(), before)
        self.assertEqual(
            BillingWebhookEvent.objects.get(event_id='evt_checkout_tenant').error_code,
            'stripe_tenant_mismatch',
        )

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_checkout_session_tenant_metadata_mismatch_is_rejected_before_retrieve(self, retrieve):
        self.bind_customer()
        before = self.billing_snapshot()
        response = self.post_verified_event(self.checkout_event(
            event_id='evt_checkout_session_tenant',
            metadata={'tenant_id': 'TOTHER'},
        ))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.billing_snapshot(), before)
        retrieve.assert_not_called()
        self.assertEqual(
            BillingWebhookEvent.objects.get(
                event_id='evt_checkout_session_tenant'
            ).error_code,
            'stripe_tenant_mismatch',
        )

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_checkout_local_customer_disagreement_is_rejected(self, retrieve):
        self.bind_customer()
        before = self.billing_snapshot()
        retrieve.return_value = self.provider_subscription(customer='cus_other')
        response = self.post_verified_event(self.checkout_event(
            event_id='evt_checkout_local_customer', customer='cus_other'
        ))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.billing_snapshot(), before)
        retrieve.assert_not_called()

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_checkout_local_subscription_disagreement_is_rejected(self, retrieve):
        self.bind_subscription()
        before = self.billing_snapshot()
        retrieve.return_value = self.provider_subscription(id='sub_other')
        response = self.post_verified_event(self.checkout_event(
            event_id='evt_checkout_local_subscription', subscription='sub_other'
        ))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.billing_snapshot(), before)
        retrieve.assert_not_called()

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_checkout_cross_tenant_customer_subscription_pair_cannot_mutate_either_tenant(self, retrieve):
        self.bind_customer()
        other_owner = User.objects.create_user('other-owner', email='other@example.test')
        other_tenant = Tenant.objects.create(name='Tenant B', owner=other_owner, timezone='UTC')
        other_subscription = TenantSubscription.objects.create(
            tenant=other_tenant,
            plan=self.plan,
            status='trialing',
            external_customer_id='cus_other',
            external_subscription_id='sub_other',
        )
        before_a = self.billing_snapshot()
        before_b = (
            other_subscription.external_customer_id,
            other_subscription.external_subscription_id,
            other_subscription.status,
        )
        retrieve.return_value = self.provider_subscription(
            id='sub_other', customer='cus_other',
            metadata={'tenant_id': other_tenant.tenant_id},
        )
        response = self.post_verified_event(self.checkout_event(
            event_id='evt_checkout_cross_tenant', subscription='sub_other'
        ))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.billing_snapshot(), before_a)
        other_subscription.refresh_from_db()
        self.assertEqual((
            other_subscription.external_customer_id,
            other_subscription.external_subscription_id,
            other_subscription.status,
        ), before_b)

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_invoice_paid_customer_and_subscription_mismatches_fail_closed(self, retrieve):
        self.bind_subscription()
        for index, (invoice, provider, expected_code) in enumerate((
            (
                {'id': 'in_customer', 'customer': 'cus_other', 'subscription': 'sub_test'},
                self.provider_subscription('active'),
                'stripe_customer_mismatch',
            ),
            (
                {'id': 'in_subscription', 'customer': 'cus_test', 'subscription': 'sub_test'},
                self.provider_subscription('active', id='sub_other'),
                'stripe_subscription_mismatch',
            ),
        )):
            with self.subTest(expected_code=expected_code):
                before = self.billing_snapshot()
                retrieve.return_value = provider
                event_id = f'evt_invoice_paid_mismatch_{index}'
                response = self.post_verified_event(self.event(
                    event_id, 'invoice.paid', invoice
                ))
                self.assertEqual(response.status_code, 500)
                self.assertEqual(self.billing_snapshot(), before)
                self.assertEqual(
                    BillingWebhookEvent.objects.get(event_id=event_id).error_code,
                    expected_code,
                )

    @patch('myappLubd.billing.stripe_service.stripe.Subscription.retrieve')
    def test_invoice_failure_identity_mismatch_does_not_set_status_or_grace(self, retrieve):
        self.bind_subscription()
        for index, (invoice, provider, expected_code) in enumerate((
            (
                {'id': 'in_failed_customer', 'customer': 'cus_other', 'subscription': 'sub_test'},
                self.provider_subscription('past_due'),
                'stripe_customer_mismatch',
            ),
            (
                {'id': 'in_failed_subscription', 'customer': 'cus_test', 'subscription': 'sub_test'},
                self.provider_subscription('past_due', id='sub_other'),
                'stripe_subscription_mismatch',
            ),
        )):
            with self.subTest(expected_code=expected_code):
                self.subscription.status = 'active'
                self.subscription.grace_period_ends_at = None
                self.subscription.save(update_fields=['status', 'grace_period_ends_at'])
                retrieve.return_value = provider
                event_id = f'evt_invoice_failed_mismatch_{index}'
                response = self.post_verified_event(self.event(
                    event_id, 'invoice.payment_failed', invoice
                ))
                self.assertEqual(response.status_code, 500)
                self.subscription.refresh_from_db()
                self.assertEqual(self.subscription.status, 'active')
                self.assertIsNone(self.subscription.grace_period_ends_at)
                self.assertEqual(
                    BillingWebhookEvent.objects.get(event_id=event_id).error_code,
                    expected_code,
                )

    def test_failed_retry_that_fails_remains_failed(self):
        event = self.event('evt_retry_still_failed', 'unhandled.safe', {'id': 'object'})
        BillingWebhookEvent.objects.create(
            provider='stripe', event_id=event['id'], event_type=event['type'], status='failed'
        )
        with patch(
            'myappLubd.billing.stripe_service._dispatch_event',
            side_effect=RuntimeError('temporary failure'),
        ):
            with self.assertRaises(RuntimeError):
                process_webhook_event(event)
        receipt = BillingWebhookEvent.objects.get(event_id=event['id'])
        self.assertEqual(receipt.status, 'failed')
        self.assertEqual(receipt.error_code, 'provider_processing_error')


@override_settings(**TEST_SETTINGS)
class StripeWebhookConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def event(self, event_id):
        return {
            'id': event_id,
            'type': 'unhandled.safe',
            'created': int(time.time()),
            'data': {'object': {'id': 'object'}},
        }

    def run_concurrently(self, event):
        start = threading.Barrier(2)

        def worker():
            close_old_connections()
            try:
                start.wait(timeout=5)
                return process_webhook_event(event)
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(worker) for _ in range(2)]
            return [future.result(timeout=10) for future in futures]

    def blocking_dispatch(self, call_count, count_lock):
        with count_lock:
            call_count.append(1)
        # Keep the first transaction open long enough for the other worker to
        # contend on the PostgreSQL row/unique-key lock.
        time.sleep(0.2)

    def test_two_concurrent_failed_retries_dispatch_only_once(self):
        event = self.event('evt_concurrent_failed')
        BillingWebhookEvent.objects.create(
            provider='stripe', event_id=event['id'], event_type=event['type'], status='failed'
        )
        calls = []
        count_lock = threading.Lock()
        with patch(
            'myappLubd.billing.stripe_service._dispatch_event',
            side_effect=lambda _event: self.blocking_dispatch(calls, count_lock),
        ):
            results = self.run_concurrently(event)
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(len(calls), 1)
        self.assertEqual(
            BillingWebhookEvent.objects.get(event_id=event['id']).status,
            'processed',
        )

    def test_two_concurrent_new_deliveries_create_one_receipt_and_dispatch_once(self):
        event = self.event('evt_concurrent_new')
        calls = []
        count_lock = threading.Lock()
        with patch(
            'myappLubd.billing.stripe_service._dispatch_event',
            side_effect=lambda _event: self.blocking_dispatch(calls, count_lock),
        ):
            results = self.run_concurrently(event)
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(len(calls), 1)
        self.assertEqual(BillingWebhookEvent.objects.filter(event_id=event['id']).count(), 1)

    def test_committed_processing_receipt_is_not_dispatched_again(self):
        event = self.event('evt_already_processing')
        BillingWebhookEvent.objects.create(
            provider='stripe', event_id=event['id'], event_type=event['type'], status='processing'
        )
        with patch('myappLubd.billing.stripe_service._dispatch_event') as dispatch:
            self.assertFalse(process_webhook_event(event))
        dispatch.assert_not_called()

    def test_processed_duplicate_is_not_dispatched_again(self):
        event = self.event('evt_already_processed')
        BillingWebhookEvent.objects.create(
            provider='stripe', event_id=event['id'], event_type=event['type'], status='processed'
        )
        with patch('myappLubd.billing.stripe_service._dispatch_event') as dispatch:
            self.assertFalse(process_webhook_event(event))
        dispatch.assert_not_called()

    def test_concurrent_retry_applies_subscription_state_once(self):
        plan = SubscriptionPlan.objects.create(code='starter', name='Starter')
        owner = User.objects.create_user('concurrent-owner', email='concurrent@example.test')
        tenant = Tenant.objects.create(name='Concurrent Tenant', owner=owner, timezone='UTC')
        subscription = TenantSubscription.objects.create(
            tenant=tenant,
            plan=plan,
            status='trialing',
            external_customer_id='cus_concurrent',
        )
        now = int(datetime(2026, 9, 1, 12, tzinfo=UTC).timestamp())
        event = {
            'id': 'evt_concurrent_state',
            'type': 'customer.subscription.updated',
            'created': now,
            'data': {'object': {
                'id': 'sub_concurrent',
                'customer': 'cus_concurrent',
                'status': 'active',
                'metadata': {'tenant_id': tenant.tenant_id},
                'current_period_start': now,
                'current_period_end': now + 30 * 86400,
                'trial_end': None,
                'cancel_at_period_end': False,
                'items': {'data': [{
                    'price': {'id': 'price_starter'},
                    'current_period_start': now,
                    'current_period_end': now + 30 * 86400,
                }]},
            }},
        }
        BillingWebhookEvent.objects.create(
            provider='stripe', event_id=event['id'], event_type=event['type'], status='failed'
        )
        with patch(
            'myappLubd.billing.stripe_service.sync_provider_subscription',
            wraps=sync_provider_subscription,
        ) as sync:
            results = self.run_concurrently(event)
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(sync.call_count, 1)
        subscription.refresh_from_db()
        self.assertEqual(subscription.status, 'active')
        self.assertEqual(subscription.external_subscription_id, 'sub_concurrent')
