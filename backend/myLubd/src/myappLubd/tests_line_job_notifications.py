"""LINE Messaging API coverage for canonical Property-routed Job events."""

from unittest.mock import patch

import requests
from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import SimpleTestCase, TransactionTestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from .models import Area, Job, Property, Room, Tenant, TenantMembership
from .notifications.line import LINE_PUSH_ENDPOINT, send_text_message


User = get_user_model()


@override_settings(
    LINE_CHANNEL_ACCESS_TOKEN='server-only-test-token',
    LINE_MESSAGING_TIMEOUT_SECONDS=2.5,
)
class LineTransportTests(SimpleTestCase):
    @patch('myappLubd.notifications.line.requests.post')
    def test_uses_messaging_api_bearer_auth_and_timeout(self, post):
        post.return_value.raise_for_status.return_value = None

        delivered = send_text_message(destination_id='group-1234', text='hello')

        self.assertTrue(delivered)
        post.assert_called_once_with(
            LINE_PUSH_ENDPOINT,
            headers={
                'Authorization': 'Bearer server-only-test-token',
                'Content-Type': 'application/json',
            },
            json={
                'to': 'group-1234',
                'messages': [{'type': 'text', 'text': 'hello'}],
            },
            timeout=2.5,
        )

    @patch('myappLubd.notifications.line.requests.post')
    def test_provider_failure_is_contained(self, post):
        post.side_effect = requests.Timeout('provider unavailable')
        self.assertFalse(send_text_message(destination_id='group-1234', text='hello'))


