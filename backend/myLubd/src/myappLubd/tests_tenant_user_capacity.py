from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from types import SimpleNamespace
import threading

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.management.base import CommandError
from django.db import close_old_connections, connections
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .admin import TenantMembershipAdmin
from .invitations import accept_invitation, create_invitation
from .management.commands.migrate_tenantless_properties import Command as MigrationCommand
from .models import (
    AuthIdentity,
    Property,
    SubscriptionPlan,
    Tenant,
    TenantInvitation,
    TenantMembership,
    TenantSubscription,
)
from .tenancy import (
    SubscriptionUserLimitReached,
    enforce_tenant_user_limit,
    get_tenant_user_capacity,
)


User = get_user_model()
ISSUER = 'https://tenant.auth0.com/'


class TenantUserCapacityTests(TestCase):
    def setUp(self):
        self.plans = {
            'starter': SubscriptionPlan.objects.create(
                code='starter', name='Starter', max_users=3,
            ),
            'pro': SubscriptionPlan.objects.create(
                code='pro', name='Pro', max_users=5,
            ),
            'enterprise': SubscriptionPlan.objects.create(
                code='enterprise', name='Enterprise', max_users=20,
            ),
        }
        self.sequence = 0

    def make_tenant(self, code, active_count=0, inactive_count=0):
        self.sequence += 1
        tenant = Tenant.objects.create(name=f'{code}-{self.sequence}')
        TenantSubscription.objects.create(
            tenant=tenant, plan=self.plans[code], status='active',
        )
        for index in range(active_count + inactive_count):
            user = User.objects.create_user(
                username=f'{code}-{self.sequence}-user-{index}',
            )
            TenantMembership.objects.create(
                tenant=tenant,
                user=user,
                role='technician',
                is_active=index < active_count,
            )
        return tenant

    def test_commercial_plan_capacity_boundaries(self):
        cases = (
            ('starter', 0, True, 3),
            ('starter', 2, True, 1),
            ('starter', 3, False, 0),
            ('starter', 4, False, 0),
            ('pro', 4, True, 1),
            ('pro', 5, False, 0),
            ('enterprise', 19, True, 1),
            ('enterprise', 20, False, 0),
        )
        for code, count, expected, remaining in cases:
            with self.subTest(plan=code, count=count):
                tenant = self.make_tenant(code, active_count=count)
                capacity = get_tenant_user_capacity(tenant)
                self.assertEqual(capacity.current_count, count)
                self.assertEqual(capacity.limit, self.plans[code].max_users)
                self.assertEqual(capacity.remaining, remaining)
                self.assertEqual(capacity.can_add, expected)
                self.assertEqual(capacity.plan_id, self.plans[code].pk)
                self.assertEqual(capacity.plan_code, code)

    def test_over_limit_state_is_preserved_and_addition_is_blocked(self):
        tenant = self.make_tenant('starter', active_count=4)
        membership_ids = list(TenantMembership.objects.filter(
            tenant=tenant, is_active=True,
        ).values_list('pk', flat=True))

        with self.assertRaises(SubscriptionUserLimitReached):
            enforce_tenant_user_limit(tenant)

        self.assertEqual(list(TenantMembership.objects.filter(
            tenant=tenant, is_active=True,
        ).values_list('pk', flat=True)), membership_ids)

    def test_inactive_memberships_and_pending_invitations_are_excluded(self):
        tenant = self.make_tenant('starter', active_count=2, inactive_count=4)
        global_user = User.objects.create_user(
            username='global-identity-only', email='global@example.com',
        )
        AuthIdentity.objects.create(
            user=global_user, issuer=ISSUER, subject='auth0|global-only',
        )
        invitation = TenantInvitation(
            tenant=tenant,
            email='pending@example.com',
            role='manager',
            expires_at=timezone.now() + timedelta(days=1),
        )
        invitation.issue_token()
        invitation.save()

        capacity = get_tenant_user_capacity(tenant)

        self.assertEqual(capacity.current_count, 2)
        self.assertTrue(capacity.can_add)
        self.assertEqual(TenantInvitation.objects.filter(tenant=tenant).count(), 1)

    def test_tenant_without_subscription_fails_closed(self):
        tenant = Tenant.objects.create(name='No subscription')

        with self.assertRaisesMessage(
            PermissionDenied,
            'This tenant does not have a subscription.',
        ):
            get_tenant_user_capacity(tenant)

    def test_zero_limit_is_a_finite_zero_capacity(self):
        plan = SubscriptionPlan.objects.create(code='zero', name='Zero', max_users=0)
        tenant = Tenant.objects.create(name='Zero tenant')
        TenantSubscription.objects.create(tenant=tenant, plan=plan, status='active')

        capacity = get_tenant_user_capacity(tenant)

        self.assertEqual(capacity.limit, 0)
        self.assertEqual(capacity.remaining, 0)
        self.assertFalse(capacity.can_add)

    def test_exact_tenant_isolation(self):
        full = self.make_tenant('starter', active_count=3)
        available = self.make_tenant('starter', active_count=2)

        self.assertFalse(get_tenant_user_capacity(full).can_add)
        self.assertTrue(get_tenant_user_capacity(available).can_add)


