"""Tests for the unauthenticated guest-maintenance-request endpoint.

The endpoint is reachable without a session, so the safety properties to
verify are:
  - Bad/cross-tenant property+room combos are rejected (404).
  - A valid scan creates exactly one Job in the right property, attributed
    to a staff member who actually belongs to that property.
  - Description is required.
  - Per-IP throttle kicks in after the configured limit."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import Job, Property, Room, Tenant, TenantMembership


User = get_user_model()


class PublicJobRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.engineer = User.objects.create_user(username='eng', password='pw12345!')
        tenant = Tenant.objects.create(name='Public Request Tenant A')
        self.prop = Property.objects.create(name='Hotel A', tenant=tenant)
        TenantMembership.objects.create(user=self.engineer, tenant=tenant, role='technician').properties.add(self.prop)

        self.room = Room.objects.create(name='201', room_type='Suite', property=self.prop)

        # A second property with its own room — used to confirm cross-tenant
        # combinations are rejected.
        other_tenant = Tenant.objects.create(name='Public Request Tenant B')
        self.other = Property.objects.create(name='Hotel B', tenant=other_tenant)
        self.other_user = User.objects.create_user(username='eng2', password='pw12345!')
        TenantMembership.objects.create(user=self.other_user, tenant=other_tenant, role='technician').properties.add(self.other)
        self.other_room = Room.objects.create(
            name='B-1', room_type='Standard', property=self.other,
        )

    def _post(self, property_key, room_key, **payload):
        return self.client.post(
            f'/api/v1/public/job-requests/{property_key}/{room_key}/',
            payload,
            format='json',
        )

    def test_successful_submission_creates_job(self):
        resp = self._post(
            self.prop.property_id,
            self.room.room_id,
            description='AC is leaking near the window.',
            guest_name='Alice',
            guest_contact='alice@example.com',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.data['property'], 'Hotel A')
        self.assertEqual(resp.data['room'], '201')

        job = Job.objects.get(job_id=resp.data['job_id'])
        self.assertEqual(job.user, self.engineer)
        self.assertEqual(job.property_id, self.prop.id)
        self.assertEqual(job.status, 'pending')
        self.assertIn(self.room, job.rooms.all())
        self.assertIn('Alice', job.remarks)
        self.assertIn('alice@example.com', job.remarks)
        self.assertIn('guest', job.remarks)

    def test_description_required(self):
        resp = self._post(self.prop.property_id, self.room.room_id, description='   ')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Job.objects.exists())

    def test_unknown_property_returns_404(self):
        resp = self._post('P_DOES_NOT_EXIST', self.room.room_id, description='AC broken.')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_room_not_in_property_is_rejected(self):
        # Room belongs to `other`, not `prop` — must be a 404 not a 200.
        resp = self._post(
            self.prop.property_id,
            self.other_room.room_id,
            description='Wrong-property attempt.',
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Job.objects.exists())

    def test_rate_limit_kicks_in(self):
        # Limit is 15/hour per IP. Submit 15 — all should succeed; the 16th
        # should be rejected with 429.
        for i in range(15):
            resp = self._post(
                self.prop.property_id,
                self.room.room_id,
                description=f'Test {i}',
            )
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

        resp = self._post(self.prop.property_id, self.room.room_id, description='Over the limit')
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_numeric_room_lookup(self):
        # The endpoint accepts numeric IDs too.
        resp = self._post(
            str(self.prop.id),
            str(self.room.room_id),
            description='Numeric lookup works.',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
