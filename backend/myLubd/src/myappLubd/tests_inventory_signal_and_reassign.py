"""Tests for the inventory low-stock signal and the new job reassign action.

Both pathways fire push notifications. We don't want the tests to fail on
boxes without VAPID keys configured, so they assert on database state /
response shape rather than push delivery. push.send_push_to_user already
no-ops gracefully when VAPID env is missing."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from unittest.mock import patch

from .models import Inventory, Job, Property, Room, Tenant, TenantMembership


User = get_user_model()


class InventoryLowStockSignalTests(TestCase):
    def setUp(self):
        cache.clear()
        self.engineer = User.objects.create_user(username='eng', password='pw12345!')
        tenant = Tenant.objects.create(name='Inventory Signal Tenant')
        self.prop = Property.objects.create(name='Hotel A', tenant=tenant)
        TenantMembership.objects.create(user=self.engineer, tenant=tenant, role='technician').properties.add(self.prop)

    def _make_item(self, *, quantity=50, min_quantity=10):
        return Inventory.objects.create(
            name='LED bulb',
            quantity=quantity,
            min_quantity=min_quantity,
            unit='pcs',
            property=self.prop,
            status='available',
        )

    def test_drop_into_low_stock_sets_status(self):
        item = self._make_item(quantity=50, min_quantity=10)
        item.quantity = 5
        item.save()
        item.refresh_from_db()
        self.assertEqual(item.status, 'low_stock')

    def test_drop_to_zero_marks_out_of_stock(self):
        item = self._make_item(quantity=50, min_quantity=10)
        item.quantity = 0
        item.save()
        item.refresh_from_db()
        self.assertEqual(item.status, 'out_of_stock')

    def test_refill_back_above_min_clears_low_stock(self):
        item = self._make_item(quantity=5, min_quantity=10)
        item.refresh_from_db()
        self.assertIn(item.status, ('low_stock', 'available'))
        item.quantity = 50
        item.save()
        item.refresh_from_db()
        self.assertEqual(item.status, 'available')

    def test_signal_deduplicates_within_window(self):
        # First save flipping into low_stock seeds the cache; a second save
        # while still low_stock must not re-emit (the cache key blocks it).
        item = self._make_item(quantity=50, min_quantity=10)
        item.quantity = 5
        item.save()
        dedupe_key = f'pcms:inv-low-stock:{item.pk}:low_stock'
        self.assertEqual(cache.get(dedupe_key), 1)

        # Force the cache to look fresh-on-save by clearing it; the signal
        # should reseed only when the transition actually happens.
        cache.delete(dedupe_key)
        item.quantity = 4  # still low_stock, no transition
        item.save()
        self.assertIsNone(cache.get(dedupe_key), 'Signal must not push when status stayed the same.')

    @patch('myappLubd.signals.send_push_to_user')
    def test_low_stock_recipients_follow_canonical_memberships(self, send_push):
        manager = User.objects.create_user(username='inventory-manager', password='pw12345!')
        scoped_elsewhere = User.objects.create_user(username='inventory-other', password='pw12345!')
        inactive = User.objects.create_user(username='inventory-inactive', password='pw12345!')
        TenantMembership.objects.create(
            user=manager, tenant=self.prop.tenant, role='manager'
        )
        other_property = Property.objects.create(name='Hotel B', tenant=self.prop.tenant)
        TenantMembership.objects.create(
            user=scoped_elsewhere, tenant=self.prop.tenant, role='technician'
        ).properties.add(other_property)
        inactive_membership = TenantMembership.objects.create(
            user=inactive, tenant=self.prop.tenant, role='technician', is_active=False
        )
        inactive_membership.properties.add(self.prop)

        item = self._make_item(quantity=50, min_quantity=10)
        item.quantity = 5
        item.save()

        recipients = {call.args[0] for call in send_push.call_args_list}
        self.assertEqual(recipients, {self.engineer, manager})


class JobReassignTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.alice = User.objects.create_user(username='alice', password='pw12345!')
        self.bob = User.objects.create_user(username='bob', password='pw12345!')
        self.manager = User.objects.create_user(username='manager', password='pw12345!')
        self.outsider = User.objects.create_user(username='outsider', password='pw12345!')

        tenant = Tenant.objects.create(name='Inventory Reassign Tenant')
        other_tenant = Tenant.objects.create(name='Inventory Other Tenant')
        self.prop = Property.objects.create(name='Hotel R', tenant=tenant)
        for user in (self.alice, self.bob):
            TenantMembership.objects.create(user=user, tenant=tenant, role='technician').properties.add(self.prop)
        TenantMembership.objects.create(user=self.manager, tenant=tenant, role='manager')
        self.other_prop = Property.objects.create(name='Hotel Other', tenant=other_tenant)
        TenantMembership.objects.create(user=self.outsider, tenant=other_tenant, role='technician').properties.add(self.other_prop)

        self.room = Room.objects.create(name='R-101', room_type='Standard', property=self.prop)

        self.job = Job.objects.create(
            user=self.alice,
            property=self.prop,
            description='Leaking faucet',
            remarks='',
            status='pending',
            priority='medium',
        )
        self.job.rooms.set([self.room])

    def _login(self, user):
        self.client.force_authenticate(user=user)

    def _make_actor(self, role, *, tenant=None, properties=()):
        actor = User.objects.create_user(
            username=f'actor-{role}-{User.objects.count()}',
            password='pw12345!',
        )
        membership = TenantMembership.objects.create(
            user=actor,
            tenant=tenant or self.prop.tenant,
            role=role,
        )
        if properties:
            membership.properties.add(*properties)
        return actor

    def _reassign_to_bob(self, actor):
        self._login(actor)
        return self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.bob.id, 'property_id': self.prop.property_id},
            format='json',
        )

    def test_manager_can_reassign_and_updates_assignee_and_remarks(self):
        self._login(self.manager)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {
                'user_id': self.bob.id,
                'property_id': self.prop.property_id,
                'note': 'Bob is closer to the floor.',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(resp.data['assignee'], 'bob')

        self.job.refresh_from_db()
        self.assertEqual(self.job.user, self.bob)
        self.assertIn('reassigned', self.job.remarks)
        self.assertIn('alice', self.job.remarks)
        self.assertIn('bob', self.job.remarks)
        self.assertIn('Bob is closer', self.job.remarks)

    def test_owner_can_reassign(self):
        response = self._reassign_to_bob(self._make_actor('owner'))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    def test_admin_can_reassign(self):
        response = self._reassign_to_bob(self._make_actor('admin'))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    def test_supervisor_with_job_property_grant_can_reassign(self):
        supervisor = self._make_actor('supervisor', properties=(self.prop,))
        response = self._reassign_to_bob(supervisor)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    def test_supervisor_without_job_property_grant_cannot_reassign(self):
        other_property = Property.objects.create(
            name='Same Tenant Supervisor Property',
            tenant=self.prop.tenant,
        )
        supervisor = self._make_actor('supervisor', properties=(other_property,))
        response = self._reassign_to_bob(supervisor)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

    def test_technician_cannot_enumerate_or_reassign(self):
        self._login(self.alice)
        detail = self.client.get(f'/api/v1/jobs/{self.job.job_id}/')
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        self.assertTrue(detail.data['can_operate'])
        self.assertFalse(detail.data['can_assign'])

        candidates = self.client.get(
            f'/api/v1/jobs/{self.job.job_id}/assignment-candidates/',
            {'property_id': self.prop.property_id},
        )
        self.assertEqual(candidates.status_code, status.HTTP_403_FORBIDDEN)
        response = self._reassign_to_bob(self.alice)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

    def test_reassign_to_outsider_property_is_forbidden(self):
        self._login(self.manager)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.outsider.id, 'property_id': self.prop.property_id},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.job.refresh_from_db()
        self.assertEqual(self.job.user, self.alice)

    def test_reassign_missing_user_does_not_disclose_directory_membership(self):
        self._login(self.manager)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': 99999, 'property_id': self.prop.property_id},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_reassign_to_current_assignee_is_rejected(self):
        self._login(self.manager)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.alice.id, 'property_id': self.prop.property_id},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reassign_accepts_username_lookup(self):
        self._login(self.manager)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': 'bob', 'property_id': self.prop.property_id},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.job.refresh_from_db()
        self.assertEqual(self.job.user, self.bob)

    def test_job_detail_supplies_assignee_property_and_assignment_capability(self):
        self.alice.first_name = 'Alice'
        self.alice.last_name = 'Engineer'
        self.alice.save(update_fields=['first_name', 'last_name'])

        self._login(self.manager)
        resp = self.client.get(f'/api/v1/jobs/{self.job.job_id}/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(resp.data['property_id'], self.prop.property_id)
        self.assertTrue(resp.data['can_operate'])
        self.assertTrue(resp.data['can_assign'])
        self.assertEqual(resp.data['user']['id'], self.alice.id)
        self.assertEqual(resp.data['user']['full_name'], 'Alice Engineer')

    def test_viewer_can_read_job_but_cannot_enumerate_or_reassign(self):
        viewer = User.objects.create_user(username='viewer', password='pw12345!')
        TenantMembership.objects.create(
            user=viewer,
            tenant=self.prop.tenant,
            role='viewer',
        ).properties.add(self.prop)
        self._login(viewer)

        detail = self.client.get(f'/api/v1/jobs/{self.job.job_id}/')
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        self.assertFalse(detail.data['can_operate'])
        self.assertFalse(detail.data['can_assign'])

        candidates = self.client.get(
            f'/api/v1/jobs/{self.job.job_id}/assignment-candidates/',
            {'property_id': self.prop.property_id},
        )
        self.assertEqual(candidates.status_code, status.HTTP_403_FORBIDDEN)

        mutation = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.bob.id, 'property_id': self.prop.property_id},
            format='json',
        )
        self.assertEqual(mutation.status_code, status.HTTP_403_FORBIDDEN)
        self.job.refresh_from_db()
        self.assertEqual(self.job.user, self.alice)

    def test_billing_can_read_job_but_has_no_assignment_capability(self):
        billing = User.objects.create_user(username='billing', password='pw12345!')
        TenantMembership.objects.create(
            user=billing,
            tenant=self.prop.tenant,
            role='billing',
        ).properties.add(self.prop)
        self._login(billing)

        detail = self.client.get(f'/api/v1/jobs/{self.job.job_id}/')
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        self.assertFalse(detail.data['can_operate'])
        self.assertFalse(detail.data['can_assign'])

        mutation = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.bob.id, 'property_id': self.prop.property_id},
            format='json',
        )
        self.assertEqual(mutation.status_code, status.HTTP_403_FORBIDDEN)

    def test_role_assignment_capabilities_follow_reassign_policy(self):
        expected_by_role = {
            'owner': (True, True),
            'admin': (True, True),
            'manager': (True, True),
            'supervisor': (True, True),
            'technician': (True, False),
            'viewer': (False, False),
            'billing': (False, False),
        }
        for role, (can_operate, can_assign) in expected_by_role.items():
            with self.subTest(role=role):
                user = User.objects.create_user(
                    username=f'role-{role}',
                    password='pw12345!',
                )
                membership = TenantMembership.objects.create(
                    user=user,
                    tenant=self.prop.tenant,
                    role=role,
                )
                if role in {'supervisor', 'technician', 'viewer', 'billing'}:
                    membership.properties.add(self.prop)
                self._login(user)

                detail = self.client.get(f'/api/v1/jobs/{self.job.job_id}/')

                self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
                self.assertEqual(detail.data['can_operate'], can_operate)
                self.assertEqual(detail.data['can_assign'], can_assign)

        superuser = User.objects.create_superuser(
            username='role-superuser',
            password='pw12345!',
        )
        self._login(superuser)
        detail = self.client.get(f'/api/v1/jobs/{self.job.job_id}/')
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        self.assertTrue(detail.data['can_operate'])
        self.assertTrue(detail.data['can_assign'])

    def test_assignment_candidates_are_active_operator_members_of_same_property(self):
        supervisor = User.objects.create_user(username='supervisor', password='pw12345!')
        TenantMembership.objects.create(
            user=supervisor,
            tenant=self.prop.tenant,
            role='supervisor',
        ).properties.add(self.prop)
        viewer = User.objects.create_user(username='candidate-viewer', password='pw12345!')
        TenantMembership.objects.create(
            user=viewer,
            tenant=self.prop.tenant,
            role='viewer',
        ).properties.add(self.prop)
        other_property = Property.objects.create(name='Same Tenant Other', tenant=self.prop.tenant)
        cross_property_operator = User.objects.create_user(
            username='cross-property', password='pw12345!'
        )
        TenantMembership.objects.create(
            user=cross_property_operator,
            tenant=self.prop.tenant,
            role='technician',
        ).properties.add(other_property)
        inactive_membership_user = User.objects.create_user(
            username='inactive-membership', password='pw12345!'
        )
        TenantMembership.objects.create(
            user=inactive_membership_user,
            tenant=self.prop.tenant,
            role='technician',
            is_active=False,
        ).properties.add(self.prop)

        self._login(self.manager)
        resp = self.client.get(
            f'/api/v1/jobs/{self.job.job_id}/assignment-candidates/',
            {'property_id': self.prop.property_id},
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        usernames = {candidate['username'] for candidate in resp.data}
        self.assertEqual(usernames, {'alice', 'bob', 'manager', 'supervisor'})

    def test_assignment_rejects_ineligible_same_property_role(self):
        viewer = User.objects.create_user(username='target-viewer', password='pw12345!')
        TenantMembership.objects.create(
            user=viewer,
            tenant=self.prop.tenant,
            role='viewer',
        ).properties.add(self.prop)
        self._login(self.manager)

        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': viewer.id, 'property_id': self.prop.property_id},
            format='json',
        )

        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.job.refresh_from_db()
        self.assertEqual(self.job.user, self.alice)

    def test_assignment_requires_matching_external_active_property(self):
        other_property = Property.objects.create(name='Wrong Active Property', tenant=self.prop.tenant)
        self._login(self.manager)

        missing = self.client.get(
            f'/api/v1/jobs/{self.job.job_id}/assignment-candidates/'
        )
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)

        mismatch = self.client.get(
            f'/api/v1/jobs/{self.job.job_id}/assignment-candidates/',
            {'property_id': other_property.property_id},
        )
        self.assertEqual(mismatch.status_code, status.HTTP_400_BAD_REQUEST)

        mutation_mismatch = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.bob.id, 'property_id': other_property.property_id},
            format='json',
        )
        self.assertEqual(mutation_mismatch.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cross_tenant_supervisor_cannot_reassign(self):
        supervisor = self._make_actor(
            'supervisor',
            tenant=self.other_prop.tenant,
            properties=(self.other_prop,),
        )
        response = self._reassign_to_bob(supervisor)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

    def test_supervisor_cannot_assign_cross_tenant_target(self):
        supervisor = self._make_actor('supervisor', properties=(self.prop,))
        self._login(supervisor)
        response = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.outsider.id, 'property_id': self.prop.property_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

    def test_supervisor_cannot_assign_target_without_job_property_access(self):
        other_property = Property.objects.create(
            name='Same Tenant Target Property',
            tenant=self.prop.tenant,
        )
        target = User.objects.create_user(username='other-property-target', password='pw12345!')
        TenantMembership.objects.create(
            user=target,
            tenant=self.prop.tenant,
            role='technician',
        ).properties.add(other_property)
        supervisor = self._make_actor('supervisor', properties=(self.prop,))
        self._login(supervisor)

        response = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': target.id, 'property_id': self.prop.property_id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

    def test_unauthorized_property_job_remains_hidden(self):
        self._login(self.outsider)
        resp = self.client.get(f'/api/v1/jobs/{self.job.job_id}/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
