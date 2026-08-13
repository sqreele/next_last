"""Tests for the unauthenticated guest-maintenance-request endpoint.

The endpoint is reachable without a session, so the safety properties to
verify are:
  - Bad/cross-tenant property+room combos are rejected (404).
  - A valid scan creates exactly one Job in the right property, attributed
    to a staff member who actually belongs to that property.
  - Description is required.
  - Per-IP throttle kicks in after the configured limit.
  - One immutable client request identity creates at most one Job."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections
from django.test import TestCase, TransactionTestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import (
    GuestReportRateLimit,
    GuestReportSubmission,
    Job,
    Property,
    Room,
    Tenant,
)


User = get_user_model()


class PublicJobRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.engineer = User.objects.create_user(username='eng', password='pw12345!')
        self.tenant = Tenant.objects.create(name='Guest Tenant A', owner=self.engineer)
        self.prop = Property.objects.create(name='Hotel A', tenant=self.tenant)
        self.prop.users.add(self.engineer)

        self.room = Room.objects.create(name='201', room_type='Suite')
        self.room.properties.add(self.prop)

        # A second property with its own room — used to confirm cross-tenant
        # combinations are rejected.
        self.other_user = User.objects.create_user(username='eng2', password='pw12345!')
        self.other_tenant = Tenant.objects.create(name='Guest Tenant B', owner=self.other_user)
        self.other = Property.objects.create(name='Hotel B', tenant=self.other_tenant)
        self.other.users.add(self.other_user)
        self.other_room = Room.objects.create(name='B-1', room_type='Standard')
        self.other_room.properties.add(self.other)

    def _post(self, property_key, room_key, request_meta=None, **payload):
        payload.setdefault('client_request_id', str(uuid4()))
        return self.client.post(
            f'/api/v1/public/job-requests/{property_key}/{room_key}/',
            payload,
            format='json',
            **(request_meta or {}),
        )

    def test_successful_submission_creates_job(self):
        request_id = str(uuid4())
        resp = self._post(
            self.prop.property_id,
            self.room.room_id,
            client_request_id=request_id,
            description='AC is leaking near the window.',
            guest_name='Alice',
            guest_contact='alice@example.com',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.data['property'], 'Hotel A')
        self.assertEqual(resp.data['room'], '201')

        job = Job.objects.get(job_id=resp.data['job_id'])
        self.assertEqual(job.user, self.engineer)
        self.assertEqual(job.status, 'pending')
        self.assertIn(self.room, job.rooms.all())
        self.assertIn('Alice', job.remarks)
        self.assertIn('alice@example.com', job.remarks)
        self.assertIn('guest', job.remarks)
        submission = GuestReportSubmission.objects.get(job=job)
        self.assertEqual(str(submission.request_id), request_id)
        self.assertEqual(submission.property_id_snapshot, self.prop.pk)
        self.assertEqual(submission.room_id_snapshot, self.room.pk)
        self.assertEqual(submission.tenant_id_snapshot, self.tenant.pk)

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

    def test_request_id_is_required_and_must_be_a_uuid(self):
        endpoint = (
            f'/api/v1/public/job-requests/{self.prop.property_id}/'
            f'{self.room.room_id}/'
        )
        missing = self.client.post(endpoint, {'description': 'No identity'}, format='json')
        malformed = self.client.post(
            endpoint,
            {'client_request_id': 'not-a-uuid', 'description': 'Bad identity'},
            format='json',
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(malformed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Job.objects.exists())
        self.assertFalse(GuestReportRateLimit.objects.exists())

    def test_lost_response_replay_with_same_request_id_creates_one_job(self):
        request_id = str(uuid4())
        payload = {
            'client_request_id': request_id,
            'description': 'AC is leaking near the window.',
            'guest_name': 'Alice',
            'guest_contact': 'alice@example.com',
        }

        initial = self._post(self.prop.property_id, self.room.room_id, **payload)
        replay = self._post(self.prop.property_id, self.room.room_id, **payload)

        self.assertEqual(initial.status_code, status.HTTP_201_CREATED, initial.content)
        self.assertEqual(replay.status_code, status.HTTP_200_OK, replay.content)
        self.assertEqual(replay.data['job_id'], initial.data['job_id'])
        self.assertEqual(Job.objects.count(), 1)
        self.assertEqual(GuestReportSubmission.objects.count(), 1)
        self.assertEqual(GuestReportRateLimit.objects.get().count, 1)

    def test_same_request_id_with_different_payload_is_rejected(self):
        request_id = str(uuid4())
        initial = self._post(
            self.prop.property_id,
            self.room.room_id,
            client_request_id=request_id,
            description='Original report',
        )
        conflict = self._post(
            self.prop.property_id,
            self.room.room_id,
            client_request_id=request_id,
            description='Changed report',
        )

        self.assertEqual(initial.status_code, status.HTTP_201_CREATED)
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            conflict.data,
            {'error': 'Request identity is already bound to a different submission.'},
        )
        self.assertEqual(Job.objects.count(), 1)
        self.assertEqual(GuestReportRateLimit.objects.get().count, 1)

    def test_same_request_id_cannot_cross_property_or_tenant_or_leak_job(self):
        request_id = str(uuid4())
        initial = self._post(
            self.prop.property_id,
            self.room.room_id,
            client_request_id=request_id,
            description='Original report',
        )
        conflict = self._post(
            self.other.property_id,
            self.other_room.room_id,
            client_request_id=request_id,
            description='Original report',
        )

        self.assertEqual(initial.status_code, status.HTTP_201_CREATED)
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            conflict.data,
            {'error': 'Request identity is already bound to a different submission.'},
        )
        self.assertNotIn(initial.data['job_id'], str(conflict.data))
        self.assertNotIn(self.prop.name, str(conflict.data))
        self.assertEqual(Job.objects.count(), 1)
        self.assertFalse(Job.objects.filter(rooms=self.other_room).exists())

    def test_payload_property_id_cannot_rehome_report(self):
        response = self._post(
            self.prop.property_id,
            self.room.room_id,
            description='Route property remains authoritative',
            property_id=self.other.property_id,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        job = Job.objects.get(job_id=response.data['job_id'])
        self.assertEqual(list(job.rooms.all()), [self.room])
        self.assertFalse(job.rooms.filter(properties=self.other).exists())

    def test_idempotent_replays_do_not_consume_additional_rate_slots(self):
        request_id = str(uuid4())
        initial = self._post(
            self.prop.property_id,
            self.room.room_id,
            client_request_id=request_id,
            description='Retry-safe report',
        )
        self.assertEqual(initial.status_code, status.HTTP_201_CREATED)

        for _ in range(5):
            replay = self._post(
                self.prop.property_id,
                self.room.room_id,
                client_request_id=request_id,
                description='Retry-safe report',
            )
            self.assertEqual(replay.status_code, status.HTTP_200_OK)

        for index in range(14):
            accepted = self._post(
                self.prop.property_id,
                self.room.room_id,
                description=f'Distinct report {index}',
            )
            self.assertEqual(accepted.status_code, status.HTTP_201_CREATED)

        limited = self._post(
            self.prop.property_id,
            self.room.room_id,
            description='One over the distinct request limit',
        )
        self.assertEqual(limited.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(Job.objects.count(), 15)
        self.assertEqual(GuestReportRateLimit.objects.get().count, 15)

    def test_rate_limit_uses_proxy_authoritative_ip_not_spoofable_xff_prefix(self):
        for index in range(15):
            accepted = self._post(
                self.prop.property_id,
                self.room.room_id,
                description=f'Report behind proxy {index}',
                request_meta={
                    'HTTP_X_REAL_IP': '203.0.113.20',
                    'HTTP_X_FORWARDED_FOR': f'198.51.100.{index}, 203.0.113.20',
                },
            )
            self.assertEqual(accepted.status_code, status.HTTP_201_CREATED)

        limited = self._post(
            self.prop.property_id,
            self.room.room_id,
            description='Spoofed prefix cannot bypass the limit',
            request_meta={
                'HTTP_X_REAL_IP': '203.0.113.20',
                'HTTP_X_FORWARDED_FOR': '192.0.2.250, 203.0.113.20',
            },
        )

        self.assertEqual(limited.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(Job.objects.count(), 15)
        self.assertEqual(GuestReportRateLimit.objects.count(), 1)
        self.assertEqual(GuestReportRateLimit.objects.get().count, 15)


class PublicJobRequestConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.engineer = User.objects.create_user(username='guest-racer', password='pw12345!')
        self.tenant = Tenant.objects.create(name='Guest Concurrency Tenant', owner=self.engineer)
        self.prop = Property.objects.create(name='Guest Concurrency Hotel', tenant=self.tenant)
        self.prop.users.add(self.engineer)
        self.room = Room.objects.create(name='GC-101', room_type='Suite')
        self.room.properties.add(self.prop)
        self.endpoint = (
            f'/api/v1/public/job-requests/{self.prop.property_id}/'
            f'{self.room.room_id}/'
        )

    def _concurrent_post(self, barrier, payload):
        close_old_connections()
        try:
            client = APIClient()
            barrier.wait(timeout=10)
            response = client.post(
                self.endpoint,
                payload,
                format='json',
                REMOTE_ADDR='198.51.100.42',
            )
            return response.status_code, response.data
        finally:
            connections.close_all()

    def test_concurrent_same_request_id_creates_one_job(self):
        barrier = Barrier(2)
        payload = {
            'client_request_id': str(uuid4()),
            'description': 'One logical concurrent guest report',
        }

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(
                lambda _: self._concurrent_post(barrier, payload),
                range(2),
            ))

        self.assertEqual(sorted(code for code, _ in results), [200, 201])
        self.assertEqual(len({body['job_id'] for _, body in results}), 1)
        self.assertEqual(Job.objects.count(), 1)
        self.assertEqual(GuestReportSubmission.objects.count(), 1)
        self.assertEqual(GuestReportRateLimit.objects.get().count, 1)

    def test_concurrent_distinct_requests_cannot_bypass_rate_limit(self):
        request_count = 16
        barrier = Barrier(request_count)
        payloads = [
            {
                'client_request_id': str(uuid4()),
                'description': f'Concurrent distinct report {index}',
            }
            for index in range(request_count)
        ]

        with ThreadPoolExecutor(max_workers=request_count) as executor:
            results = list(executor.map(
                lambda payload: self._concurrent_post(barrier, payload),
                payloads,
            ))

        codes = [code for code, _ in results]
        self.assertEqual(codes.count(status.HTTP_201_CREATED), 15)
        self.assertEqual(codes.count(status.HTTP_429_TOO_MANY_REQUESTS), 1)
        self.assertEqual(Job.objects.count(), 15)
        self.assertEqual(GuestReportSubmission.objects.count(), 15)
        self.assertEqual(GuestReportRateLimit.objects.get().count, 15)
