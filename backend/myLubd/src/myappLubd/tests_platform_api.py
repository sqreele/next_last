from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import BillingWebhookEvent, PlatformMembership, SubscriptionPlan, Tenant, TenantMembership, TenantSubscription, UsageMetric


User = get_user_model()


@override_settings(STRIPE_SECRET_KEY='sk_test_dashboard_only')
class PlatformDashboardApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.plan = SubscriptionPlan.objects.create(code='platform-api', name='Platform API')
        self.tenant = Tenant.objects.create(name='Platform API Tenant', timezone='UTC')
        self.subscription = TenantSubscription.objects.create(
            tenant=self.tenant, plan=self.plan, status='trialing',
            trial_ends_at='2026-12-31T16:59:00Z', external_customer_id='cus_safe1234',
            external_subscription_id='sub_safe5678',
        )
        UsageMetric.objects.create(
            tenant=self.tenant, period_start=date.today() - timedelta(days=30), period_end=date.today(),
            property_count=1, active_user_count=2, storage_mb=12,
        )
        BillingWebhookEvent.objects.create(provider='stripe', event_id='evt_safe', event_type='invoice.paid', status='processed')
        self.tenant_admin = User.objects.create_user(username='platform-api-tenant-admin')
        TenantMembership.objects.create(tenant=self.tenant, user=self.tenant_admin, role='admin')
        self.staff = User.objects.create_user(username='platform-api-staff', is_staff=True)
        self.support = User.objects.create_user(username='platform-api-support')
        self.billing = User.objects.create_user(username='platform-api-billing')
        self.super_admin = User.objects.create_user(username='platform-api-super')
        self.break_glass = User.objects.create_superuser(username='platform-api-break', email='break@example.test', password='safe-password')
        for user, role in ((self.support, PlatformMembership.ROLE_PLATFORM_SUPPORT),
                           (self.billing, PlatformMembership.ROLE_PLATFORM_BILLING_ADMIN),
                           (self.super_admin, PlatformMembership.ROLE_PLATFORM_SUPER_ADMIN)):
            PlatformMembership.objects.create(user=user, role=role)

    def get_as(self, user, path):
        self.client.force_authenticate(user=user)
        return self.client.get(path, secure=True, HTTP_HOST='localhost')

    def test_tenant_users_and_staff_cannot_read_global_platform_data(self):
        for user in (self.tenant_admin, self.staff):
            self.assertEqual(self.get_as(user, '/api/v1/platform/tenants/').status_code, 403)
            self.assertEqual(self.get_as(user, '/api/v1/platform/subscriptions/').status_code, 403)

    def test_support_only_receives_tenant_and_diagnostics_reads(self):
        self.assertEqual(self.get_as(self.support, '/api/v1/platform/tenants/').status_code, 200)
        self.assertEqual(self.get_as(self.support, '/api/v1/platform/webhook-events/').status_code, 200)
        self.assertEqual(self.get_as(self.support, '/api/v1/platform/subscriptions/').status_code, 403)
        self.assertEqual(self.get_as(self.support, '/api/v1/platform/usage/').status_code, 403)

    def test_billing_and_superuser_reads_are_allowed_and_safe(self):
        for user in (self.billing, self.super_admin, self.break_glass):
            response = self.get_as(user, '/api/v1/platform/subscriptions/')
            self.assertEqual(response.status_code, 200)
            row = response.data['results'][0]
            self.assertNotIn('external_customer_id', row)
            self.assertNotIn('external_subscription_id', row)
            self.assertEqual(row['customer_suffix'], '1234')
            self.assertEqual(row['provider_mode'], 'test')
            self.assertEqual(self.get_as(user, '/api/v1/platform/usage/').status_code, 200)

    def test_all_platform_endpoints_are_read_only(self):
        self.client.force_authenticate(user=self.super_admin)
        for path in ('/api/v1/platform/tenants/', '/api/v1/platform/subscriptions/',
                     '/api/v1/platform/usage/', '/api/v1/platform/webhook-events/'):
            self.assertEqual(self.client.post(path, {}, format='json', secure=True, HTTP_HOST='localhost').status_code, 405)
            self.assertEqual(self.client.delete(path, secure=True, HTTP_HOST='localhost').status_code, 405)

    def test_detail_uses_public_tenant_id_and_does_not_leak_webhook_payload(self):
        response = self.get_as(self.super_admin, f'/api/v1/platform/tenants/{self.tenant.tenant_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['tenant_id'], self.tenant.tenant_id)
        self.assertFalse(response.data['webhook_summary']['tenant_association_available'])
        self.assertEqual(self.get_as(self.super_admin, '/api/v1/platform/tenants/TDOESNOTEXIST/').status_code, 404)
