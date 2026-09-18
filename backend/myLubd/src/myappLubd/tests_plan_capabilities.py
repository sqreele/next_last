from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from .models import Property, SubscriptionPlan, Tenant, TenantMembership, TenantSubscription
from .plan_capabilities import (
    PLAN_FEATURES,
    PlanFeatureNotAvailable,
    get_plan_capabilities,
    require_plan_feature,
)


MATRIX = {
    'starter': set(),
    'pro': {'preventive_maintenance', 'pm_schedules', 'technician_kpi', 'advanced_reports', 'csv_export'},
    'enterprise': {
        'preventive_maintenance', 'pm_schedules', 'technician_kpi',
        'advanced_reports', 'csv_export', 'multi_property',
        'advanced_property_permissions',
    },
}


class PlanCapabilityTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('capability-user', password='test-pass')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def make_tenant(self, code):
        features = {feature: feature in MATRIX[code] for feature in PLAN_FEATURES}
        plan, _ = SubscriptionPlan.objects.update_or_create(
            code=code,
            defaults={'name': code.title(), 'features': features},
        )
        tenant = Tenant.objects.create(name=f'{code} tenant', owner=self.user)
        TenantMembership.objects.create(tenant=tenant, user=self.user, role='admin')
        TenantSubscription.objects.create(
            tenant=tenant,
            plan=plan,
            status='active',
            current_period_end=timezone.localdate() + timedelta(days=30),
        )
        return tenant

    def test_canonical_matrix_and_portfolio_dashboard_not_implemented(self):
        for code, enabled in MATRIX.items():
            tenant = self.make_tenant(code)
            capabilities = get_plan_capabilities(tenant.subscription)
            self.assertEqual(set(key for key, value in capabilities.items() if value), enabled)
            self.assertFalse(capabilities['portfolio_dashboard'])

    def test_feature_denial_contract_is_stable(self):
        tenant = self.make_tenant('starter')
        with self.assertRaises(PlanFeatureNotAvailable) as raised:
            require_plan_feature(tenant, 'preventive_maintenance')
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail['code'], 'feature_not_available')
        self.assertEqual(raised.exception.detail['feature'], 'preventive_maintenance')

    def test_entitlement_api_returns_effective_features_and_limit_sections(self):
        tenant = self.make_tenant('pro')
        prop = Property.objects.create(name='Hotel', tenant=tenant)
        response = self.client.get(
            '/api/v1/tenant-subscriptions/entitlement/',
            {'property_id': prop.property_id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['features'], get_plan_capabilities(tenant.subscription))
        for key in ('limits', 'usage', 'remaining'):
            self.assertIn(key, response.data)

    def test_starter_pm_direct_api_is_denied(self):
        tenant = self.make_tenant('starter')
        prop = Property.objects.create(name='Hotel', tenant=tenant)
        response = self.client.get('/api/v1/preventive-maintenance/', {'property_id': prop.property_id})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'feature_not_available')
        self.assertEqual(response.data['feature'], 'preventive_maintenance')

    def test_pro_and_enterprise_pm_and_schedule_apis_are_allowed(self):
        for code in ('pro', 'enterprise'):
            tenant = self.make_tenant(code)
            prop = Property.objects.create(name=f'{code} hotel', tenant=tenant)
            pm = self.client.get('/api/v1/preventive-maintenance/', {'property_id': prop.property_id})
            schedules = self.client.get('/api/v1/preventive-maintenance/plans/', {'property_id': prop.property_id})
            self.assertEqual(pm.status_code, 200, code)
            self.assertEqual(schedules.status_code, 200, code)

    def test_pro_second_property_denied_but_existing_property_remains_readable(self):
        tenant = self.make_tenant('pro')
        first = Property.objects.create(name='Grandfathered one', tenant=tenant)
        second = Property.objects.create(name='Grandfathered two', tenant=tenant)
        response = self.client.get(f'/api/v1/properties/{second.property_id}/')
        self.assertEqual(response.status_code, 200)
        create = self.client.post('/api/v1/properties/', {'name': 'Third'}, format='json')
        self.assertEqual(create.status_code, 403)
        self.assertEqual(create.data['feature'], 'multi_property')

    def test_enterprise_multi_property_then_quantitative_limit(self):
        tenant = self.make_tenant('enterprise')
        tenant.subscription.plan.max_properties = 5
        tenant.subscription.plan.save(update_fields=['max_properties'])
        Property.objects.create(name='First', tenant=tenant)
        for number in range(2, 6):
            response = self.client.post('/api/v1/properties/', {'name': f'Hotel {number}'}, format='json')
            self.assertEqual(response.status_code, 201, response.data)
        sixth = self.client.post('/api/v1/properties/', {'name': 'Hotel 6'}, format='json')
        self.assertEqual(sixth.status_code, 409, sixth.data)
        self.assertEqual(sixth.data['code'], 'subscription_limit_reached')
