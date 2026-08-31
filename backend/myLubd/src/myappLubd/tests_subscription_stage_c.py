from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase, APIRequestFactory

from .models import (
    Inventory,
    Job,
    Machine,
    PreventiveMaintenance,
    Property,
    Room,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
)
from .subscription_permissions import require_subscription_write


User = get_user_model()


@override_settings(
    SUBSCRIPTION_ENFORCEMENT_MODE='observe',
    SECURE_SSL_REDIRECT=False,
)
class SubscriptionStageCOperationalTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='stage-c-owner')
        self.plan = SubscriptionPlan.objects.create(code='stage-c', name='Stage C')
        self.suspended_tenant = Tenant.objects.create(name='Suspended tenant')
        self.active_tenant = Tenant.objects.create(name='Active tenant')
        self.suspended_property = Property.objects.create(
            name='Suspended property', tenant=self.suspended_tenant
        )
        self.active_property = Property.objects.create(
            name='Active property', tenant=self.active_tenant
        )
        for tenant in (self.suspended_tenant, self.active_tenant):
            TenantMembership.objects.create(
                tenant=tenant, user=self.user, role='owner'
            )
        TenantSubscription.objects.create(
            tenant=self.suspended_tenant,
            plan=self.plan,
            status='suspended',
            external_customer_id='customer-secret',
            external_subscription_id='subscription-secret',
        )
        TenantSubscription.objects.create(
            tenant=self.active_tenant, plan=self.plan, status='active'
        )
        self.suspended_room = Room.objects.create(
            name='S-101', room_type='Standard', property=self.suspended_property
        )
        self.active_room = Room.objects.create(
            name='A-101', room_type='Standard', property=self.active_property
        )
        self.suspended_machine = Machine.objects.create(
            machine_id='STAGE-C-MACHINE',
            name='Stage C machine',
            property=self.suspended_property,
        )
        self.client.force_authenticate(self.user)

    def _job_payload(self, property_obj, room):
        return {
            'description': 'Stage C observed job',
            'remarks': 'Stage C test',
            'status': 'pending',
            'priority': 'medium',
            'property_id': property_obj.property_id,
            'room_ids': [room.room_id],
            'topic_data': {'title': 'Stage C topic'},
        }

    def _make_suspended_job(self):
        job = Job.objects.create(
            user=self.user,
            updated_by=self.user,
            property=self.suspended_property,
            description='Existing suspended job',
            status='pending',
        )
        job.rooms.add(self.suspended_room)
        return job

    def _make_suspended_pm(self):
        pm = PreventiveMaintenance.objects.create(
            pmtitle='Suspended PM',
            scheduled_date=timezone.now(),
            status='pending',
            created_by=self.user,
        )
        pm.machines.add(self.suspended_machine)
        return pm

    def test_active_job_create_is_unchanged_and_quiet(self):
        with patch('myappLubd.subscription_permissions.logger.warning') as warning:
            response = self.client.post(
                '/api/v1/jobs/',
                self._job_payload(self.active_property, self.active_room),
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        warning.assert_not_called()

    def test_suspended_job_create_succeeds_and_logs_would_block(self):
        with self.assertLogs('subscription.entitlement', level='WARNING') as logs:
            response = self.client.post(
                '/api/v1/jobs/',
                self._job_payload(self.suspended_property, self.suspended_room),
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        record = logs.records[0]
        self.assertTrue(record.would_block)
        self.assertEqual(record.tenant_id, self.suspended_tenant.tenant_id)
        self.assertEqual(record.operation, 'create')
        self.assertEqual(record.resource_type, 'job')
        self.assertIsNone(getattr(response.wsgi_request.user, 'external_customer_id', None))
        rendered_log = ' '.join(str(value) for value in record.__dict__.values())
        self.assertNotIn('customer-secret', rendered_log)
        self.assertNotIn('subscription-secret', rendered_log)

    def test_suspended_job_patch_status_and_comment_stay_available(self):
        job = self._make_suspended_job()
        with self.assertLogs('subscription.entitlement', level='WARNING') as logs:
            patch_response = self.client.patch(
                f'/api/v1/jobs/{job.job_id}/', {'remarks': 'observed'}, format='json'
            )
            status_response = self.client.patch(
                f'/api/v1/jobs/{job.job_id}/update_status/',
                {'status': 'in_progress'},
                format='json',
            )
            comment_response = self.client.post(
                f'/api/v1/jobs/{job.job_id}/comments/?property_id={self.suspended_property.property_id}',
                {'comment': 'Still available in observe mode'},
                format='json',
            )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        self.assertEqual(comment_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            {record.operation for record in logs.records},
            {'update', 'status_change', 'comment_create'},
        )

    def test_suspended_public_qr_create_succeeds_without_billing_disclosure(self):
        self.client.force_authenticate(user=None)
        with self.assertLogs('subscription.entitlement', level='WARNING') as logs:
            response = self.client.post(
                f'/api/v1/public/job-requests/{self.suspended_property.property_id}/{self.suspended_room.room_id}/',
                {'description': 'Anonymous observed request', 'guest_name': 'Private guest'},
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertIsNone(logs.records[0].user_id)
        self.assertTrue(logs.records[0].would_block)
        response_text = response.content.decode()
        for forbidden in ('subscription', 'suspended', 'READ_ONLY', 'customer-secret'):
            self.assertNotIn(forbidden, response_text)

    def test_suspended_pm_update_and_completion_succeed(self):
        pm = self._make_suspended_pm()
        detail_url = (
            f'/api/v1/preventive-maintenance/{pm.pm_id}/'
            f'?property_id={self.suspended_property.property_id}'
        )
        complete_url = (
            f'/api/v1/preventive-maintenance/{pm.pm_id}/complete/'
            f'?property_id={self.suspended_property.property_id}'
        )
        with self.assertLogs('subscription.entitlement', level='WARNING') as logs:
            update_response = self.client.patch(detail_url, {'notes': 'observed'}, format='json')
            complete_response = self.client.post(complete_url, {}, format='json')
        self.assertEqual(update_response.status_code, status.HTTP_200_OK, update_response.content)
        self.assertEqual(complete_response.status_code, status.HTTP_200_OK, complete_response.content)
        self.assertEqual(
            {record.operation for record in logs.records},
            {'update', 'complete'},
        )

    def test_suspended_inventory_restock_and_issue_succeed(self):
        inventory = Inventory.objects.create(
            name='Observed part',
            quantity=10,
            min_quantity=1,
            property=self.suspended_property,
            created_by=self.user,
        )
        with self.assertLogs('subscription.entitlement', level='WARNING') as logs:
            restock = self.client.post(
                f'/api/v1/inventory/{inventory.item_id}/restock/',
                {'quantity': 2},
                format='json',
            )
            issue = self.client.post(
                f'/api/v1/inventory/{inventory.item_id}/use/',
                {'quantity': 1},
                format='json',
            )
        self.assertEqual(restock.status_code, status.HTTP_200_OK, restock.content)
        self.assertEqual(issue.status_code, status.HTTP_200_OK, issue.content)
        self.assertEqual(
            {record.operation for record in logs.records},
            {'restock', 'issue'},
        )

    def test_entitlement_endpoint_is_exactly_tenant_scoped_and_provider_safe(self):
        suspended = self.client.get(
            '/api/v1/tenant-subscriptions/entitlement/',
            {'tenant_id': self.suspended_tenant.tenant_id},
        )
        active = self.client.get(
            '/api/v1/tenant-subscriptions/entitlement/',
            {'property_id': self.active_property.property_id},
        )
        self.assertEqual(suspended.status_code, status.HTTP_200_OK, suspended.content)
        self.assertEqual(active.status_code, status.HTTP_200_OK, active.content)
        self.assertEqual(suspended.data['entitlement_level'], 'READ_ONLY')
        self.assertEqual(active.data['entitlement_level'], 'FULL')
        self.assertTrue(suspended.data['can_manage_billing'])
        for payload in (suspended.data, active.data):
            self.assertNotIn('external_customer_id', payload)
            self.assertNotIn('external_subscription_id', payload)

        subscription_projection = self.client.get(
            f'/api/v1/tenant-subscriptions/{self.suspended_tenant.subscription.pk}/'
        )
        self.assertEqual(subscription_projection.status_code, status.HTTP_200_OK)
        self.assertNotIn('external_customer_id', subscription_projection.data)
        self.assertNotIn('external_subscription_id', subscription_projection.data)

    def test_entitlement_endpoint_rejects_other_tenant(self):
        outsider_tenant = Tenant.objects.create(name='Not a member')
        response = self.client.get(
            '/api/v1/tenant-subscriptions/entitlement/',
            {'tenant_id': outsider_tenant.tenant_id},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_entitlement_billing_capability_follows_exact_membership_role(self):
        technician = User.objects.create_user(username='stage-c-technician')
        membership = TenantMembership.objects.create(
            tenant=self.active_tenant,
            user=technician,
            role='technician',
        )
        membership.properties.add(self.active_property)
        self.client.force_authenticate(technician)
        response = self.client.get(
            '/api/v1/tenant-subscriptions/entitlement/',
            {'property_id': self.active_property.property_id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['can_manage_billing'])

    @override_settings(SUBSCRIPTION_ENFORCEMENT_MODE='off')
    def test_off_mode_does_not_observe_or_block(self):
        with patch('myappLubd.subscription_permissions.logger.warning') as warning:
            response = self.client.post(
                '/api/v1/jobs/',
                self._job_payload(self.suspended_property, self.suspended_room),
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        warning.assert_not_called()

    def test_unresolved_target_logs_safely(self):
        request = APIRequestFactory().post('/api/v1/unresolved/', {})
        request.user = self.user
        with self.assertLogs('subscription.entitlement', level='WARNING') as logs:
            require_subscription_write(
                request, None, operation='create', resource_type='inventory'
            )
        record = logs.records[0]
        self.assertIsNone(record.tenant_id)
        self.assertEqual(record.reason_code, 'target_tenant_unresolved')

    @override_settings(SUBSCRIPTION_ENFORCEMENT_MODE='enforce')
    def test_enforce_primitive_fails_closed(self):
        request = APIRequestFactory().post('/api/v1/enforce/', {})
        request.user = self.user
        with self.assertLogs('subscription.entitlement', level='WARNING'):
            with self.assertRaisesMessage(Exception, 'Subscription payment required.'):
                require_subscription_write(
                    request,
                    self.suspended_tenant,
                    operation='create',
                    resource_type='job',
                )
