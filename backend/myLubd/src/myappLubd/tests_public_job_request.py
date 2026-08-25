"""Tests for the unauthenticated guest-maintenance-request endpoint.

The endpoint is reachable without a session, so the safety properties to
verify are:
  - Bad/cross-tenant property+room combos are rejected (404).
  - A valid scan creates exactly one Job in the right property, attributed
    to a staff member who actually belongs to that property.
  - Description is required.
  - Per-IP throttle kicks in after the configured limit."""

import json

from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.cache import caches
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from .models import Job, Property, Room, Tenant, TenantMembership


User = get_user_model()
TEST_REST_FRAMEWORK = {
    **settings.REST_FRAMEWORK,
    'DEFAULT_THROTTLE_RATES': {
        **settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],
        'public_job_request': '2/hour',
    },
}
TEST_CACHES = {
    **settings.CACHES,
    'throttle': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'public-job-request-focused-tests',
        'TIMEOUT': 300,
    },
}


@override_settings(
    CACHES=TEST_CACHES,
    REST_FRAMEWORK=TEST_REST_FRAMEWORK,
    THROTTLE_CACHE_ALIAS='throttle',
    SECURE_SSL_REDIRECT=False,
)
class PublicJobRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        caches['throttle'].clear()
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

    def tearDown(self):
        caches['throttle'].clear()
        super().tearDown()

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
        # Production is 15/hour; this focused test overrides it to 2/hour.
        for i in range(2):
            resp = self._post(
                self.prop.property_id,
                self.room.room_id,
                description=f'Test {i}',
            )
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

        resp = self._post(self.prop.property_id, self.room.room_id, description='Over the limit')
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertGreaterEqual(int(resp['Retry-After']), 1)
        self.assertNotIn('security-throttle', resp.content.decode())

    def test_rotating_x_forwarded_for_cannot_bypass_limit(self):
        statuses = []
        for index, claimed_ip in enumerate(('1.1.1.1', '2.2.2.2', '3.3.3.3')):
            response = self.client.post(
                f'/api/v1/public/job-requests/{self.prop.property_id}/{self.room.room_id}/',
                {'description': f'Forwarded spoof {index}'},
                format='json',
                REMOTE_ADDR='198.51.100.70',
                HTTP_X_FORWARDED_FOR=claimed_ip,
            )
            statuses.append(response.status_code)
        self.assertEqual(statuses, [201, 201, 429])

    def test_untrusted_peer_cannot_select_bucket_with_x_real_ip(self):
        for claimed_ip in ('203.0.113.1', '203.0.113.2'):
            response = self.client.post(
                f'/api/v1/public/job-requests/{self.prop.property_id}/{self.room.room_id}/',
                {'description': 'Untrusted X-Real-IP'},
                format='json',
                REMOTE_ADDR='198.51.100.71',
                HTTP_X_REAL_IP=claimed_ip,
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        denied = self.client.post(
            f'/api/v1/public/job-requests/{self.prop.property_id}/{self.room.room_id}/',
            {'description': 'Still the peer bucket'},
            format='json',
            REMOTE_ADDR='198.51.100.71',
            HTTP_X_REAL_IP='203.0.113.3',
        )
        self.assertEqual(denied.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_trusted_proxy_uses_sanitized_x_real_ip_and_separates_clients(self):
        url = f'/api/v1/public/job-requests/{self.prop.property_id}/{self.room.room_id}/'
        for _ in range(2):
            self.assertEqual(self.client.post(
                url, {'description': 'Trusted client one'}, format='json',
                REMOTE_ADDR='172.20.0.5', HTTP_X_REAL_IP='203.0.113.10',
            ).status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.client.post(
            url, {'description': 'Trusted client one limited'}, format='json',
            REMOTE_ADDR='172.20.0.5', HTTP_X_REAL_IP='203.0.113.10',
        ).status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(self.client.post(
            url, {'description': 'Trusted client two'}, format='json',
            REMOTE_ADDR='172.20.0.5', HTTP_X_REAL_IP='203.0.113.11',
        ).status_code, status.HTTP_201_CREATED)

    def test_rate_limit_denial_is_audited_without_headers_or_secrets(self):
        url = f'/api/v1/public/job-requests/{self.prop.property_id}/{self.room.room_id}/'
        secret = 'do-not-log-this-forwarded-secret'
        for index in range(2):
            self.client.post(
                url, {'description': f'Audit setup {index}'}, format='json',
                REMOTE_ADDR='198.51.100.72', HTTP_X_FORWARDED_FOR=secret,
            )
        with self.assertLogs('security.audit', level='INFO') as captured:
            response = self.client.post(
                url, {'description': 'Audit denial'}, format='json',
                REMOTE_ADDR='198.51.100.72', HTTP_X_FORWARDED_FOR=secret,
            )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        event = json.loads(captured.records[-1].getMessage())
        self.assertEqual(event['event'], 'security.rate_limit.exceeded')
        self.assertEqual(event['outcome'], 'denied')
        self.assertEqual(event['reason_code'], 'rate_limited')
        self.assertEqual(event['throttle_scope'], 'public_job_request')
        self.assertEqual(event['request_method'], 'POST')
        self.assertEqual(event['request_path'], url)
        self.assertNotIn(secret, '\n'.join(record.getMessage() for record in captured.records))

    def test_numeric_room_lookup(self):
        # The endpoint accepts numeric IDs too.
        resp = self._post(
            str(self.prop.id),
            str(self.room.room_id),
            description='Numeric lookup works.',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