@override_settings(
    LINE_CHANNEL_ACCESS_TOKEN='server-only-test-token',
    LINE_MESSAGING_TIMEOUT_SECONDS=1,
    FRONTEND_BASE_URL='https://staymaint.com',
)
class JobLineNotificationTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='LINE Tenant')
        self.other_tenant = Tenant.objects.create(name='Other LINE Tenant')
        self.property = Property.objects.create(
            name='LINE Siam',
            tenant=self.tenant,
            line_notifications_enabled=False,
            line_destination_id='line-siam',
        )
        self.other_property = Property.objects.create(
            name='LINE Chinatown',
            tenant=self.other_tenant,
            line_notifications_enabled=True,
            line_destination_id='line-chinatown',
        )
        self.room = Room.objects.create(
            name='LINE-101', room_type='Standard', property=self.property,
        )
        self.area = Area.objects.create(name='LINE Lobby', property=self.property)
        self.manager = User.objects.create_user(
            username='line-manager', first_name='Mali', last_name='Manager'
        )
        TenantMembership.objects.create(
            user=self.manager, tenant=self.tenant, role='manager'
        )
        self.technician = User.objects.create_user(
            username='line-technician', first_name='Tech', last_name='One'
        )
        TenantMembership.objects.create(
            user=self.technician, tenant=self.tenant, role='technician'
        ).properties.add(self.property)
        self.new_assignee = User.objects.create_user(
            username='line-new-assignee', first_name='Tech', last_name='Two'
        )
        TenantMembership.objects.create(
            user=self.new_assignee, tenant=self.tenant, role='technician'
        ).properties.add(self.property)
        self.client.force_authenticate(self.manager)

    def _enable(self, destination='line-siam'):
        self.property.line_notifications_enabled = True
        self.property.line_destination_id = destination
        self.property.save(update_fields=['line_notifications_enabled', 'line_destination_id'])

    def _payload(self):
        return {
            'description': 'Repair leaking sink',
            'remarks': 'LINE event test',
            'status': 'pending',
            'priority': 'high',
            'property_id': self.property.property_id,
            'room_ids': [self.room.room_id],
            'area_id': self.area.pk,
            'topic_data': {'title': 'Plumbing'},
        }

    def _create_job(self):
        response = self.client.post('/api/v1/jobs/', self._payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        return response, Job.objects.get(job_id=response.data['job_id'])

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_enabled_property_create_sends_one_complete_message(self, send):
        self._enable()

        response, job = self._create_job()

        send.assert_called_once()
        self.assertEqual(send.call_args.kwargs['destination_id'], 'line-siam')
        message = send.call_args.kwargs['text']
        self.assertIn('🔧 New Maintenance Job', message)
        self.assertIn('Property: LINE Siam', message)
        self.assertIn('Room/Area: LINE-101', message)
        self.assertIn('Job: Plumbing', message)
        self.assertIn('Priority: High', message)
        self.assertIn('Created by: Mali Manager', message)
        self.assertIn(f'https://staymaint.com/dashboard/jobs/{job.job_id}', message)
        self.assertNotIn('server-only-test-token', str(response.data))

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_disabled_property_create_sends_nothing(self, send):
        self._create_job()
        send.assert_not_called()

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_property_without_destination_sends_nothing(self, send):
        self._enable(destination='')
        self._create_job()
        send.assert_not_called()

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_create_routes_only_to_canonical_job_property(self, send):
        self._enable()
        _, job = self._create_job()

        self.assertEqual(job.property, self.property)
        self.assertEqual(send.call_args.kwargs['destination_id'], 'line-siam')
        self.assertNotEqual(
            send.call_args.kwargs['destination_id'],
            self.other_property.line_destination_id,
        )

    @patch('myappLubd.notifications.line.requests.post')
    def test_line_failure_does_not_fail_job_creation(self, post):
        self._enable()
        post.side_effect = requests.Timeout('LINE timeout')

        response, job = self._create_job()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Job.objects.filter(pk=job.pk).exists())
        post.assert_called_once()

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_rolled_back_create_sends_nothing(self, send):
        self._enable()
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                Job.objects.create(
                    user=self.technician,
                    updated_by=self.manager,
                    property=self.property,
                    description='Rolled back',
                    remarks='',
                )
                raise RuntimeError('rollback')
        send.assert_not_called()

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_status_change_sends_once_with_labels_actor_and_property(self, send):
        _, job = self._create_job()
        self._enable()

        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/update_status/',
            {'status': 'in_progress'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        send.assert_called_once()
        self.assertEqual(send.call_args.kwargs['destination_id'], 'line-siam')
        message = send.call_args.kwargs['text']
        self.assertIn('🔄 Job Status Updated', message)
        self.assertIn('Pending → In Progress', message)
        self.assertIn('Updated by:\nMali Manager', message)
        self.assertIn('Property: LINE Siam', message)

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_unchanged_status_sends_nothing(self, send):
        _, job = self._create_job()
        self._enable()

        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/update_status/',
            {'status': 'pending'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        send.assert_not_called()

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_unrelated_job_update_does_not_duplicate_notifications(self, send):
        _, job = self._create_job()
        self._enable()

        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/',
            {'remarks': 'No event transition'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        send.assert_not_called()

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_property_scoped_supervisor_reassign_sends_once_after_success(self, send):
        _, job = self._create_job()
        self._enable()
        supervisor = User.objects.create_user(
            username='line-supervisor', first_name='Suda', last_name='Supervisor'
        )
        TenantMembership.objects.create(
            user=supervisor, tenant=self.tenant, role='supervisor'
        ).properties.add(self.property)
        self.client.force_authenticate(supervisor)

        response = self.client.post(
            f'/api/v1/jobs/{job.job_id}/reassign/',
            {
                'user_id': self.new_assignee.pk,
                'property_id': self.property.property_id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        send.assert_called_once()
        message = send.call_args.kwargs['text']
        self.assertIn('👤 Job Reassigned', message)
        self.assertIn('From:\nMali Manager', message)
        self.assertIn('To:\nTech Two', message)
        self.assertIn('Reassigned by:\nSuda Supervisor', message)

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_technician_denied_reassign_sends_nothing(self, send):
        _, job = self._create_job()
        self._enable()
        self.client.force_authenticate(self.technician)

        response = self.client.post(
            f'/api/v1/jobs/{job.job_id}/reassign/',
            {
                'user_id': self.new_assignee.pk,
                'property_id': self.property.property_id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        send.assert_not_called()

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_same_assignee_reassign_failure_sends_nothing(self, send):
        _, job = self._create_job()
        self._enable()

        response = self.client.post(
            f'/api/v1/jobs/{job.job_id}/reassign/',
            {
                'user_id': self.manager.pk,
                'property_id': self.property.property_id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        send.assert_not_called()

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_failed_cross_tenant_target_reassign_sends_nothing(self, send):
        _, job = self._create_job()
        self._enable()
        outsider = User.objects.create_user(username='line-outsider')
        TenantMembership.objects.create(
            user=outsider, tenant=self.other_tenant, role='technician'
        ).properties.add(self.other_property)

        response = self.client.post(
            f'/api/v1/jobs/{job.job_id}/reassign/',
            {
                'user_id': outsider.pk,
                'property_id': self.property.property_id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        send.assert_not_called()
