from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import Permission
from django.test import RequestFactory, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    BillingWebhookEvent,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
    UsageMetric,
)
from .admin import (
    BillingWebhookEventAdmin,
    SubscriptionPlanAdmin,
    TenantAdmin,
    TenantSubscriptionAdmin,
    UsageMetricAdmin,
)


User = get_user_model()
ALLOWED_ROLES = ('admin', 'manager')
DENIED_ROLES = ('owner', 'supervisor', 'technician', 'viewer', 'billing')


@override_settings(
    STRIPE_SECRET_KEY='sk_test_unit',
    STRIPE_PUBLISHABLE_KEY='pk_test_unit',
    STRIPE_PRICE_MAP={'billing-auth': 'price_billing_auth'},
    FRONTEND_BASE_URL='https://staymaint.test',
    SECURE_SSL_REDIRECT=False,
)
class BillingAuthorizationTests(APITestCase):
    def setUp(self):
        self.plan = SubscriptionPlan.objects.create(
            code='billing-auth', name='Billing Auth', monthly_price='99.00'
        )
        self.other_plan = SubscriptionPlan.objects.create(
            code='billing-auth-other', name='Other Plan', is_active=False
        )
        self.tenant = Tenant.objects.create(
            name='Billing Tenant', billing_email='private@example.test', status='active'
        )
        self.other_tenant = Tenant.objects.create(
            name='Other Billing Tenant', billing_email='other@example.test', status='past_due'
        )
        self.subscription = TenantSubscription.objects.create(
            tenant=self.tenant, plan=self.plan, status='active'
        )
        self.other_subscription = TenantSubscription.objects.create(
            tenant=self.other_tenant, plan=self.plan, status='past_due'
        )
        self.metric = UsageMetric.objects.create(
            tenant=self.tenant,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            work_order_count=7,
        )
        self.other_metric = UsageMetric.objects.create(
            tenant=self.other_tenant,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            work_order_count=99,
        )
        self.users = {}
        for role in (*ALLOWED_ROLES, *DENIED_ROLES):
            user = User.objects.create_user(username=f'billing-{role}')
            TenantMembership.objects.create(tenant=self.tenant, user=user, role=role)
            self.users[role] = user
        self.inactive_admin = User.objects.create_user(username='billing-inactive-admin')
        TenantMembership.objects.create(
            tenant=self.tenant,
            user=self.inactive_admin,
            role='admin',
            is_active=False,
        )
        self.superuser = User.objects.create_superuser(
            username='billing-platform-superuser',
            email='platform@example.test',
            password='test-password',
        )
        self.request_factory = RequestFactory()

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def result_rows(self, response):
        if isinstance(response.data, dict):
            return response.data.get('results', response.data)
        return response.data

    def test_admin_and_manager_can_read_billing_endpoints(self):
        endpoints = (
            '/api/v1/subscription-plans/',
            '/api/v1/tenant-subscriptions/',
            '/api/v1/usage-metrics/',
            '/api/v1/tenants/billing/',
            f'/api/v1/tenants/{self.tenant.pk}/usage/',
        )
        for role in ALLOWED_ROLES:
            self.authenticate(self.users[role])
            for endpoint in endpoints:
                with self.subTest(role=role, endpoint=endpoint):
                    response = self.client.get(endpoint)
                    self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

            detail = self.client.get(
                f'/api/v1/tenant-subscriptions/{self.subscription.pk}/'
            )
            entitlement = self.client.get(
                '/api/v1/tenant-subscriptions/entitlement/',
                {'tenant_id': self.tenant.tenant_id},
            )
            self.assertEqual(detail.status_code, status.HTTP_200_OK)
            self.assertEqual(entitlement.status_code, status.HTTP_200_OK)
            self.assertTrue(entitlement.data['can_manage_billing'])

    def test_denied_roles_and_inactive_admin_receive_explicit_403(self):
        endpoints = (
            '/api/v1/subscription-plans/',
            '/api/v1/tenant-subscriptions/',
            '/api/v1/usage-metrics/',
            '/api/v1/tenants/billing/',
            f'/api/v1/tenants/{self.tenant.pk}/usage/',
            '/api/v1/tenant-subscriptions/entitlement/'
            f'?tenant_id={self.tenant.tenant_id}',
        )
        principals = [(role, self.users[role]) for role in DENIED_ROLES]
        principals.append(('inactive-admin', self.inactive_admin))
        for label, user in principals:
            self.authenticate(user)
            for endpoint in endpoints:
                with self.subTest(role=label, endpoint=endpoint):
                    response = self.client.get(endpoint)
                    self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authorized_billing_lists_are_scoped_to_active_membership_tenant(self):
        self.authenticate(self.users['admin'])
        subscriptions = self.result_rows(self.client.get('/api/v1/tenant-subscriptions/'))
        metrics = self.result_rows(self.client.get('/api/v1/usage-metrics/'))
        tenants = self.result_rows(self.client.get('/api/v1/tenants/billing/'))
        self.assertEqual({row['id'] for row in subscriptions}, {self.subscription.pk})
        self.assertEqual({row['id'] for row in metrics}, {self.metric.pk})
        self.assertEqual({row['id'] for row in tenants}, {self.tenant.pk})

    def test_cross_tenant_guessed_ids_return_404(self):
        self.authenticate(self.users['admin'])
        endpoints = (
            f'/api/v1/tenant-subscriptions/{self.other_subscription.pk}/',
            '/api/v1/tenant-subscriptions/entitlement/'
            f'?tenant_id={self.other_tenant.tenant_id}',
            f'/api/v1/tenants/{self.other_tenant.pk}/usage/',
        )
        for endpoint in endpoints:
            with self.subTest(endpoint=endpoint):
                self.assertEqual(
                    self.client.get(endpoint).status_code,
                    status.HTTP_404_NOT_FOUND,
                )
        checkout = self.client.post(
            '/api/v1/billing/checkout/',
            {'tenant_id': self.other_tenant.tenant_id, 'plan': self.plan.pk},
            format='json',
        )
        self.assertEqual(checkout.status_code, status.HTTP_404_NOT_FOUND)

    @patch('myappLubd.billing.stripe_service.stripe.checkout.Session.create')
    @patch('myappLubd.billing.stripe_service.stripe.Customer.create')
    def test_admin_and_manager_can_use_supported_checkout_mutation(
        self, customer_create, checkout_create
    ):
        checkout_create.return_value = {'url': 'https://checkout.stripe.com/test'}
        for role in ALLOWED_ROLES:
            with self.subTest(role=role):
                self.subscription.external_customer_id = None
                self.subscription.save(update_fields=['external_customer_id'])
                customer_create.return_value = {'id': f'cus_{role}'}
                self.authenticate(self.users[role])
                response = self.client.post(
                    '/api/v1/billing/checkout/',
                    {'tenant_id': self.tenant.tenant_id, 'plan': self.plan.pk},
                    format='json',
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    @patch('myappLubd.billing.stripe_service.stripe.billing_portal.Session.create')
    def test_admin_and_manager_can_use_supported_portal_mutation(self, portal_create):
        self.subscription.external_customer_id = 'cus_portal'
        self.subscription.save(update_fields=['external_customer_id'])
        portal_create.return_value = {'url': 'https://billing.stripe.com/test'}
        for role in ALLOWED_ROLES:
            with self.subTest(role=role):
                self.authenticate(self.users[role])
                response = self.client.post(
                    '/api/v1/billing/portal/',
                    {'tenant_id': self.tenant.tenant_id},
                    format='json',
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    def test_denied_roles_cannot_use_billing_mutations(self):
        for role in DENIED_ROLES:
            self.authenticate(self.users[role])
            for endpoint in ('/api/v1/billing/checkout/', '/api/v1/billing/portal/'):
                with self.subTest(role=role, endpoint=endpoint):
                    response = self.client.post(
                        endpoint,
                        {'tenant_id': self.tenant.tenant_id, 'plan': self.plan.pk},
                        format='json',
                    )
                    self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_subscription_projection_remains_provider_read_only(self):
        for role in ALLOWED_ROLES:
            self.authenticate(self.users[role])
            response = self.client.patch(
                f'/api/v1/tenant-subscriptions/{self.subscription.pk}/',
                {'tenant': self.other_tenant.pk, 'status': 'cancelled'},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.tenant_id, self.tenant.pk)
        self.assertEqual(self.subscription.status, 'active')

    def test_global_plan_mutation_remains_superuser_only(self):
        payload = {'code': 'new-plan', 'name': 'New Plan'}
        for role in ALLOWED_ROLES:
            self.authenticate(self.users[role])
            self.assertEqual(
                self.client.post('/api/v1/subscription-plans/', payload, format='json').status_code,
                status.HTTP_403_FORBIDDEN,
            )
        self.authenticate(self.superuser)
        response = self.client.post('/api/v1/subscription-plans/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

    def test_tenant_serializer_redacts_indirect_billing_data_for_denied_roles(self):
        for role in DENIED_ROLES:
            self.authenticate(self.users[role])
            response = self.client.get(f'/api/v1/tenants/{self.tenant.pk}/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            for field in ('billing_email', 'status', 'subscription'):
                self.assertNotIn(field, response.data, role)

        for role in ALLOWED_ROLES:
            self.authenticate(self.users[role])
            response = self.client.get(f'/api/v1/tenants/{self.tenant.pk}/')
            self.assertEqual(response.data['billing_email'], 'private@example.test')
            self.assertEqual(response.data['status'], 'active')
            self.assertEqual(response.data['subscription']['id'], self.subscription.pk)

    def test_denied_roles_cannot_update_embedded_tenant_billing_fields(self):
        for role in DENIED_ROLES:
            self.authenticate(self.users[role])
            response = self.client.patch(
                f'/api/v1/tenants/{self.tenant.pk}/',
                {'billing_email': f'{role}@example.test', 'status': 'past_due'},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.billing_email, 'private@example.test')
        self.assertEqual(self.tenant.status, 'active')

    def test_non_superuser_cannot_set_billing_fields_during_tenant_creation(self):
        self.authenticate(self.users['admin'])
        response = self.client.post(
            '/api/v1/tenants/',
            {
                'name': 'Injected Billing Tenant',
                'billing_email': 'injected@example.test',
                'status': 'past_due',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Tenant.objects.filter(name='Injected Billing Tenant').exists())

    def test_admin_and_manager_can_update_existing_tenant_billing_fields(self):
        for role in ALLOWED_ROLES:
            self.authenticate(self.users[role])
            response = self.client.patch(
                f'/api/v1/tenants/{self.tenant.pk}/',
                {'billing_email': f'{role}@example.test'},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    def test_superuser_retains_platform_break_glass(self):
        self.authenticate(self.superuser)
        subscriptions = self.result_rows(self.client.get('/api/v1/tenant-subscriptions/'))
        metrics = self.result_rows(self.client.get('/api/v1/usage-metrics/'))
        self.assertEqual(
            {row['id'] for row in subscriptions},
            {self.subscription.pk, self.other_subscription.pk},
        )
        self.assertEqual(
            {row['id'] for row in metrics},
            {self.metric.pk, self.other_metric.pk},
        )

    def test_django_admin_billing_surfaces_use_the_same_role_capability(self):
        permissions = Permission.objects.filter(
            codename__in=(
                'view_subscriptionplan',
                'view_tenantsubscription',
                'view_usagemetric',
                'view_billingwebhookevent',
                'view_tenant',
            )
        )
        for user in self.users.values():
            user.is_staff = True
            user.save(update_fields=['is_staff'])
            user.user_permissions.add(*permissions)

        plan_admin = SubscriptionPlanAdmin(SubscriptionPlan, AdminSite())
        subscription_admin = TenantSubscriptionAdmin(TenantSubscription, AdminSite())
        metric_admin = UsageMetricAdmin(UsageMetric, AdminSite())
        webhook_admin = BillingWebhookEventAdmin(BillingWebhookEvent, AdminSite())
        tenant_admin = TenantAdmin(Tenant, AdminSite())

        for role in ALLOWED_ROLES:
            request = self.request_factory.get('/admin/')
            request.user = self.users[role]
            self.assertTrue(plan_admin.has_module_permission(request), role)
            self.assertEqual(
                set(tenant_admin.get_queryset(request).values_list('pk', flat=True)),
                {self.tenant.pk},
            )
            self.assertTrue(subscription_admin.has_module_permission(request), role)
            self.assertTrue(metric_admin.has_module_permission(request), role)
            self.assertEqual(
                set(subscription_admin.get_queryset(request).values_list('pk', flat=True)),
                {self.subscription.pk},
            )
            self.assertEqual(
                set(metric_admin.get_queryset(request).values_list('pk', flat=True)),
                {self.metric.pk},
            )
            self.assertIn('billing_email', tenant_admin.get_list_display(request))

        for role in DENIED_ROLES:
            request = self.request_factory.get('/admin/')
            request.user = self.users[role]
            self.assertFalse(plan_admin.has_module_permission(request), role)
            self.assertFalse(subscription_admin.has_module_permission(request), role)
            self.assertFalse(metric_admin.has_module_permission(request), role)
            self.assertNotIn('billing_email', tenant_admin.get_list_display(request))
            self.assertNotIn('status', tenant_admin.get_list_display(request))

        request = self.request_factory.get('/admin/')
        request.user = self.users['admin']
        self.assertFalse(webhook_admin.has_module_permission(request))
        request.user = self.superuser
        self.assertTrue(webhook_admin.has_module_permission(request))
