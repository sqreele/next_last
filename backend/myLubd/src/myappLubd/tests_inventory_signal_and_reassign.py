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

from .models import Inventory, Job, Property, Room


User = get_user_model()


class InventoryLowStockSignalTests(TestCase):
    def setUp(self):
        cache.clear()
        self.engineer = User.objects.create_user(username='eng', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel A')
        self.prop.users.add(self.engineer)

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


class JobReassignTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.alice = User.objects.create_user(username='alice', password='pw12345!')
        self.bob = User.objects.create_user(username='bob', password='pw12345!')
        self.outsider = User.objects.create_user(username='outsider', password='pw12345!')

        self.prop = Property.objects.create(name='Hotel R')
        self.prop.users.add(self.alice, self.bob)

        self.other_prop = Property.objects.create(name='Hotel Other')
        self.other_prop.users.add(self.outsider)

        self.room = Room.objects.create(name='R-101', room_type='Standard')
        self.room.properties.add(self.prop)

        self.job = Job.objects.create(
            user=self.alice,
            description='Leaking faucet',
            remarks='',
            status='pending',
            priority='medium',
        )
        self.job.rooms.set([self.room])

    def _login(self, user):
        self.client.force_authenticate(user=user)

    def test_reassign_to_teammate_updates_assignee_and_remarks(self):
        self._login(self.alice)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.bob.id, 'note': 'Bob is closer to the floor.'},
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

    def test_reassign_to_outsider_property_is_forbidden(self):
        self._login(self.alice)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.outsider.id},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.job.refresh_from_db()
        self.assertEqual(self.job.user, self.alice)

    def test_reassign_missing_user_returns_404(self):
        self._login(self.alice)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': 99999},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_reassign_to_current_assignee_is_rejected(self):
        self._login(self.alice)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': self.alice.id},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reassign_accepts_username_lookup(self):
        self._login(self.alice)
        resp = self.client.post(
            f'/api/v1/jobs/{self.job.job_id}/reassign/',
            {'user_id': 'bob'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.job.refresh_from_db()
        self.assertEqual(self.job.user, self.bob)
