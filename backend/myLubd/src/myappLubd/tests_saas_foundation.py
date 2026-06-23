from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import (
    Property,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
)


User = get_user_model()


def _login(client, user):
    client.force_authenticate(user=user)


class SaaSFoundationTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username='owner',
            email='owner@example.com',
            password='pw12345!',
        )
        self.other = User.objects.create_user(
            username='other',
            email='other@example.com',
            password='pw12345!',
        )
        self.plan = SubscriptionPlan.objects.create(
            code='one-property',
            name='One Property',
            max_properties=1,
            max_users=1,
            max_monthly_work_orders=10,
            max_assets=10,
            max_pm_schedules=10,
        )

    def test_creating_tenant_adds_owner_membership_and_subscription(self):
        _login(self.client, self.owner)
        resp = self.client.post(
            '/api/v1/tenants/',
            {
                'name': 'Acme Hotels',
                'billing_email': 'billing@example.com',
                'timezone': 'Asia/Bangkok',
            },
            format='json',
        )

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        tenant = Tenant.objects.get(name='Acme Hotels')
        self.assertEqual(tenant.owner, self.owner)
        self.assertEqual(tenant.timezone, 'Asia/Bangkok')
        self.assertTrue(
            TenantMembership.objects.filter(
                tenant=tenant,
                user=self.owner,
                role='owner',
                is_active=True,
            ).exists()
        )
        self.assertTrue(TenantSubscription.objects.filter(tenant=tenant).exists())

    def test_tenant_timezone_must_be_valid_iana_name(self):
        _login(self.client, self.owner)
        resp = self.client.post(
            '/api/v1/tenants/',
            {'name': 'Bad Zone Hotels', 'timezone': 'Bangkok Time'},
            format='json',
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertIn('timezone', resp.data)

    def test_tenant_timezone_options_endpoint(self):
        _login(self.client, self.owner)
        resp = self.client.get('/api/v1/tenants/timezones/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(resp.data['default'], 'Asia/Bangkok')
        self.assertIn('Asia/Bangkok', resp.data['common'])
        self.assertIn('UTC', resp.data['all'])

    def test_property_create_attaches_to_tenant_and_enforces_plan_limit(self):
        tenant = Tenant.objects.create(name='Limit Hotels', owner=self.owner)
        TenantMembership.objects.create(tenant=tenant, user=self.owner, role='owner')
        TenantSubscription.objects.create(tenant=tenant, plan=self.plan, status='active')

        _login(self.client, self.owner)
        first = self.client.post(
            '/api/v1/properties/',
            {'name': 'Limit Hotel 1', 'tenant': tenant.id},
            format='json',
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.content)
        self.assertEqual(Property.objects.get(name='Limit Hotel 1').tenant, tenant)

        second = self.client.post(
            '/api/v1/properties/',
            {'name': 'Limit Hotel 2', 'tenant': tenant.id},
            format='json',
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST, second.content)
        self.assertIn('billing_limit', second.data)

    def test_properties_all_is_scoped_for_regular_users(self):
        visible_tenant = Tenant.objects.create(name='Visible Hotels', owner=self.owner)
        hidden_tenant = Tenant.objects.create(name='Hidden Hotels', owner=self.other)
        TenantMembership.objects.create(tenant=visible_tenant, user=self.owner, role='owner')
        TenantMembership.objects.create(tenant=hidden_tenant, user=self.other, role='owner')

        visible = Property.objects.create(name='Visible Hotel', tenant=visible_tenant)
        hidden = Property.objects.create(name='Hidden Hotel', tenant=hidden_tenant)
        visible.users.add(self.owner)
        hidden.users.add(self.other)

        _login(self.client, self.owner)
        resp = self.client.get('/api/v1/properties/all/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        names = {item['name'] for item in resp.data}
        self.assertEqual(names, {'Visible Hotel'})

    def test_membership_create_enforces_user_limit(self):
        tenant = Tenant.objects.create(name='Seat Limited', owner=self.owner)
        TenantMembership.objects.create(tenant=tenant, user=self.owner, role='owner')
        TenantSubscription.objects.create(tenant=tenant, plan=self.plan, status='active')

        _login(self.client, self.owner)
        resp = self.client.post(
            '/api/v1/tenant-memberships/',
            {
                'tenant': tenant.id,
                'user_id': self.other.id,
                'role': 'technician',
                'is_active': True,
            },
            format='json',
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertIn('billing_limit', resp.data)
