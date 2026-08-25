"""Focused P1.6 targeted rate-limiting regressions."""

import json
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import caches
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase, APIRequestFactory

from .models import Job, JobImage, Property, Tenant, TenantMembership
from .throttles import (
    JobAssignmentThrottle,
    MembershipAdminThrottle,
    PublicJobRequestThrottle,
)
from .views import JobViewSet


User = get_user_model()
TEST_REST_FRAMEWORK = {
    **settings.REST_FRAMEWORK,
    'DEFAULT_THROTTLE_RATES': {
        **settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],
        'auth_credential': '2/min',
        'password_recovery': '2/min',
        'membership_admin': '2/min',
        'job_assignment': '2/min',
        'protected_media_user': '2/min',
        'protected_media_probe': '2/min',
        'bulk_operation': '2/min',
        'media_upload': '2/min',
        'expensive_export': '2/min',
        'privileged_admin': '2/min',
        'public_job_request': '2/hour',
    },
}
TEST_CACHES = {
    **settings.CACHES,
    'throttle': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'p1-6-focused-tests',
        'TIMEOUT': 300,
    },
}


@override_settings(
    CACHES=TEST_CACHES,
    REST_FRAMEWORK=TEST_REST_FRAMEWORK,
    THROTTLE_CACHE_ALIAS='throttle',
    SECURE_SSL_REDIRECT=False,
)
class RateLimitingTests(APITestCase):
    def setUp(self):
        caches['throttle'].clear()
        self.owner = User.objects.create_user(username='limit-owner')
        self.second_owner = User.objects.create_user(username='limit-owner-two')
        self.target = User.objects.create_user(username='limit-target')
        self.outsider = User.objects.create_user(username='limit-outsider')

        self.tenant = Tenant.objects.create(name='Limit Tenant')
        self.other_tenant = Tenant.objects.create(name='Other Limit Tenant')
        self.property_a = Property.objects.create(name='Limit Property', tenant=self.tenant)
        self.other_property = Property.objects.create(
            name='Other Limit Property', tenant=self.other_tenant,
        )
        TenantMembership.objects.create(user=self.owner, tenant=self.tenant, role='owner')
        TenantMembership.objects.create(
            user=self.second_owner, tenant=self.other_tenant, role='owner',
        )
        self.target_membership = TenantMembership.objects.create(
            user=self.target, tenant=self.tenant, role='technician',
        )
        self.target_membership.properties.add(self.property_a)
        outsider_membership = TenantMembership.objects.create(
            user=self.outsider, tenant=self.other_tenant, role='technician',
        )
        outsider_membership.properties.add(self.other_property)

    def tearDown(self):
        caches['throttle'].clear()
        super().tearDown()

    def _membership_url(self):
        return reverse(
            'myappLubd:tenant-membership-detail',
            kwargs={'pk': self.target_membership.pk},
        )

    def test_membership_mutation_is_allowed_then_returns_429_with_retry_after(self):
        self.client.force_authenticate(self.owner)
        for _ in range(2):
            response = self.client.patch(
                self._membership_url(), {'role': 'technician'}, format='json', secure=True,
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        response = self.client.patch(
            self._membership_url(), {'role': 'technician'}, format='json', secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertGreaterEqual(int(response['Retry-After']), 1)
        self.assertNotIn('security-throttle', response.content.decode())

    def test_property_grant_mutation_uses_membership_admin_scope(self):
        self.client.force_authenticate(self.owner)
        payload = {'properties': [self.property_a.pk]}
        self.assertEqual(self.client.patch(self._membership_url(), payload, format='json').status_code, 200)
        self.assertEqual(self.client.patch(self._membership_url(), payload, format='json').status_code, 200)
        self.assertEqual(self.client.patch(self._membership_url(), payload, format='json').status_code, 429)

    def test_authenticated_buckets_are_separate_across_users_and_tenants(self):
        factory = APIRequestFactory()
        for _ in range(2):
            request = factory.patch('/api/v1/tenant-memberships/1/')
            request.user = self.owner
            self.assertTrue(MembershipAdminThrottle().allow_request(request, object()))
        denied = factory.patch('/api/v1/tenant-memberships/1/')
        denied.user = self.owner
        self.assertFalse(MembershipAdminThrottle().allow_request(denied, object()))

        separate = factory.patch('/api/v1/tenant-memberships/2/')
        separate.user = self.second_owner
        self.assertTrue(MembershipAdminThrottle().allow_request(separate, object()))

    def test_job_reassignment_is_targeted_without_throttling_job_detail(self):
        job = Job.objects.create(
            user=self.owner, property=self.property_a, description='limited reassignment',
        )
        detail_url = reverse('myappLubd:job-detail', kwargs={'job_id': job.job_id})
        reassign_url = reverse('myappLubd:job-reassign', kwargs={'job_id': job.job_id})
        self.client.force_authenticate(self.owner)
        for target in (self.target, self.owner):
            response = self.client.post(
                reassign_url,
                {'user_id': target.pk, 'property_id': self.property_a.property_id},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(
            self.client.post(
                reassign_url,
                {'user_id': self.target.pk, 'property_id': self.property_a.property_id},
                format='json',
            ).status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
        for _ in range(3):
            self.assertEqual(self.client.get(detail_url).status_code, status.HTTP_200_OK)

    def test_authenticated_protected_media_denial_stays_hidden_until_limited(self):
        job = Job.objects.create(
            user=self.owner, property=self.property_a, description='hidden media',
        )
        image = JobImage.objects.create(
            job=job, uploaded_by=self.owner, image='maintenance_job_images/hidden.jpg',
        )
        url = reverse('myappLubd:protected-media', kwargs={
            'media_type': 'job-image', 'object_id': image.pk, 'variant': 'image',
        })
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(url).status_code, 404)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 429)
        body = response.content.decode()
        self.assertNotIn('hidden.jpg', body)
        self.assertNotIn('target_id', body)
        self.assertNotIn('job-image', body)

    def test_anonymous_probe_uses_remote_addr_and_ignores_spoofed_forwarding(self):
        url = reverse('myappLubd:protected-media', kwargs={
            'media_type': 'job-image', 'object_id': 999999, 'variant': 'image',
        })
        first = self.client.get(
            url, REMOTE_ADDR='198.51.100.10', HTTP_X_FORWARDED_FOR='203.0.113.1',
        )
        second = self.client.get(
            url, REMOTE_ADDR='198.51.100.10', HTTP_X_FORWARDED_FOR='203.0.113.2',
        )
        denied = self.client.get(
            url, REMOTE_ADDR='198.51.100.10', HTTP_X_FORWARDED_FOR='203.0.113.3',
        )
        separate = self.client.get(
            url, REMOTE_ADDR='198.51.100.11', HTTP_X_FORWARDED_FOR='203.0.113.3',
        )
        self.assertEqual((first.status_code, second.status_code), (403, 403))
        self.assertEqual(denied.status_code, 429)
        self.assertEqual(separate.status_code, 403)

    def test_public_job_request_throttle_always_uses_network_identity(self):
        factory = APIRequestFactory()
        for forwarded in ('203.0.113.1', '203.0.113.2'):
            request = factory.post(
                '/api/v1/public/job-requests/P1/1/',
                REMOTE_ADDR='198.51.100.60',
                HTTP_X_FORWARDED_FOR=forwarded,
            )
            request.user = self.owner
            self.assertTrue(PublicJobRequestThrottle().allow_request(request, object()))

        denied = factory.post(
            '/api/v1/public/job-requests/P1/1/',
            REMOTE_ADDR='198.51.100.60',
            HTTP_X_FORWARDED_FOR='203.0.113.3',
        )
        denied.user = self.second_owner
        self.assertFalse(PublicJobRequestThrottle().allow_request(denied, object()))

    def test_x_real_ip_is_accepted_only_from_trusted_proxy_peers(self):
        url = reverse('myappLubd:protected-media', kwargs={
            'media_type': 'job-image', 'object_id': 999999, 'variant': 'image',
        })
        # A public socket peer cannot select a new bucket with X-Real-IP.
        for claimed_ip in ('203.0.113.1', '203.0.113.2'):
            self.assertEqual(self.client.get(
                url, REMOTE_ADDR='198.51.100.30', HTTP_X_REAL_IP=claimed_ip,
            ).status_code, 403)
        self.assertEqual(self.client.get(
            url, REMOTE_ADDR='198.51.100.30', HTTP_X_REAL_IP='203.0.113.3',
        ).status_code, 429)

        caches['throttle'].clear()
        # Nginx/Next peers on the isolated Docker network may forward the
        # Nginx-sanitized client address, keeping real clients separate.
        for _ in range(2):
            self.assertEqual(self.client.get(
                url, REMOTE_ADDR='172.20.0.5', HTTP_X_REAL_IP='203.0.113.10',
            ).status_code, 403)
        self.assertEqual(self.client.get(
            url, REMOTE_ADDR='172.20.0.5', HTTP_X_REAL_IP='203.0.113.10',
        ).status_code, 429)
        self.assertEqual(self.client.get(
            url, REMOTE_ADDR='172.20.0.5', HTTP_X_REAL_IP='203.0.113.11',
        ).status_code, 403)

    def test_bulk_import_is_limited_but_ordinary_room_reads_are_not(self):
        self.client.force_authenticate(self.owner)
        url = reverse('myappLubd:room-bulk-import')
        for expected in (400, 400, 429):
            self.assertEqual(self.client.post(url, {}, format='json').status_code, expected)
        list_url = reverse('myappLubd:room-list')
        for _ in range(3):
            self.assertEqual(self.client.get(list_url).status_code, 200)

    def test_rate_limit_denial_is_audited_without_request_secrets(self):
        secret = 'synthetic-password-and-token-value'
        url = reverse('myappLubd:login')
        for _ in range(2):
            self.client.post(
                url, {'username': 'missing', 'password': secret}, format='json',
                REMOTE_ADDR='192.0.2.10', HTTP_COOKIE=f'sessionid={secret}',
            )
        with self.assertLogs('security.audit', level='INFO') as captured:
            response = self.client.post(
                url, {'username': 'missing', 'password': secret}, format='json',
                REMOTE_ADDR='192.0.2.10', HTTP_COOKIE=f'sessionid={secret}',
            )
        self.assertEqual(response.status_code, 429)
        records = [json.loads(record.getMessage()) for record in captured.records]
        event = records[-1]
        self.assertEqual(event['event'], 'security.rate_limit.exceeded')
        self.assertEqual(event['outcome'], 'denied')
        self.assertEqual(event['reason_code'], 'rate_limited')
        self.assertEqual(event['throttle_scope'], 'auth_credential')
        self.assertNotIn(secret, '\n'.join(record.getMessage() for record in captured.records))

    def test_fixed_window_resets_and_accepts_requests_again(self):
        factory = APIRequestFactory()
        request = factory.post('/api/v1/jobs/JOB-1/reassign/')
        request.user = self.owner
        with patch('myappLubd.throttles.SecurityRateThrottle.timer', side_effect=[1000, 1001, 1002, 1061]):
            self.assertTrue(JobAssignmentThrottle().allow_request(request, object()))
            self.assertTrue(JobAssignmentThrottle().allow_request(request, object()))
            self.assertFalse(JobAssignmentThrottle().allow_request(request, object()))
            self.assertTrue(JobAssignmentThrottle().allow_request(request, object()))

    @override_settings(THROTTLE_CACHE_ALIAS='missing-security-cache')
    def test_throttle_backend_failure_fails_closed_and_is_audited(self):
        request = APIRequestFactory().post('/api/v1/tenant-memberships/')
        request.user = self.owner
        with self.assertLogs('security.audit', level='INFO') as captured:
            allowed = MembershipAdminThrottle().allow_request(request, object())

        self.assertFalse(allowed)
        event = json.loads(captured.records[-1].getMessage())
        self.assertEqual(event['event'], 'security.rate_limit.exceeded')
        self.assertEqual(event['throttle_scope'], 'membership_admin')

    def test_action_mapping_has_no_blanket_viewset_throttle(self):
        view = JobViewSet()
        view.action = 'retrieve'
        self.assertEqual(view.get_throttles(), [])
        view.action = 'reassign'
        self.assertIsInstance(view.get_throttles()[0], JobAssignmentThrottle)
