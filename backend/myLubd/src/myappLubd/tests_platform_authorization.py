from types import SimpleNamespace

from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient, APIRequestFactory

from .admin import PlatformMembershipAdmin
from .models import PlatformMembership, Tenant, TenantMembership, TenantSubscription, SubscriptionPlan, UserProfile
from .platform_authorization import (
    ALL_PLATFORM_CAPABILITIES,
    PlatformCapability,
    get_platform_capabilities,
    get_platform_roles,
    user_has_platform_capability,
)
from .platform_permissions import HasPlatformCapability
from .tenancy import get_billing_tenants, get_operable_properties, user_can_access_billing


User = get_user_model()


class PlatformAuthorizationTests(TestCase):
    def setUp(self):
        self.tenant_a = Tenant.objects.create(name='Platform Authorization Tenant A')
        self.tenant_b = Tenant.objects.create(name='Platform Authorization Tenant B')
        self.plan = SubscriptionPlan.objects.create(code='platform-auth-plan', name='Platform Auth')
        TenantSubscription.objects.create(tenant=self.tenant_a, plan=self.plan, status='active')
        TenantSubscription.objects.create(tenant=self.tenant_b, plan=self.plan, status='active')

        self.tenant_admin_a = User.objects.create_user(username='platform-tenant-admin-a')
        self.tenant_admin_b = User.objects.create_user(username='platform-tenant-admin-b')
        self.tenant_manager = User.objects.create_user(username='platform-tenant-manager')
        self.staff_only = User.objects.create_user(username='platform-staff-only', is_staff=True)
        self.billing_admin = User.objects.create_user(username='platform-billing-admin')
        self.support = User.objects.create_user(username='platform-support')
        self.platform_super_admin = User.objects.create_user(username='platform-super-admin')
        self.inactive_platform_user = User.objects.create_user(username='platform-inactive')
        self.multi_role_user = User.objects.create_user(username='platform-multi-role')
        self.break_glass = User.objects.create_superuser(
            username='platform-break-glass', email='break-glass@example.test', password='safe-test-password',
        )

        TenantMembership.objects.create(tenant=self.tenant_a, user=self.tenant_admin_a, role='admin')
        TenantMembership.objects.create(tenant=self.tenant_b, user=self.tenant_admin_b, role='admin')
        TenantMembership.objects.create(tenant=self.tenant_a, user=self.tenant_manager, role='manager')
        PlatformMembership.objects.create(
            user=self.billing_admin, role=PlatformMembership.ROLE_PLATFORM_BILLING_ADMIN,
        )
        PlatformMembership.objects.create(
            user=self.support, role=PlatformMembership.ROLE_PLATFORM_SUPPORT,
        )
        PlatformMembership.objects.create(
            user=self.platform_super_admin, role=PlatformMembership.ROLE_PLATFORM_SUPER_ADMIN,
        )
        PlatformMembership.objects.create(
            user=self.inactive_platform_user,
            role=PlatformMembership.ROLE_PLATFORM_BILLING_ADMIN,
            is_active=False,
        )
        PlatformMembership.objects.create(
            user=self.multi_role_user, role=PlatformMembership.ROLE_PLATFORM_BILLING_ADMIN,
        )
        PlatformMembership.objects.create(
            user=self.multi_role_user, role=PlatformMembership.ROLE_PLATFORM_SUPPORT,
        )

    def test_tenant_memberships_do_not_grant_platform_capabilities(self):
        for user in (self.tenant_admin_a, self.tenant_admin_b, self.tenant_manager):
            self.assertEqual(get_platform_roles(user), frozenset())
            self.assertEqual(get_platform_capabilities(user), frozenset())

    def test_platform_billing_admin_capabilities_and_no_operational_escalation(self):
        self.assertTrue(user_has_platform_capability(self.billing_admin, PlatformCapability.BILLING_READ))
        self.assertTrue(user_has_platform_capability(self.billing_admin, PlatformCapability.TENANTS_READ))
        self.assertTrue(user_has_platform_capability(self.billing_admin, PlatformCapability.USAGE_READ))
        self.assertTrue(user_has_platform_capability(self.billing_admin, PlatformCapability.BILLING_DIAGNOSTICS_READ))
        self.assertFalse(user_has_platform_capability(self.billing_admin, PlatformCapability.ROLES_MANAGE))
        self.assertFalse(get_operable_properties(self.billing_admin).exists())
        # Platform authority does not alter existing tenant billing endpoints.
        self.assertFalse(get_billing_tenants(self.billing_admin).exists())

    def test_support_is_limited_and_has_no_operational_escalation(self):
        self.assertTrue(user_has_platform_capability(self.support, PlatformCapability.SUPPORT_READ))
        self.assertTrue(user_has_platform_capability(self.support, PlatformCapability.BILLING_DIAGNOSTICS_READ))
        self.assertFalse(user_has_platform_capability(self.support, PlatformCapability.BILLING_READ))
        self.assertFalse(user_has_platform_capability(self.support, PlatformCapability.ROLES_MANAGE))
        self.assertFalse(get_operable_properties(self.support).exists())

    def test_platform_super_admin_is_not_a_tenant_member(self):
        self.assertEqual(get_platform_capabilities(self.platform_super_admin), ALL_PLATFORM_CAPABILITIES)
        self.assertFalse(get_billing_tenants(self.platform_super_admin).exists())
        self.assertFalse(get_operable_properties(self.platform_super_admin).exists())

    def test_staff_only_and_inactive_platform_membership_are_denied(self):
        for user in (self.staff_only, self.inactive_platform_user):
            self.assertEqual(get_platform_capabilities(user), frozenset())
            self.assertFalse(user_has_platform_capability(user, PlatformCapability.TENANTS_READ))

    def test_multiple_platform_roles_union_capabilities(self):
        capabilities = get_platform_capabilities(self.multi_role_user)
        self.assertIn(PlatformCapability.BILLING_READ, capabilities)
        self.assertIn(PlatformCapability.SUPPORT_READ, capabilities)
        self.assertNotIn(PlatformCapability.ROLES_MANAGE, capabilities)

    def test_superuser_retains_explicit_break_glass_capabilities(self):
        self.assertEqual(get_platform_capabilities(self.break_glass), ALL_PLATFORM_CAPABILITIES)
        self.assertTrue(user_has_platform_capability(self.break_glass, PlatformCapability.ROLES_MANAGE))

    def test_existing_tenant_billing_scope_is_unchanged(self):
        self.assertTrue(user_can_access_billing(self.tenant_admin_a, self.tenant_a))
        self.assertFalse(user_can_access_billing(self.tenant_admin_a, self.tenant_b))
        self.assertTrue(user_can_access_billing(self.tenant_admin_b, self.tenant_b))
        self.assertFalse(user_can_access_billing(self.tenant_admin_b, self.tenant_a))
        self.assertFalse(user_has_platform_capability(self.tenant_admin_a, PlatformCapability.BILLING_READ))

    def test_platform_drf_permission_requires_a_declared_capability(self):
        permission = HasPlatformCapability()
        request_factory = APIRequestFactory()
        request = request_factory.get('/api/v1/platform/future-resource/')
        request.user = self.billing_admin
        self.assertTrue(permission.has_permission(
            request, SimpleNamespace(platform_capability=PlatformCapability.BILLING_READ),
        ))
        self.assertFalse(permission.has_permission(request, SimpleNamespace()))
        request.user = self.tenant_admin_a
        self.assertFalse(permission.has_permission(
            request, SimpleNamespace(platform_capability=PlatformCapability.BILLING_READ),
        ))

    def test_profile_projection_is_safe_and_backwards_compatible(self):
        UserProfile.objects.get_or_create(user=self.billing_admin)
        client = APIClient()
        client.force_authenticate(user=self.billing_admin)
        response = client.get('/api/v1/user-profiles/me/', secure=True, HTTP_HOST='localhost')
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.data
        self.assertEqual(payload['platform_roles'], [PlatformMembership.ROLE_PLATFORM_BILLING_ADMIN])
        self.assertIn(PlatformCapability.BILLING_READ, payload['platform_capabilities'])
        self.assertTrue(payload['is_platform_user'])
        self.assertFalse(payload['is_platform_superuser'])
        self.assertNotIn('external_customer_id', payload)

    def test_platform_membership_admin_is_superuser_only_and_records_grantor(self):
        model_admin = PlatformMembershipAdmin(PlatformMembership, AdminSite())
        self.assertFalse(model_admin.has_module_permission(SimpleNamespace(user=self.staff_only)))
        self.assertTrue(model_admin.has_module_permission(SimpleNamespace(user=self.break_glass)))
        membership = PlatformMembership(
            user=self.staff_only, role=PlatformMembership.ROLE_PLATFORM_SUPPORT,
        )
        model_admin.save_model(
            SimpleNamespace(user=self.break_glass), membership, form=None, change=False,
        )
        self.assertEqual(membership.granted_by, self.break_glass)
