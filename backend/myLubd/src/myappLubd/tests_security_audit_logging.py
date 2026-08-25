"""Focused P1.5 security audit logging regressions."""

import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase, APIRequestFactory

from .models import Job, JobImage, Property, Tenant, TenantMembership
from .security_audit import audit_event


User = get_user_model()


class SecurityAuditLoggingTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='audit-owner')
        self.billing = User.objects.create_user(username='audit-billing')
        self.target = User.objects.create_user(username='audit-target')
        self.outsider = User.objects.create_user(username='audit-outsider')

        self.tenant = Tenant.objects.create(name='Audit Tenant')
        self.other_tenant = Tenant.objects.create(name='Other Audit Tenant')
        self.property_a = Property.objects.create(name='Audit A', tenant=self.tenant)
        self.property_b = Property.objects.create(name='Audit B', tenant=self.tenant)
        self.other_property = Property.objects.create(name='Other Audit Property', tenant=self.other_tenant)

        self.owner_membership = TenantMembership.objects.create(
            user=self.owner, tenant=self.tenant, role='owner',
        )
        self.billing_membership = TenantMembership.objects.create(
            user=self.billing, tenant=self.tenant, role='billing',
        )
        self.target_membership = TenantMembership.objects.create(
            user=self.target, tenant=self.tenant, role='technician',
        )
        self.target_membership.properties.add(self.property_a)
        self.outsider_membership = TenantMembership.objects.create(
            user=self.outsider, tenant=self.other_tenant, role='technician',
        )
        self.outsider_membership.properties.add(self.other_property)

    @staticmethod
    def _records(captured):
        return [json.loads(record.getMessage()) for record in captured.records]

    def _membership_url(self, membership):
        return reverse('myappLubd:tenant-membership-detail', kwargs={'pk': membership.pk})

    def test_billing_self_promotion_is_denied_and_audited(self):
        self.client.force_authenticate(self.billing)
        with self.assertLogs('security.audit', level='INFO') as captured:
            response = self.client.patch(
                self._membership_url(self.billing_membership),
                {'role': 'owner'}, format='json', secure=True,
            )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.billing_membership.refresh_from_db()
        self.assertEqual(self.billing_membership.role, 'billing')
        event = self._records(captured)[0]
        self.assertEqual(event['event'], 'security.membership.mutation_denied')
        self.assertEqual(event['outcome'], 'denied')
        self.assertEqual(event['reason_code'], 'self_promotion_denied')
        self.assertEqual(event['actor_user_id'], self.billing.pk)
        self.assertEqual(event['target_user_id'], self.billing.pk)

    def test_cross_tenant_membership_mutation_remains_hidden_and_is_audited(self):
        self.client.force_authenticate(self.owner)
        with self.assertLogs('security.audit', level='INFO') as captured:
            response = self.client.patch(
                self._membership_url(self.outsider_membership),
                {'role': 'manager'}, format='json', secure=True,
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        event = self._records(captured)[0]
        self.assertEqual(event['event'], 'security.membership.mutation_denied')
        self.assertEqual(event['reason_code'], 'cross_tenant')
        self.assertEqual(event['target_id'], self.outsider_membership.pk)

    def test_denied_tenant_access_remains_hidden_and_is_audited(self):
        self.client.force_authenticate(self.owner)
        with self.assertLogs('security.audit', level='INFO') as captured:
            response = self.client.get(
                reverse('myappLubd:tenant-detail', kwargs={'pk': self.other_tenant.pk}),
                secure=True,
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        event = self._records(captured)[0]
        self.assertEqual(event['event'], 'security.authorization.denied')
        self.assertEqual(event['reason_code'], 'cross_tenant')
        self.assertEqual(event['target_type'], 'tenant')

    def test_role_change_and_deactivation_success_are_audited(self):
        self.client.force_authenticate(self.owner)
        with self.assertLogs('security.audit', level='INFO') as captured:
            response = self.client.patch(
                self._membership_url(self.target_membership),
                {'role': 'manager', 'is_active': False}, format='json', secure=True,
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        events = {item['event']: item for item in self._records(captured)}
        role_event = events['security.membership.role_changed']
        self.assertEqual((role_event['old_role'], role_event['new_role']), ('technician', 'manager'))
        self.assertEqual(role_event['target_user_id'], self.target.pk)
        active_event = events['security.membership.deactivated']
        self.assertEqual((active_event['old_is_active'], active_event['new_is_active']), (True, False))
        self.assertEqual(active_event['outcome'], 'allowed')

    def test_property_grant_change_success_has_added_and_removed_ids(self):
        self.client.force_authenticate(self.owner)
        with self.assertLogs('security.audit', level='INFO') as captured:
            response = self.client.patch(
                self._membership_url(self.target_membership),
                {'properties': [self.property_b.pk]}, format='json', secure=True,
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        event = self._records(captured)[0]
        self.assertEqual(event['event'], 'security.membership.property_grant_changed')
        self.assertEqual(event['added_property_ids'], [self.property_b.pk])
        self.assertEqual(event['removed_property_ids'], [self.property_a.pk])

    def test_denied_property_access_produces_audit_event(self):
        self.client.force_authenticate(self.target)
        with self.assertLogs('security.audit', level='INFO') as captured:
            response = self.client.get(reverse(
                'myappLubd:property-detail',
                kwargs={'property_id': self.property_b.property_id},
            ), secure=True)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        event = self._records(captured)[0]
        self.assertEqual(event['event'], 'security.authorization.denied')
        self.assertEqual(event['reason_code'], 'property_not_granted')
        self.assertEqual(event['property_id'], self.property_b.pk)

    def test_protected_media_cross_tenant_denial_is_audited(self):
        job = Job.objects.create(user=self.owner, property=self.property_a, description='audit media')
        image = JobImage.objects.create(
            job=job, uploaded_by=self.owner, image='maintenance_job_images/audit.jpg',
        )
        self.client.force_authenticate(self.outsider)
        url = reverse('myappLubd:protected-media', kwargs={
            'media_type': 'job-image', 'object_id': image.pk, 'variant': 'image',
        })
        with self.assertLogs('security.audit', level='INFO') as captured:
            response = self.client.get(url, secure=True)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        event = self._records(captured)[0]
        self.assertEqual(event['event'], 'security.protected_media.denied')
        self.assertEqual(event['reason_code'], 'cross_tenant')
        self.assertEqual(event['target_id'], image.pk)

    def test_audit_helper_never_reads_or_logs_request_secrets(self):
        sentinels = [
            'Bearer synthetic-jwt-token',
            'POSTGRES_PASSWORD=synthetic-db-secret',
            'REDIS_PASSWORD=synthetic-redis-secret',
            'AUTH0_CLIENT_SECRET=synthetic-auth0-secret',
            'sessionid=synthetic-cookie-secret',
        ]
        request = APIRequestFactory().post(
            '/api/v1/tenant-memberships/',
            {'notes': sentinels}, format='json',
            HTTP_AUTHORIZATION=sentinels[0],
            HTTP_COOKIE=sentinels[-1],
        )
        request.user = self.owner

        with self.assertLogs('security.audit', level='INFO') as captured:
            audit_event(
                'security.authorization.denied', 'denied', request=request,
                reason_code='insufficient_role', tenant=self.tenant,
                target_type='tenant_membership', target_id=self.target_membership.pk,
            )

        output = '\n'.join(record.getMessage() for record in captured.records)
        for sentinel in sentinels:
            self.assertNotIn(sentinel, output)
        for forbidden in (
            'Bearer', 'Authorization', 'JWT token', 'POSTGRES_PASSWORD',
            'REDIS_PASSWORD', 'AUTH0_CLIENT_SECRET', 'synthetic-jwt-token',
            'synthetic-cookie-secret',
        ):
            self.assertNotIn(forbidden, output)

    def test_logger_failure_does_not_change_guarded_behavior(self):
        request = APIRequestFactory().get('/api/v1/properties/hidden/')
        request.user = self.owner
        with patch('myappLubd.security_audit.audit_logger.info', side_effect=RuntimeError('synthetic logger failure')):
            record = audit_event(
                'security.authorization.denied', 'denied', request=request,
                reason_code='property_not_granted', tenant=self.tenant,
            )

        self.assertEqual(record['event'], 'security.authorization.denied')
        self.assertEqual(record['outcome'], 'denied')
