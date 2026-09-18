from io import BytesIO
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .models import Property, SubscriptionPlan, Tenant, TenantMembership, TenantSubscription
from .tenancy import SubscriptionUserLimitReached, enforce_tenant_user_limit, get_tenant_user_capacity


User = get_user_model()


class CommercialPlanCapacityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username='commercial-capacity-owner')
        self.plans = {
            code: SubscriptionPlan.objects.update_or_create(
                code=code,
                defaults={
                    'name': name,
                    'monthly_price': price,
                    'max_users': users,
                    'max_properties': properties,
                },
            )[0]
            for code, name, price, users, properties in (
                ('starter', 'Basic', '15.00', 4, 1),
                ('pro', 'Pro', '30.00', 10, 1),
                ('enterprise', 'Enterprise', '60.00', 50, 5),
            )
        }

    def make_tenant(self, code):
        tenant = Tenant.objects.create(name=f'{code}-capacity-tenant')
        TenantSubscription.objects.create(
            tenant=tenant,
            plan=self.plans[code],
            status='active',
            current_period_end=timezone.localdate() + timedelta(days=30),
        )
        TenantMembership.objects.create(tenant=tenant, user=self.owner, role='owner')
        return tenant

    def create_property(self, tenant, name):
        self.client.force_authenticate(self.owner)
        return self.client.post(
            '/api/v1/properties/', {'tenant': tenant.pk, 'name': name}, format='json', secure=True,
        )

    def test_canonical_plan_capacity_values(self):
        self.assertEqual(
            {
                code: (plan.name, plan.monthly_price, plan.max_users, plan.max_properties)
                for code, plan in self.plans.items()
            },
            {
                'starter': ('Basic', '15.00', 4, 1),
                'pro': ('Pro', '30.00', 10, 1),
                'enterprise': ('Enterprise', '60.00', 50, 5),
            },
        )

    def test_quantitative_usage_limits_remain_canonical(self):
        self.assertEqual(
            {
                code: (
                    plan.max_monthly_work_orders,
                    plan.max_pm_schedules,
                    plan.max_assets,
                    plan.max_storage_mb,
                )
                for code, plan in self.plans.items()
            },
            {
                'starter': (500, 100, 250, 10240),
                'pro': (500, 100, 250, 10240),
                'enterprise': (500, 100, 250, 10240),
            },
        )

    def test_starter_and_pro_second_property_are_blocked(self):
        for code in ('starter', 'pro'):
            with self.subTest(plan=code):
                tenant = self.make_tenant(code)
                first = self.create_property(tenant, f'{code} first')
                second = self.create_property(tenant, f'{code} second')
                self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
                self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST, second.data)
                self.assertFalse(Property.objects.filter(name=f'{code} second').exists())

    def test_each_canonical_user_limit_allows_below_and_blocks_at_limit(self):
        for code, limit in (('starter', 4), ('pro', 10), ('enterprise', 50)):
            with self.subTest(plan=code):
                tenant = self.make_tenant(code)
                for index in range(limit - 2):
                    user = User.objects.create_user(username=f'{code}-capacity-user-{index}')
                    TenantMembership.objects.create(
                        tenant=tenant, user=user, role='technician',
                    )

                self.assertTrue(get_tenant_user_capacity(tenant).can_add)
                final_user = User.objects.create_user(username=f'{code}-capacity-final')
                TenantMembership.objects.create(
                    tenant=tenant, user=final_user, role='technician',
                )
                with self.assertRaises(SubscriptionUserLimitReached):
                    enforce_tenant_user_limit(tenant)

    def test_enterprise_allows_five_properties_and_blocks_sixth(self):
        tenant = self.make_tenant('enterprise')
        for index in range(5):
            response = self.create_property(tenant, f'enterprise property {index}')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        blocked = self.create_property(tenant, 'enterprise property 5')
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST, blocked.data)
        self.assertEqual(Property.objects.filter(tenant=tenant).count(), 5)

    def test_enterprise_bulk_import_respects_property_limit(self):
        tenant = self.make_tenant('enterprise')
        for index in range(4):
            response = self.create_property(tenant, f'enterprise existing {index}')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        self.client.force_authenticate(self.owner)
        csv = BytesIO(b'name,property_id,description\nEnterprise imported,,capacity\n')
        csv.name = 'properties.csv'
        allowed = self.client.post(
            '/api/v1/properties/bulk-import/', {'file': csv}, format='multipart', secure=True,
        )
        self.assertIn(allowed.status_code, (status.HTTP_201_CREATED, status.HTTP_207_MULTI_STATUS), allowed.data)
        self.assertEqual(Property.objects.filter(tenant=tenant).count(), 5)

        csv = BytesIO(b'name,property_id,description\nEnterprise blocked,,capacity\n')
        csv.name = 'properties.csv'
        blocked = self.client.post(
            '/api/v1/properties/bulk-import/', {'file': csv}, format='multipart', secure=True,
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST, blocked.data)
        self.assertFalse(Property.objects.filter(name='Enterprise blocked').exists())