@override_settings(SECURE_SSL_REDIRECT=False)
class TenantMembershipCapacityApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username='capacity-owner')
        self.plan = SubscriptionPlan.objects.create(
            code='starter', name='Starter', max_users=3,
        )
        self.sequence = 0

    def make_tenant(self, name, active_others=0, inactive_others=0):
        tenant = Tenant.objects.create(name=name, owner=self.owner)
        TenantSubscription.objects.create(tenant=tenant, plan=self.plan, status='active')
        TenantMembership.objects.create(tenant=tenant, user=self.owner, role='owner')
        active = []
        inactive = []
        for is_active, count, target in (
            (True, active_others, active),
            (False, inactive_others, inactive),
        ):
            for _ in range(count):
                self.sequence += 1
                user = User.objects.create_user(username=f'capacity-user-{self.sequence}')
                target.append(TenantMembership.objects.create(
                    tenant=tenant,
                    user=user,
                    role='technician',
                    is_active=is_active,
                ))
        return tenant, active, inactive

    def post_membership(self, tenant, user):
        return self.client.post('/api/v1/tenant-memberships/', {
            'tenant': tenant.pk,
            'user_id': user.pk,
            'role': 'technician',
            'is_active': True,
        }, format='json')

    def test_direct_post_below_limit_succeeds_and_at_limit_fails(self):
        self.client.force_authenticate(self.owner)
        available, _, _ = self.make_tenant('Available', active_others=1)
        full, _, _ = self.make_tenant('Full', active_others=2)
        allowed_user = User.objects.create_user(username='allowed-post-user')
        blocked_user = User.objects.create_user(username='blocked-post-user')

        allowed = self.post_membership(available, allowed_user)
        blocked = self.post_membership(full, blocked_user)

        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED, allowed.data)
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT, blocked.data)
        self.assertEqual(blocked.data, {
            'code': 'subscription_user_limit_reached',
            'detail': 'Your current plan allows up to 3 users.',
            'limit': 3,
        })
        self.assertIsInstance(blocked.data['limit'], int)

    def test_platform_superuser_does_not_bypass_capacity(self):
        platform_user = User.objects.create_superuser(
            username='capacity-platform-user', password='test-password',
        )
        self.client.force_authenticate(platform_user)
        full, _, _ = self.make_tenant('Superuser full', active_others=2)
        incoming = User.objects.create_user(username='superuser-blocked-user')

        response = self.post_membership(full, incoming)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        self.assertFalse(TenantMembership.objects.filter(
            tenant=full, user=incoming,
        ).exists())

    def test_property_defensive_membership_creation_respects_capacity(self):
        platform_user = User.objects.create_superuser(
            username='property-capacity-platform', password='test-password',
        )
        self.client.force_authenticate(platform_user)
        full, _, _ = self.make_tenant('Property membership full', active_others=2)

        response = self.client.post('/api/v1/properties/', {
            'name': 'Must not be created',
            'tenant': full.pk,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        self.assertFalse(Property.objects.filter(name='Must not be created').exists())
        self.assertFalse(TenantMembership.objects.filter(
            tenant=full, user=platform_user,
        ).exists())

    def test_property_bulk_import_cannot_bypass_capacity(self):
        platform_user = User.objects.create_superuser(
            username='bulk-capacity-platform', password='test-password',
        )
        self.client.force_authenticate(platform_user)
        full, _, _ = self.make_tenant('Bulk membership full', active_others=2)
        full.owner = platform_user
        full.save(update_fields=['owner'])

        response = self.client.post('/api/v1/properties/bulk-import/', {
            'csv': 'name,property_id,description\nMust not import,,blocked',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        self.assertEqual(response.data, {
            'code': 'subscription_user_limit_reached',
            'detail': 'Your current plan allows up to 3 users.',
            'limit': 3,
        })
        self.assertFalse(Property.objects.filter(name='Must not import').exists())
        self.assertFalse(TenantMembership.objects.filter(
            tenant=full, user=platform_user,
        ).exists())

    def test_reactivation_below_limit_succeeds_and_at_limit_fails(self):
        self.client.force_authenticate(self.owner)
        available, _, available_inactive = self.make_tenant(
            'Reactivation available', active_others=1, inactive_others=1,
        )
        full, _, full_inactive = self.make_tenant(
            'Reactivation full', active_others=2, inactive_others=1,
        )

        allowed = self.client.patch(
            f'/api/v1/tenant-memberships/{available_inactive[0].pk}/',
            {'is_active': True}, format='json',
        )
        blocked = self.client.patch(
            f'/api/v1/tenant-memberships/{full_inactive[0].pk}/',
            {'is_active': True}, format='json',
        )

        self.assertEqual(allowed.status_code, status.HTTP_200_OK, allowed.data)
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT, blocked.data)
        full_inactive[0].refresh_from_db()
        self.assertFalse(full_inactive[0].is_active)

    def test_put_reactivation_at_limit_fails(self):
        self.client.force_authenticate(self.owner)
        full, _, inactive = self.make_tenant(
            'PUT reactivation full', active_others=2, inactive_others=1,
        )
        membership = inactive[0]

        response = self.client.put(
            f'/api/v1/tenant-memberships/{membership.pk}/',
            {
                'tenant': full.pk,
                'user_id': membership.user_id,
                'role': membership.role,
                'is_active': True,
                'properties': [],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        membership.refresh_from_db()
        self.assertFalse(membership.is_active)

    def test_move_into_full_tenant_fails_without_corrupting_source(self):
        self.client.force_authenticate(self.owner)
        source, source_members, _ = self.make_tenant('Move source', active_others=1)
        destination, _, _ = self.make_tenant('Move destination', active_others=2)
        moving = source_members[0]

        response = self.client.patch(
            f'/api/v1/tenant-memberships/{moving.pk}/',
            {'tenant': destination.pk}, format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        moving.refresh_from_db()
        self.assertEqual(moving.tenant_id, source.pk)
        self.assertTrue(moving.is_active)

    def test_role_and_property_edits_at_limit_do_not_consume_capacity(self):
        self.client.force_authenticate(self.owner)
        tenant, members, _ = self.make_tenant('Edit full', active_others=2)
        property_obj = Property.objects.create(name='Edit property', tenant=tenant)
        membership = members[0]

        response = self.client.patch(
            f'/api/v1/tenant-memberships/{membership.pk}/',
            {'role': 'viewer', 'properties': [property_obj.pk]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        membership.refresh_from_db()
        self.assertEqual(membership.role, 'viewer')
        self.assertEqual(list(membership.properties.values_list('pk', flat=True)), [property_obj.pk])
        self.assertEqual(TenantMembership.objects.filter(
            tenant=tenant, is_active=True,
        ).count(), 3)

    def test_downgrade_is_non_destructive_and_removal_restores_capacity(self):
        self.client.force_authenticate(self.owner)
        self.plan.max_users = 5
        self.plan.save(update_fields=['max_users'])
        tenant, members, _ = self.make_tenant('Downgrade', active_others=4)
        property_obj = Property.objects.create(name='Preserved property', tenant=tenant)
        members[0].properties.add(property_obj)
        original_ids = set(TenantMembership.objects.filter(
            tenant=tenant, is_active=True,
        ).values_list('pk', flat=True))

        self.plan.max_users = 3
        self.plan.save(update_fields=['max_users'])
        blocked_user = User.objects.create_user(username='downgrade-blocked')
        blocked = self.post_membership(tenant, blocked_user)

        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT, blocked.data)
        self.assertEqual(set(TenantMembership.objects.filter(
            tenant=tenant, is_active=True,
        ).values_list('pk', flat=True)), original_ids)
        self.assertEqual(list(members[0].properties.values_list('pk', flat=True)), [property_obj.pk])

        for membership in members[:3]:
            response = self.client.delete(
                f'/api/v1/tenant-memberships/{membership.pk}/'
            )
            self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(TenantMembership.objects.filter(
            tenant=tenant, is_active=True,
        ).count(), 2)

        restored_user = User.objects.create_user(username='downgrade-restored')
        restored = self.post_membership(tenant, restored_user)
        self.assertEqual(restored.status_code, status.HTTP_201_CREATED, restored.data)
        self.assertEqual(TenantMembership.objects.filter(
            tenant=tenant, is_active=True,
        ).count(), 3)


class TenantMembershipCapacityAdminTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='admin-capacity-owner')
        self.plan = SubscriptionPlan.objects.create(
            code='admin-capacity', name='Admin Capacity', max_users=2,
        )
        self.tenant = Tenant.objects.create(name='Admin capacity', owner=self.owner)
        TenantSubscription.objects.create(
            tenant=self.tenant, plan=self.plan, status='active',
        )
        TenantMembership.objects.create(
            tenant=self.tenant, user=self.owner, role='owner',
        )
        self.model_admin = TenantMembershipAdmin(TenantMembership, admin.site)
        self.request = SimpleNamespace(user=self.owner)
        self.form = SimpleNamespace()

    def test_admin_creation_below_limit_succeeds(self):
        user = User.objects.create_user(username='admin-capacity-created')
        membership = TenantMembership(
            tenant=self.tenant, user=user, role='technician', is_active=True,
        )

        self.model_admin.save_model(self.request, membership, self.form, change=False)

        self.assertTrue(TenantMembership.objects.filter(
            tenant=self.tenant, user=user, is_active=True,
        ).exists())

    def test_admin_creation_at_limit_is_blocked(self):
        active_user = User.objects.create_user(username='admin-capacity-full')
        TenantMembership.objects.create(
            tenant=self.tenant, user=active_user, role='technician',
        )
        incoming = User.objects.create_user(username='admin-capacity-blocked')
        membership = TenantMembership(
            tenant=self.tenant, user=incoming, role='technician', is_active=True,
        )

        with self.assertRaises(DjangoValidationError):
            self.model_admin.save_model(
                self.request, membership, self.form, change=False,
            )

        self.assertFalse(TenantMembership.objects.filter(
            tenant=self.tenant, user=incoming,
        ).exists())

    def test_admin_reactivation_at_limit_is_blocked(self):
        active_user = User.objects.create_user(username='admin-capacity-active')
        TenantMembership.objects.create(
            tenant=self.tenant, user=active_user, role='technician',
        )
        inactive_user = User.objects.create_user(username='admin-capacity-inactive')
        membership = TenantMembership.objects.create(
            tenant=self.tenant,
            user=inactive_user,
            role='technician',
            is_active=False,
        )
        membership.is_active = True

        with self.assertRaises(DjangoValidationError):
            self.model_admin.save_model(
                self.request, membership, self.form, change=True,
            )

        membership.refresh_from_db()
        self.assertFalse(membership.is_active)

    def test_admin_move_into_full_tenant_preserves_source(self):
        destination = Tenant.objects.create(name='Admin move destination')
        TenantSubscription.objects.create(
            tenant=destination, plan=self.plan, status='active',
        )
        for index in range(2):
            user = User.objects.create_user(username=f'admin-destination-{index}')
            TenantMembership.objects.create(
                tenant=destination, user=user, role='technician',
            )
        moving_user = User.objects.create_user(username='admin-moving-user')
        membership = TenantMembership.objects.create(
            tenant=self.tenant,
            user=moving_user,
            role='technician',
        )
        source_id = self.tenant.pk
        membership.tenant = destination

        with self.assertRaises(DjangoValidationError):
            self.model_admin.save_model(
                self.request, membership, self.form, change=True,
            )

        membership.refresh_from_db()
        self.assertEqual(membership.tenant_id, source_id)
        self.assertTrue(membership.is_active)


class TenantlessMigrationCapacityPolicyTests(TestCase):
    def test_migration_repair_fails_stably_before_capacity_mutation(self):
        plan = SubscriptionPlan.objects.create(
            code='migration-capacity', name='Migration Capacity', max_users=1,
        )
        tenant = Tenant.objects.create(name='Migration capacity')
        TenantSubscription.objects.create(tenant=tenant, plan=plan, status='active')
        existing = User.objects.create_user(username='migration-existing')
        TenantMembership.objects.create(tenant=tenant, user=existing, role='owner')
        incoming = User.objects.create_user(username='migration-incoming')
        mapping = {
            incoming.pk: {
                'approval_status': 'APPROVED',
            },
        }

        with self.assertRaisesMessage(
            CommandError,
            'subscription_user_limit_reached: Your current plan allows up to 1 users.',
        ):
            MigrationCommand._enforce_membership_capacity(
                mapping, {'property-id': tenant},
            )

        self.assertFalse(TenantMembership.objects.filter(
            tenant=tenant, user=incoming,
        ).exists())


@override_settings(
    AUTH0_CLAIM_NAMESPACE='https://staymaint.com',
    SECURE_SSL_REDIRECT=False,
)
class TenantUserCapacityConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.plan = SubscriptionPlan.objects.create(
            code='concurrency', name='Concurrency', max_users=3,
        )
        self.owner = User.objects.create_user(
            username='concurrency-owner', email='concurrency-owner@example.com',
        )
        self.tenant = Tenant.objects.create(name='Concurrency', owner=self.owner)
        TenantSubscription.objects.create(
            tenant=self.tenant, plan=self.plan, status='active',
        )
        TenantMembership.objects.create(
            tenant=self.tenant, user=self.owner, role='owner',
        )
        second = User.objects.create_user(username='concurrency-second')
        TenantMembership.objects.create(
            tenant=self.tenant, user=second, role='manager',
        )
        self.invitations = []
        for index in range(2):
            user = User.objects.create_user(
                username=f'concurrency-invitee-{index}',
                email=f'concurrency-{index}@example.com',
            )
            subject = f'auth0|concurrency-{index}'
            AuthIdentity.objects.create(user=user, issuer=ISSUER, subject=subject)
            _, token = create_invitation(
                tenant=self.tenant,
                email=user.email,
                role='manager',
                properties=[],
                invited_by=self.owner,
            )
            self.invitations.append((user.pk, subject, token))

    def test_two_simultaneous_acceptances_cannot_take_one_slot(self):
        barrier = threading.Barrier(2)

        def accept_one(values):
            close_old_connections()
            user_id, subject, token = values
            try:
                user = User.objects.get(pk=user_id)
                barrier.wait(timeout=10)
                accept_invitation(
                    token=token,
                    user=user,
                    identity_claims={
                        'iss': ISSUER,
                        'sub': subject,
                        'email': user.email,
                        'email_verified': True,
                    },
                )
                return 'accepted'
            except SubscriptionUserLimitReached:
                return 'capacity_blocked'
            finally:
                connections.close_all()

        connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(accept_one, self.invitations))

        self.assertCountEqual(results, ['accepted', 'capacity_blocked'])
        self.assertEqual(TenantMembership.objects.filter(
            tenant=self.tenant, is_active=True,
        ).count(), 3)
        self.assertEqual(TenantInvitation.objects.filter(
            tenant=self.tenant, accepted_at__isnull=False,
        ).count(), 1)
