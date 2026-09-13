from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import (
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
    UsageMetric,
)


User = get_user_model()


class BillingAuthorizationTests(APITestCase):
    roles = ('admin', 'manager', 'owner', 'supervisor', 'technician', 'viewer', 'billing')

    def setUp(self):
        self.client = APIClient()
        self.plan = SubscriptionPlan.objects.create(
            code='billing-standard',
            name='Billing Standard',
            monthly_price='49.00',
            max_properties=10,
            max_users=50,
            max_monthly_work_orders=1000,
            max_assets=500,
            max_pm_schedules=100,
        )
        self.tenant_a = Tenant.objects.create(name='Billing Tenant A')
        self.tenant_b = Tenant.objects.create(name='Billing Tenant B')
        self.subscription_a = TenantSubscription.objects.create(
            tenant=self.tenant_a,
            plan=self.plan,
            status='trialing',
        )
        self.subscription_b = TenantSubscription.objects.create(
            tenant=self.tenant_b,
            plan=self.plan,
            status='active',
        )
        self.users = {}
        for role in self.roles:
            user = User.objects.create_user(username=f'billing-{role}', password='pw12345!')
            TenantMembership.objects.create(
                tenant=self.tenant_a,
                user=user,
                role=role,
                is_active=True,
            )
            self.users[role] = user

    def login(self, user):
        self.client.force_authenticate(user=user)

    def subscription_url(self, subscription=None):
        if subscription is None:
            return '/api/v1/tenant-subscriptions/'
        return f'/api/v1/tenant-subscriptions/{subscription.pk}/'

    def test_admin_can_list_detail_and_edit_own_tenant_subscription(self):
        self.login(self.users['admin'])

        listed = self.client.get(self.subscription_url())
        detailed = self.client.get(self.subscription_url(self.subscription_a))
        edited = self.client.patch(
            self.subscription_url(self.subscription_a),
            {'status': 'active'},
            format='json',
        )

        self.assertEqual(listed.status_code, status.HTTP_200_OK, listed.content)
        self.assertEqual([item['id'] for item in listed.data], [self.subscription_a.pk])
        self.assertEqual(detailed.status_code, status.HTTP_200_OK, detailed.content)
        self.assertEqual(edited.status_code, status.HTTP_200_OK, edited.content)
        self.subscription_a.refresh_from_db()
        self.assertEqual(self.subscription_a.status, 'active')

    def test_manager_can_list_detail_and_edit_own_tenant_subscription(self):
        self.login(self.users['manager'])

        listed = self.client.get(self.subscription_url())
        detailed = self.client.get(self.subscription_url(self.subscription_a))
        edited = self.client.patch(
            self.subscription_url(self.subscription_a),
            {'cancel_at_period_end': True},
            format='json',
        )

        self.assertEqual(listed.status_code, status.HTTP_200_OK, listed.content)
        self.assertEqual([item['id'] for item in listed.data], [self.subscription_a.pk])
        self.assertEqual(detailed.status_code, status.HTTP_200_OK, detailed.content)
        self.assertEqual(edited.status_code, status.HTTP_200_OK, edited.content)
        self.subscription_a.refresh_from_db()
        self.assertTrue(self.subscription_a.cancel_at_period_end)

    def test_all_non_billing_access_roles_receive_explicit_403(self):
        for role in ('owner', 'supervisor', 'technician', 'viewer', 'billing'):
            with self.subTest(role=role):
                self.login(self.users[role])
                self.assertEqual(
                    self.client.get(self.subscription_url()).status_code,
                    status.HTTP_403_FORBIDDEN,
                )
                self.assertEqual(
                    self.client.get(self.subscription_url(self.subscription_a)).status_code,
                    status.HTTP_403_FORBIDDEN,
                )
                self.assertEqual(
                    self.client.patch(
                        self.subscription_url(self.subscription_a),
                        {'status': 'active'},
                        format='json',
                    ).status_code,
                    status.HTTP_403_FORBIDDEN,
                )
                self.assertEqual(
                    self.client.post(
                        self.subscription_url(),
                        {'tenant': self.tenant_a.pk, 'plan_id': self.plan.pk},
                        format='json',
                    ).status_code,
                    status.HTTP_403_FORBIDDEN,
                )
                self.assertEqual(
                    self.client.delete(
                        self.subscription_url(self.subscription_a),
                    ).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_admin_and_manager_cannot_guess_or_edit_cross_tenant_subscription(self):
        for role in ('admin', 'manager'):
            with self.subTest(role=role):
                self.login(self.users[role])
                self.assertEqual(
                    self.client.get(self.subscription_url(self.subscription_b)).status_code,
                    status.HTTP_404_NOT_FOUND,
                )
                self.assertEqual(
                    self.client.patch(
                        self.subscription_url(self.subscription_b),
                        {'status': 'cancelled'},
                        format='json',
                    ).status_code,
                    status.HTTP_404_NOT_FOUND,
                )

    def test_update_cannot_change_existing_tenant_ownership(self):
        admin = self.users['admin']
        TenantMembership.objects.create(
            tenant=self.tenant_b,
            user=admin,
            role='admin',
            is_active=True,
        )
        self.login(admin)

        response = self.client.patch(
            self.subscription_url(self.subscription_a),
            {'tenant': self.tenant_b.pk},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.subscription_a.refresh_from_db()
        self.assertEqual(self.subscription_a.tenant_id, self.tenant_a.pk)

    def test_external_billing_identifiers_are_server_owned(self):
        self.login(self.users['admin'])

        response = self.client.patch(
            self.subscription_url(self.subscription_a),
            {
                'external_customer_id': 'attacker-customer',
                'external_subscription_id': 'attacker-subscription',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.subscription_a.refresh_from_db()
        self.assertIsNone(self.subscription_a.external_customer_id)
        self.assertIsNone(self.subscription_a.external_subscription_id)

    def test_create_validates_canonical_membership_for_submitted_tenant(self):
        tenant_c = Tenant.objects.create(name='Billing Tenant C')
        tenant_d = Tenant.objects.create(name='Billing Tenant D')
        self.login(self.users['admin'])

        denied = self.client.post(
            self.subscription_url(),
            {'tenant': tenant_c.pk, 'plan_id': self.plan.pk, 'status': 'trialing'},
            format='json',
        )
        TenantMembership.objects.create(
            tenant=tenant_c,
            user=self.users['admin'],
            role='admin',
            is_active=True,
        )
        allowed = self.client.post(
            self.subscription_url(),
            {'tenant': tenant_c.pk, 'plan_id': self.plan.pk, 'status': 'trialing'},
            format='json',
        )

        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN, denied.content)
        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED, allowed.content)
        self.assertEqual(TenantSubscription.objects.get(tenant=tenant_c).plan, self.plan)

        TenantMembership.objects.create(
            tenant=tenant_d,
            user=self.users['manager'],
            role='manager',
            is_active=True,
        )
        self.login(self.users['manager'])
        manager_allowed = self.client.post(
            self.subscription_url(),
            {'tenant': tenant_d.pk, 'plan_id': self.plan.pk, 'status': 'trialing'},
            format='json',
        )
        self.assertEqual(manager_allowed.status_code, status.HTTP_201_CREATED, manager_allowed.content)

    def test_delete_requires_admin_or_manager_membership(self):
        tenant_c = Tenant.objects.create(name='Billing Delete Tenant')
        subscription_c = TenantSubscription.objects.create(tenant=tenant_c, plan=self.plan)
        TenantMembership.objects.create(
            tenant=tenant_c,
            user=self.users['manager'],
            role='manager',
            is_active=True,
        )
        self.login(self.users['manager'])

        response = self.client.delete(self.subscription_url(subscription_c))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT, response.content)
        self.assertFalse(TenantSubscription.objects.filter(pk=subscription_c.pk).exists())

    def test_inactive_admin_and_is_staff_technician_have_no_bypass(self):
        inactive_admin = User.objects.create_user(username='inactive-billing-admin')
        TenantMembership.objects.create(
            tenant=self.tenant_a,
            user=inactive_admin,
            role='admin',
            is_active=False,
        )
        staff_technician = User.objects.create_user(
            username='staff-billing-technician',
            is_staff=True,
        )
        TenantMembership.objects.create(
            tenant=self.tenant_a,
            user=staff_technician,
            role='technician',
            is_active=True,
        )

        for user in (inactive_admin, staff_technician):
            with self.subTest(user=user.username):
                self.login(user)
                self.assertEqual(
                    self.client.get(self.subscription_url()).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_subscription_plan_read_is_restricted_to_billing_access_roles(self):
        for role in ('admin', 'manager'):
            with self.subTest(role=role):
                self.login(self.users[role])
                self.assertEqual(
                    self.client.get('/api/v1/subscription-plans/').status_code,
                    status.HTTP_200_OK,
                )
        for role in ('owner', 'supervisor', 'technician', 'viewer', 'billing'):
            with self.subTest(role=role):
                self.login(self.users[role])
                self.assertEqual(
                    self.client.get('/api/v1/subscription-plans/').status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_tenant_api_does_not_leak_embedded_billing_data(self):
        self.tenant_a.billing_email = 'accounts@tenant-a.example'
        self.tenant_a.save(update_fields=['billing_email'])
        self.login(self.users['owner'])

        response = self.client.get(f'/api/v1/tenants/{self.tenant_a.pk}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertIsNone(response.data['subscription'])
        self.assertIsNone(response.data['billing_email'])

        self.login(self.users['manager'])
        allowed = self.client.get(f'/api/v1/tenants/{self.tenant_a.pk}/')
        self.assertEqual(allowed.status_code, status.HTTP_200_OK, allowed.content)
        self.assertEqual(allowed.data['subscription']['id'], self.subscription_a.pk)
        self.assertEqual(allowed.data['billing_email'], 'accounts@tenant-a.example')

    def test_owner_cannot_mutate_billing_fields_through_tenant_api(self):
        self.login(self.users['owner'])

        response = self.client.patch(
            f'/api/v1/tenants/{self.tenant_a.pk}/',
            {'billing_email': 'owner-change@example.com', 'status': 'suspended'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self.tenant_a.refresh_from_db()
        self.assertNotEqual(self.tenant_a.billing_email, 'owner-change@example.com')
        self.assertNotEqual(self.tenant_a.status, 'suspended')

    def test_usage_metrics_use_the_same_billing_authorization_and_tenant_scope(self):
        metric_a = UsageMetric.objects.create(
            tenant=self.tenant_a,
            period_start='2026-09-01',
            period_end='2026-09-30',
        )
        UsageMetric.objects.create(
            tenant=self.tenant_b,
            period_start='2026-09-01',
            period_end='2026-09-30',
        )
        self.login(self.users['admin'])
        allowed = self.client.get('/api/v1/usage-metrics/')
        self.assertEqual(allowed.status_code, status.HTTP_200_OK, allowed.content)
        self.assertEqual([item['id'] for item in allowed.data], [metric_a.pk])

        self.login(self.users['billing'])
        denied = self.client.get('/api/v1/usage-metrics/')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN, denied.content)

    def test_platform_superuser_retains_explicit_break_glass(self):
        superuser = User.objects.create_superuser(
            username='billing-break-glass',
            email='break-glass@example.com',
            password='pw12345!',
        )
        self.login(superuser)

        listed = self.client.get(self.subscription_url())
        detailed = self.client.get(self.subscription_url(self.subscription_b))
        edited = self.client.patch(
            self.subscription_url(self.subscription_b),
            {'status': 'past_due'},
            format='json',
        )

        self.assertEqual(listed.status_code, status.HTTP_200_OK, listed.content)
        self.assertEqual({item['id'] for item in listed.data}, {
            self.subscription_a.pk,
            self.subscription_b.pk,
        })
        self.assertEqual(detailed.status_code, status.HTTP_200_OK, detailed.content)
        self.assertEqual(edited.status_code, status.HTTP_200_OK, edited.content)
