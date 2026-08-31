from datetime import datetime, timedelta
from types import SimpleNamespace

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient, APIRequestFactory

from .entitlements import EntitlementLevel, get_tenant_entitlement
from .admin import TenantSubscriptionAdmin
from .models import (
    Inventory,
    Job,
    PreventiveMaintenance,
    Property,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
)
from .subscription_permissions import (
    SubscriptionWritePermission,
    get_subscription_enforcement_mode,
    resolve_tenant_from_target,
    resolve_tenant_from_validated_data,
)
from .tenancy import enforce_subscription_limit


User = get_user_model()


class TenantEntitlementTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='subscription-owner',
            email='subscription-owner@example.com',
            password='test-password',
        )
        self.plan = SubscriptionPlan.objects.create(
            code='entitlement-test',
            name='Entitlement Test',
            max_properties=1,
            max_users=2,
        )
        self.tenant = Tenant.objects.create(
            name='Entitlement Tenant',
            owner=self.user,
            timezone='Asia/Bangkok',
        )
        self.membership = TenantMembership.objects.create(
            tenant=self.tenant,
            user=self.user,
            role='owner',
        )

    def make_subscription(self, status_value, **fields):
        return TenantSubscription.objects.create(
            tenant=self.tenant,
            plan=self.plan,
            status=status_value,
            **fields,
        )

    def test_active_is_full(self):
        self.make_subscription('active')
        result = get_tenant_entitlement(self.tenant)
        self.assertEqual(result.level, EntitlementLevel.FULL)
        self.assertTrue(result.can_write)

    def test_trialing_is_full(self):
        self.make_subscription('trialing')
        self.assertEqual(
            get_tenant_entitlement(self.tenant).level,
            EntitlementLevel.FULL,
        )

    def test_past_due_within_grace_is_grace(self):
        grace_end = timezone.now() + timedelta(days=1)
        self.make_subscription('past_due', grace_period_ends_at=grace_end)
        result = get_tenant_entitlement(self.tenant)
        self.assertEqual(result.level, EntitlementLevel.GRACE)
        self.assertEqual(result.grace_ends_at, grace_end)
        self.assertTrue(result.can_write)

    def test_past_due_after_grace_is_read_only(self):
        self.make_subscription(
            'past_due',
            grace_period_ends_at=timezone.now() - timedelta(seconds=1),
        )
        result = get_tenant_entitlement(self.tenant)
        self.assertEqual(result.level, EntitlementLevel.READ_ONLY)
        self.assertEqual(result.reason_code, 'past_due_grace_period_expired')

    def test_past_due_without_grace_is_read_only(self):
        self.make_subscription('past_due')
        result = get_tenant_entitlement(self.tenant)
        self.assertEqual(result.level, EntitlementLevel.READ_ONLY)
        self.assertEqual(result.reason_code, 'past_due_missing_grace_period')

    def test_suspended_is_read_only(self):
        self.make_subscription('suspended')
        self.assertEqual(
            get_tenant_entitlement(self.tenant).level,
            EntitlementLevel.READ_ONLY,
        )

    def test_unknown_status_is_read_only(self):
        subscription = self.make_subscription('active')
        subscription.status = 'provider_unknown'
        result = get_tenant_entitlement(self.tenant)
        self.assertEqual(result.level, EntitlementLevel.READ_ONLY)
        self.assertEqual(result.reason_code, 'subscription_status_unknown')

    def test_cancelled_is_full_through_tenant_local_period_end_day(self):
        at = timezone.now()
        local_date = timezone.localtime(at, timezone.get_fixed_timezone(420)).date()
        self.make_subscription('cancelled', current_period_end=local_date)
        result = get_tenant_entitlement(self.tenant, at=at)
        self.assertEqual(result.level, EntitlementLevel.FULL)

    def test_cancelled_after_period_end_is_read_only(self):
        at = timezone.now()
        local_date = timezone.localtime(at, timezone.get_fixed_timezone(420)).date()
        self.make_subscription(
            'cancelled',
            current_period_end=local_date - timedelta(days=1),
        )
        self.assertEqual(
            get_tenant_entitlement(self.tenant, at=at).level,
            EntitlementLevel.READ_ONLY,
        )

    def test_cancelled_with_invalid_tenant_timezone_fails_closed(self):
        self.tenant.timezone = 'Not/A-Timezone'
        self.make_subscription(
            'cancelled',
            current_period_end=timezone.now().date() + timedelta(days=1),
        )
        result = get_tenant_entitlement(self.tenant)
        self.assertEqual(result.level, EntitlementLevel.READ_ONLY)
        self.assertEqual(result.reason_code, 'cancelled_invalid_tenant_timezone')

    def test_naive_evaluation_time_is_rejected(self):
        self.make_subscription('active')
        with self.assertRaises(ValueError):
            get_tenant_entitlement(self.tenant, at=datetime(2026, 8, 31, 12, 0))

    def test_missing_subscription_is_read_only_and_does_not_create_one(self):
        before = TenantSubscription.objects.count()
        result = get_tenant_entitlement(self.tenant)
        self.assertEqual(result.level, EntitlementLevel.READ_ONLY)
        self.assertEqual(result.reason_code, 'subscription_missing')
        self.assertEqual(TenantSubscription.objects.count(), before)

    def test_same_user_second_active_tenant_remains_full(self):
        self.make_subscription('suspended')
        active_tenant = Tenant.objects.create(
            name='Second Active Tenant',
            owner=self.user,
        )
        TenantMembership.objects.create(
            tenant=active_tenant,
            user=self.user,
            role='owner',
        )
        TenantSubscription.objects.create(
            tenant=active_tenant,
            plan=self.plan,
            status='active',
        )

        self.assertEqual(
            get_tenant_entitlement(self.tenant).level,
            EntitlementLevel.READ_ONLY,
        )
        self.assertEqual(
            get_tenant_entitlement(active_tenant).level,
            EntitlementLevel.FULL,
        )

    def test_target_resolvers_use_the_operational_object_tenant(self):
        property_obj = Property.objects.create(
            name='Resolver Property',
            tenant=self.tenant,
        )
        job = Job.objects.create(
            user=self.user,
            updated_by=self.user,
            property=property_obj,
            description='Resolver Job',
        )
        inventory = Inventory.objects.create(
            name='Resolver Inventory',
            property=property_obj,
            created_by=self.user,
        )
        pm = PreventiveMaintenance(job=job)

        self.assertEqual(resolve_tenant_from_target(property_obj), self.tenant)
        self.assertEqual(resolve_tenant_from_target(job), self.tenant)
        self.assertEqual(resolve_tenant_from_target(inventory), self.tenant)
        self.assertEqual(resolve_tenant_from_target(pm), self.tenant)
        self.assertEqual(
            resolve_tenant_from_validated_data({'_resolved_property': property_obj}),
            self.tenant,
        )

    def test_evaluation_does_not_mutate_membership_or_property_grants(self):
        self.make_subscription('suspended')
        property_obj = Property.objects.create(
            name='Entitlement Property',
            tenant=self.tenant,
        )
        self.membership.properties.add(property_obj)
        membership_count = TenantMembership.objects.count()
        property_ids = list(self.membership.properties.values_list('pk', flat=True))

        get_tenant_entitlement(self.tenant)

        self.membership.refresh_from_db()
        self.assertTrue(self.membership.is_active)
        self.assertEqual(TenantMembership.objects.count(), membership_count)
        self.assertEqual(
            list(self.membership.properties.values_list('pk', flat=True)),
            property_ids,
        )

    def test_runtime_limit_check_does_not_provision_missing_subscription(self):
        with self.assertRaises(PermissionDenied):
            enforce_subscription_limit(self.tenant, 'max_properties')
        self.assertFalse(TenantSubscription.objects.filter(tenant=self.tenant).exists())

    def test_existing_active_plan_limit_still_applies(self):
        self.make_subscription('active')
        Property.objects.create(name='Existing Plan Property', tenant=self.tenant)
        with self.assertRaises(ValidationError):
            enforce_subscription_limit(self.tenant, 'max_properties')


class TenantSubscriptionApiHardeningTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='api-subscription-owner',
            email='api-subscription-owner@example.com',
            password='test-password',
        )
        plan = SubscriptionPlan.objects.create(code='api-plan', name='API Plan')
        tenant = Tenant.objects.create(name='API Subscription Tenant', owner=self.user)
        TenantMembership.objects.create(tenant=tenant, user=self.user, role='owner')
        self.subscription = TenantSubscription.objects.create(
            tenant=tenant,
            plan=plan,
            status='trialing',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = f'/api/v1/tenant-subscriptions/{self.subscription.pk}/'

    def assert_patch_is_disabled_and_unchanged(self, payload, field_name):
        response = self.client.patch(self.url, payload, format='json', secure=True)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.subscription.refresh_from_db()
        self.assertNotEqual(getattr(self.subscription, field_name), next(iter(payload.values())))

    def test_external_customer_id_cannot_be_customer_written(self):
        self.assert_patch_is_disabled_and_unchanged(
            {'external_customer_id': 'customer-controlled'},
            'external_customer_id',
        )

    def test_external_subscription_id_cannot_be_customer_written(self):
        self.assert_patch_is_disabled_and_unchanged(
            {'external_subscription_id': 'subscription-controlled'},
            'external_subscription_id',
        )

    def test_status_cannot_be_customer_written(self):
        self.assert_patch_is_disabled_and_unchanged({'status': 'active'}, 'status')

    def test_subscription_delete_is_disabled(self):
        response = self.client.delete(self.url, secure=True)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(TenantSubscription.objects.filter(pk=self.subscription.pk).exists())

    def test_subscription_create_and_replace_are_disabled(self):
        list_url = '/api/v1/tenant-subscriptions/'
        create_response = self.client.post(
            list_url,
            {'tenant': self.subscription.tenant_id, 'status': 'active'},
            format='json',
            secure=True,
        )
        replace_response = self.client.put(
            self.url,
            {'status': 'active'},
            format='json',
            secure=True,
        )
        self.assertEqual(create_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(replace_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_legitimate_read_access_is_preserved(self):
        response = self.client.get(self.url, secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'trialing')


class SubscriptionPermissionPrimitiveTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='permission-user')
        self.plan = SubscriptionPlan.objects.create(
            code='permission-plan',
            name='Permission Plan',
        )
        self.tenant = Tenant.objects.create(name='Permission Tenant', owner=self.user)
        TenantMembership.objects.create(
            tenant=self.tenant,
            user=self.user,
            role='owner',
        )
        TenantSubscription.objects.create(
            tenant=self.tenant,
            plan=self.plan,
            status='suspended',
        )
        self.factory = APIRequestFactory()
        self.view = SimpleNamespace(
            get_subscription_tenant=lambda request, obj=None: self.tenant,
        )

    @override_settings(SUBSCRIPTION_ENFORCEMENT_MODE='observe')
    def test_observe_mode_logs_would_block_but_allows_write(self):
        request = self.factory.post('/api/v1/future-operational-write/', {})
        request.user = self.user
        with self.assertLogs('myappLubd.subscription_permissions', level='WARNING') as logs:
            allowed = SubscriptionWritePermission().has_permission(request, self.view)
        self.assertTrue(allowed)
        record = logs.records[0]
        self.assertTrue(record.would_block)
        self.assertEqual(record.tenant_id, self.tenant.tenant_id)
        self.assertEqual(record.subscription_status, 'suspended')
        self.assertEqual(record.entitlement_level, EntitlementLevel.READ_ONLY.value)
        self.assertEqual(record.reason_code, 'subscription_suspended')
        self.assertEqual(record.request_method, 'POST')
        self.assertEqual(record.request_path, '/api/v1/future-operational-write/')
        self.assertEqual(record.user_id, self.user.pk)

    @override_settings(SUBSCRIPTION_ENFORCEMENT_MODE='unexpected')
    def test_invalid_enforcement_mode_falls_back_to_off(self):
        self.assertEqual(get_subscription_enforcement_mode(), 'off')

    @override_settings(SUBSCRIPTION_ENFORCEMENT_MODE='enforce')
    def test_enforce_mode_primitive_rejects_write_in_isolation(self):
        request = self.factory.patch('/api/v1/future-operational-write/', {})
        request.user = self.user
        with self.assertLogs('myappLubd.subscription_permissions', level='WARNING'):
            allowed = SubscriptionWritePermission().has_permission(request, self.view)
        self.assertFalse(allowed)

    @override_settings(SUBSCRIPTION_ENFORCEMENT_MODE='enforce')
    def test_enforce_mode_rejects_opted_in_unresolved_tenant(self):
        request = self.factory.post('/api/v1/future-unresolved-write/', {})
        request.user = self.user
        unresolved_view = SimpleNamespace(
            get_subscription_tenant=lambda request, obj=None: None,
        )
        with self.assertLogs('myappLubd.subscription_permissions', level='WARNING'):
            allowed = SubscriptionWritePermission().has_permission(request, unresolved_view)
        self.assertFalse(allowed)

    @override_settings(SUBSCRIPTION_ENFORCEMENT_MODE='enforce')
    def test_get_remains_readable_for_read_only_entitlement(self):
        request = self.factory.get('/api/v1/future-operational-read/')
        request.user = self.user
        self.assertTrue(
            SubscriptionWritePermission().has_permission(request, self.view),
        )


class TenantSubscriptionAdminHardeningTests(TestCase):
    def setUp(self):
        self.admin = TenantSubscriptionAdmin(TenantSubscription, admin.site)
        self.factory = APIRequestFactory()
        self.staff_user = User.objects.create_user(username='billing-staff', is_staff=True)
        self.superuser = User.objects.create_superuser(
            username='billing-platform-admin',
            email='billing-platform-admin@example.com',
            password='test-password',
        )

    def request_for(self, user):
        request = self.factory.get('/admin/myappLubd/tenantsubscription/')
        request.user = user
        return request

    def test_non_superuser_cannot_mutate_subscription_admin(self):
        request = self.request_for(self.staff_user)
        self.assertFalse(self.admin.has_add_permission(request))
        self.assertFalse(self.admin.has_change_permission(request))
        self.assertFalse(self.admin.has_delete_permission(request))
        readonly = self.admin.get_readonly_fields(request)
        self.assertIn('status', readonly)
        self.assertIn('external_customer_id', readonly)
        self.assertIn('external_subscription_id', readonly)
        self.assertIn('grace_period_ends_at', readonly)

    def test_superuser_retains_platform_recovery_authority(self):
        request = self.request_for(self.superuser)
        self.assertTrue(self.admin.has_add_permission(request))
        self.assertTrue(self.admin.has_change_permission(request))
        self.assertTrue(self.admin.has_delete_permission(request))
        self.assertNotIn('status', self.admin.get_readonly_fields(request))
