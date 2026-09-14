"""LINE Messaging API coverage for canonical Property-routed Job events."""

from datetime import datetime, timezone as datetime_timezone
from io import StringIO
from unittest.mock import patch

import requests
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.db import transaction
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .models import Area, Job, Property, Room, Tenant, TenantMembership
from .notifications.jobs import (
    DETAIL_MAX_LENGTH,
    _compose_created,
    _detail,
    _location,
    _status_label,
)
from .notifications.line import (
    LINE_PUSH_ENDPOINT,
    LINE_QUOTA_CONSUMPTION_ENDPOINT,
    LINE_QUOTA_ENDPOINT,
    LineSendResult,
    _retry_after_seconds,
    _usage_month,
    _usage_timeout,
    get_line_usage,
    record_line_usage,
    send_line_message,
    send_text_message,
)


User = get_user_model()


@override_settings(
    LINE_CHANNEL_ACCESS_TOKEN='server-only-test-token',
    LINE_CHANNEL_SECRET='server-only-test-secret',
    LINE_MESSAGING_TIMEOUT_SECONDS=2.5,
    LINE_USAGE_CACHE_ALIAS='default',
)
class LineTransportTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    @patch('myappLubd.notifications.line.requests.post')
    def test_uses_messaging_api_bearer_auth_and_timeout(self, post):
        response = requests.Response()
        response.status_code = 200
        post.return_value = response

        result = send_text_message(destination_id='group-1234', text='hello')

        self.assertTrue(result.ok)
        self.assertEqual(result.category, 'success')
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
    def test_multiple_message_objects_count_as_one_successful_push_request(self, post):
        response = requests.Response()
        response.status_code = 200
        post.return_value = response

        result = send_line_message(
            'group-1234',
            [
                {'type': 'text', 'text': 'first'},
                {'type': 'text', 'text': 'second'},
            ],
            property_id='P-A',
            event_type='JOB_CREATED',
        )

        self.assertTrue(result.ok)
        usage = get_line_usage(property_id='P-A', event_type='JOB_CREATED')
        self.assertEqual(usage['provider_attempts'], 1)
        self.assertEqual(usage['successful_messages'], 1)

    @patch('myappLubd.notifications.line.requests.post')
    def test_provider_failure_is_contained(self, post):
        post.side_effect = requests.Timeout('provider unavailable')
        result = send_text_message(destination_id='group-1234', text='hello')
        self.assertFalse(result.ok)
        self.assertEqual(result.category, 'network_error')
        self.assertTrue(result.retryable)

    def test_missing_token_and_destination_are_logged_without_secrets(self):
        with self.settings(LINE_CHANNEL_ACCESS_TOKEN=''):
            with self.assertLogs('myappLubd.notifications.line', 'WARNING') as logs:
                self.assertFalse(send_text_message(destination_id='group-1234', text='hello'))
        self.assertIn('category=missing_token', '\n'.join(logs.output))
        self.assertNotIn('server-only-test-token', '\n'.join(logs.output))

        with self.assertLogs('myappLubd.notifications.line', 'WARNING') as logs:
            self.assertFalse(send_text_message(destination_id='', text='hello'))
        self.assertIn('missing_destination', '\n'.join(logs.output))

    @patch('myappLubd.notifications.line.requests.post')
    def test_provider_http_errors_are_classified_and_safe(self, post):
        for status_code, category, retryable in (
            (400, 'bad_request', False), (401, 'unauthorized', False),
            (403, 'forbidden', False), (429, 'rate_limited', True),
            (503, 'provider_error', True),
        ):
            with self.subTest(status_code=status_code):
                cache.clear()
                response = requests.Response()
                response.status_code = status_code
                response._content = (
                    b'{"message":"safe provider error server-only-test-token '
                    b'server-only-test-secret group-1234"}'
                )
                post.return_value = response
                with self.assertLogs('myappLubd.notifications.line', 'WARNING') as logs:
                    result = send_text_message(destination_id='group-1234', text='hello')
                output = '\n'.join(logs.output)
                self.assertIn(f'status={status_code}', output)
                self.assertEqual(result.category, category)
                self.assertEqual(result.retryable, retryable)
                self.assertIn(f'category={category}', output)
                self.assertIn('safe provider error', output)
                self.assertIn('[REDACTED]', output)
                self.assertNotIn('server-only-test-token', output)
                self.assertNotIn('server-only-test-secret', output)
                self.assertNotIn('group-1234', output)

    @patch('myappLubd.notifications.line.time.sleep')
    @patch('myappLubd.notifications.line.requests.post')
    def test_429_retry_after_one_second_retries_once(self, post, sleep):
        limited = requests.Response()
        limited.status_code = 429
        limited.headers['Retry-After'] = '1'
        accepted = requests.Response()
        accepted.status_code = 200
        post.side_effect = [limited, accepted]

        result = send_text_message(destination_id='group-1234', text='hello')

        self.assertTrue(result.ok)
        self.assertEqual(result.attempts, 2)
        sleep.assert_called_once_with(1)
        self.assertEqual(post.call_count, 2)

    @patch('myappLubd.notifications.line.time.sleep')
    @patch('myappLubd.notifications.line.requests.post')
    def test_monthly_quota_exhaustion_is_not_retried(self, post, sleep):
        limited = requests.Response()
        limited.status_code = 429
        limited.headers['Retry-After'] = '1'
        limited._content = b'{"message": "  YOU have reached your monthly limit.  "}'
        post.return_value = limited

        with self.assertLogs('myappLubd.notifications.line', 'WARNING') as logs:
            result = send_text_message(
                destination_id='group-1234', text='hello',
                property_id='P-SIAM', event_type='JOB_CREATED',
            )

        self.assertEqual(result.category, 'monthly_quota_exhausted')
        self.assertFalse(result.retryable)
        self.assertEqual(result.attempts, 1)
        self.assertEqual(post.call_count, 1)
        sleep.assert_not_called()
        usage = get_line_usage(property_id='P-SIAM', event_type='JOB_CREATED')
        self.assertEqual(usage['provider_attempts'], 1)
        self.assertEqual(usage['failed'], 1)
        self.assertEqual(usage['quota_exhausted'], 1)
        self.assertEqual(usage['rate_limited'], 0)
        self.assertIn('LINE monthly quota exhausted', '\n'.join(logs.output))

    @patch('myappLubd.notifications.line.requests.post')
    def test_malformed_monthly_quota_response_falls_back_to_generic_429(self, post):
        limited = requests.Response()
        limited.status_code = 429
        limited._content = b'not-json You have reached your monthly limit.'
        post.return_value = limited

        result = send_text_message(destination_id='group-1234', text='hello')

        self.assertEqual(result.category, 'rate_limited')
        self.assertTrue(result.retryable)

    @patch('myappLubd.notifications.line.requests.post')
    def test_429_without_retry_after_is_suppressed_without_replay(self, post):
        limited = requests.Response()
        limited.status_code = 429
        limited._content = b'{"message":"quota response"}'
        post.return_value = limited

        first = send_text_message(destination_id='group-1234', text='hello')
        second = send_text_message(destination_id='group-1234', text='hello')

        self.assertEqual(post.call_count, 1)
        self.assertEqual(first.status_code, 429)
        self.assertEqual(second.attempts, 0)
        self.assertEqual(second.message, 'cooldown active')

    def test_retry_after_is_bounded_and_invalid_values_are_ignored(self):
        response = requests.Response()
        response.status_code = 429
        response.headers['Retry-After'] = '9999'
        self.assertEqual(_retry_after_seconds(response), 60)

        for value in ('-1', 'not-a-number'):
            with self.subTest(value=value):
                response.headers['Retry-After'] = value
                self.assertIsNone(_retry_after_seconds(response))

    @patch('myappLubd.notifications.line.requests.post')
    def test_response_body_is_bounded(self, post):
        response = requests.Response()
        response.status_code = 400
        response._content = b'x' * 900
        post.return_value = response
        result = send_text_message(destination_id='group-1234', text='hello')
        self.assertEqual(len(result.message), 500)

    @patch('myappLubd.notifications.line.requests.post')
    def test_retry_key_is_sent_and_already_accepted_response_succeeds(self, post):
        response = requests.Response()
        response.status_code = 409
        response.headers['X-Line-Accepted-Request-Id'] = 'accepted-request-id'
        post.return_value = response

        delivered = send_text_message(
            destination_id='group-1234',
            text='hello',
            retry_key='123e4567-e89b-12d3-a456-426614174000',
            property_id='P-A',
            event_type='PM_REMINDER',
        )

        self.assertTrue(delivered)
        self.assertEqual(
            post.call_args.kwargs['headers']['X-Line-Retry-Key'],
            '123e4567-e89b-12d3-a456-426614174000',
        )
        usage = get_line_usage(property_id='P-A', event_type='PM_REMINDER')
        self.assertEqual(usage['provider_attempts'], 1)
        self.assertEqual(usage['successful_messages'], 0)

    @patch('myappLubd.notifications.line.requests.post')
    def test_arbitrary_keyed_409_remains_an_error(self, post):
        response = requests.Response()
        response.status_code = 409
        post.return_value = response
        self.assertFalse(send_text_message(
            destination_id='group-1234',
            text='hello',
            retry_key='123e4567-e89b-12d3-a456-426614174000',
        ))

    @patch('myappLubd.notifications.line.requests.post')
    def test_unkeyed_409_remains_an_error(self, post):
        response = requests.Response()
        response.status_code = 409
        post.return_value = response
        self.assertFalse(send_text_message(destination_id='group-1234', text='hello'))

    @patch('myappLubd.notifications.line.requests.post')
    def test_invalid_retry_key_is_rejected_before_transport(self, post):
        self.assertFalse(send_text_message(
            destination_id='group-1234', text='hello', retry_key='not-a-uuid',
        ))
        post.assert_not_called()

    @patch('myappLubd.notifications.line.requests.post')
    def test_success_and_permanent_failure_counters(self, post):
        success = requests.Response()
        success.status_code = 200
        failure = requests.Response()
        failure.status_code = 400
        post.side_effect = [success, failure]

        send_text_message(
            destination_id='group-a', text='one', property_id='P-A', event_type='JOB_CREATED',
        )
        send_text_message(
            destination_id='group-a', text='two', property_id='P-A', event_type='JOB_CREATED',
        )

        usage = get_line_usage(property_id='P-A', event_type='JOB_CREATED')
        self.assertEqual(usage['provider_attempts'], 2)
        self.assertEqual(usage['successful_messages'], 1)
        self.assertEqual(usage['failed'], 1)

    @patch('myappLubd.notifications.line.time.sleep')
    @patch('myappLubd.notifications.line.requests.post')
    def test_retry_counts_each_provider_attempt_and_one_success(self, post, sleep):
        limited = requests.Response()
        limited.status_code = 429
        limited.headers['Retry-After'] = '1'
        accepted = requests.Response()
        accepted.status_code = 200
        post.side_effect = [limited, accepted]

        send_text_message(
            destination_id='group-a', text='one', property_id='P-A', event_type='JOB_CREATED',
        )

        usage = get_line_usage(property_id='P-A', event_type='JOB_CREATED')
        self.assertEqual(usage['provider_attempts'], 2)
        self.assertEqual(usage['successful_messages'], 1)
        self.assertEqual(usage['failed'], 0)
        self.assertEqual(usage['rate_limited'], 1)

    @patch('myappLubd.notifications.line.time.sleep')
    @patch('myappLubd.notifications.line.requests.post')
    def test_final_failure_after_retry_is_counted_exactly_once(self, post, sleep):
        first = requests.Response()
        first.status_code = 429
        first.headers['Retry-After'] = '1'
        final = requests.Response()
        final.status_code = 429
        final.headers['Retry-After'] = '1'
        post.side_effect = [first, final]

        result = send_text_message(
            destination_id='group-a', text='one',
            property_id='P-A', event_type='JOB_CREATED',
        )

        self.assertFalse(result.ok)
        self.assertEqual(result.attempts, 2)
        usage = get_line_usage(property_id='P-A', event_type='JOB_CREATED')
        self.assertEqual(usage['provider_attempts'], 2)
        self.assertEqual(usage['rate_limited'], 2)
        self.assertEqual(usage['failed'], 1)
        sleep.assert_called_once_with(1)

    def test_property_scope_and_month_rollover(self):
        august = datetime(2026, 8, 15, 12, tzinfo=datetime_timezone.utc)
        september = datetime(2026, 9, 15, 12, tzinfo=datetime_timezone.utc)
        record_line_usage(
            'successful_messages', property_id='P-A', event_type='JOB_CREATED', now=august,
        )
        record_line_usage(
            'successful_messages', property_id='P-B', event_type='JOB_CREATED', now=september,
        )

        self.assertEqual(get_line_usage(property_id='P-A', now=august)['successful_messages'], 1)
        self.assertEqual(get_line_usage(property_id='P-A', now=september)['successful_messages'], 0)
        self.assertEqual(get_line_usage(property_id='P-B', now=september)['successful_messages'], 1)
        self.assertEqual(get_line_usage(now=september)['successful_messages'], 1)

    def test_property_event_and_bangkok_month_scoping(self):
        before_bangkok_midnight = datetime(
            2026, 8, 31, 16, 59, tzinfo=datetime_timezone.utc,
        )
        after_bangkok_midnight = datetime(
            2026, 8, 31, 17, 1, tzinfo=datetime_timezone.utc,
        )
        record_line_usage(
            'successful_messages', property_id='P-A', event_type='JOB_CREATED',
            now=before_bangkok_midnight,
        )
        record_line_usage(
            'successful_messages', property_id='P-A', event_type='PM_REMINDER',
            now=after_bangkok_midnight,
        )

        self.assertEqual(_usage_month(before_bangkok_midnight), '2026-08')
        self.assertEqual(_usage_month(after_bangkok_midnight), '2026-09')
        self.assertEqual(get_line_usage(
            property_id='P-A', event_type='JOB_CREATED', now=before_bangkok_midnight,
        )['successful_messages'], 1)
        self.assertEqual(get_line_usage(
            property_id='P-A', event_type='PM_REMINDER', now=before_bangkok_midnight,
        )['successful_messages'], 0)
        self.assertEqual(get_line_usage(
            property_id='P-A', event_type='PM_REMINDER', now=after_bangkok_midnight,
        )['successful_messages'], 1)

    def test_usage_ttl_is_seven_days_after_bangkok_month_end(self):
        one_minute_before_month_end = datetime(
            2026, 9, 30, 16, 59, tzinfo=datetime_timezone.utc,
        )
        one_minute_before_year_end = datetime(
            2026, 12, 31, 16, 59, tzinfo=datetime_timezone.utc,
        )

        self.assertEqual(_usage_timeout(one_minute_before_month_end), 7 * 86400 + 60)
        self.assertEqual(_usage_timeout(one_minute_before_year_end), 7 * 86400 + 60)

    @patch('myappLubd.notifications.line.cache.add', side_effect=RuntimeError('cache unavailable'))
    @patch('myappLubd.notifications.line.requests.post')
    def test_counter_failure_does_not_break_send(self, post, cache_add):
        response = requests.Response()
        response.status_code = 200
        post.return_value = response

        result = send_text_message(
            destination_id='group-a', text='one', property_id='P-A', event_type='JOB_CREATED',
        )

        self.assertTrue(result.ok)
        post.assert_called_once()

    @override_settings(LINE_MONTHLY_MESSAGE_LIMIT=300)
    @patch('myappLubd.notifications.line.logger.warning')
    def test_80_90_95_100_threshold_warnings_are_each_once_per_month(self, warning):
        for amount in (240, 0, 30, 0, 15, 0, 15, 0):
            record_line_usage(
                'successful_messages', property_id='P-A', event_type='JOB_CREATED',
                amount=amount,
            )

        threshold_calls = [
            call for call in warning.call_args_list
            if call.args and str(call.args[0]).startswith(
                'LINE local successful push request count reached'
            )
        ]
        self.assertEqual([call.args[1] for call in threshold_calls], [80, 90, 95, 100])
        self.assertEqual([call.args[2] for call in threshold_calls], [240, 270, 285, 300])


@override_settings(
    LINE_CHANNEL_ACCESS_TOKEN='diagnostic-secret-token',
    LINE_MESSAGING_TIMEOUT_SECONDS=2,
    LINE_MONTHLY_MESSAGE_LIMIT=300,
    LINE_USAGE_CACHE_ALIAS='default',
)
class LineDiagnosticCommandTests(TestCase):
    def setUp(self):
        cache.clear()
        tenant = Tenant.objects.create(name='Diagnostic Tenant')
        self.property = Property.objects.create(
            name='Lub d Bangkok Siam', tenant=tenant,
            line_notifications_enabled=True, line_destination_id='secret-group-destination',
        )
        record_line_usage(
            'provider_attempts', property_id=self.property.property_id,
            event_type='JOB_CREATED', amount=3,
        )
        record_line_usage(
            'successful_messages', property_id=self.property.property_id,
            event_type='JOB_CREATED', amount=2,
        )
        record_line_usage(
            'failed', property_id=self.property.property_id,
            event_type='JOB_CREATED', amount=1,
        )
        record_line_usage(
            'quota_exhausted', property_id=self.property.property_id,
            event_type='JOB_CREATED', amount=1,
        )
        record_line_usage(
            'rate_limited', property_id=self.property.property_id,
            event_type='JOB_CREATED', amount=1,
        )
        record_line_usage(
            'successful_messages', property_id='P-OTHER',
            event_type='JOB_CREATED', amount=1,
        )

    @patch('myappLubd.management.commands.test_line_notification.get_provider_quota')
    @patch('myappLubd.management.commands.test_line_notification.send_text_message')
    def test_read_only_diagnostic_shows_local_counts_without_secrets(
        self, send, provider_quota,
    ):
        output = StringIO()
        call_command(
            'test_line_notification', property_id=self.property.property_id, stdout=output,
        )
        rendered = output.getvalue()
        self.assertIn('Configured provider monthly limit: 300', rendered)
        self.assertIn('Local successful push requests this month (Property): 2', rendered)
        self.assertIn('Local provider attempts this month: 3', rendered)
        self.assertIn('Local failed sends this month: 1', rendered)
        self.assertIn('Local quota-exhausted responses this month: 1', rendered)
        self.assertIn('Local temporary rate-limited responses this month: 1', rendered)
        self.assertIn('Local successful push requests this month (overall): 3', rendered)
        self.assertIn('they are not provider quota usage', rendered)
        self.assertNotIn('Estimated remaining local quota', rendered)
        self.assertNotIn('diagnostic-secret-token', rendered)
        self.assertNotIn('secret-group-destination', rendered)
        send.assert_not_called()
        provider_quota.assert_not_called()

    @patch(
        'myappLubd.management.commands.test_line_notification.send_text_message'
    )
    def test_send_flag_sends_exactly_one_test_message(self, send):
        send.return_value = LineSendResult(True, 200, 'success', False, attempts=1)
        output = StringIO()

        call_command(
            'test_line_notification', property_id=self.property.property_id,
            send=True, message='operator test', stdout=output,
        )

        send.assert_called_once_with(
            destination_id='secret-group-destination',
            text='operator test',
            event_type='DIAGNOSTIC',
            property_id=self.property.property_id,
        )
        self.assertIn('Result: success', output.getvalue())

    @patch('myappLubd.notifications.line.requests.get')
    def test_explicit_provider_quota_diagnostic(self, get):
        quota = requests.Response()
        quota.status_code = 200
        quota._content = b'{"type":"limited","value":300}'
        consumption = requests.Response()
        consumption.status_code = 200
        consumption._content = b'{"totalUsage":300}'
        get.side_effect = [quota, consumption]
        output = StringIO()

        call_command(
            'test_line_notification', property_id=self.property.property_id,
            quota=True, stdout=output,
        )

        rendered = output.getvalue()
        self.assertIn('Provider limit: 300', rendered)
        self.assertIn('Provider usage: 300', rendered)
        self.assertIn('Provider remaining: 0', rendered)
        self.assertNotIn('diagnostic-secret-token', rendered)
        self.assertEqual(
            [call.args[0] for call in get.call_args_list],
            [LINE_QUOTA_ENDPOINT, LINE_QUOTA_CONSUMPTION_ENDPOINT],
        )


@override_settings(
    LINE_CHANNEL_ACCESS_TOKEN='server-only-test-token',
    LINE_CHANNEL_SECRET='server-only-test-secret',
    LINE_MESSAGING_TIMEOUT_SECONDS=1,
    LINE_USAGE_CACHE_ALIAS='default',
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
        self.other_room = Room.objects.create(
            name='LINE-OTHER-101', room_type='Standard', property=self.other_property,
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

    def _create_job(self, payload=None):
        response = self.client.post(
            '/api/v1/jobs/', payload or self._payload(), format='json', secure=True,
        )
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
        self.assertIn('🏨 Property: LINE Siam', message)
        self.assertIn('📍 Location: Room LINE-101', message)
        self.assertIn('🛠 Issue: Plumbing', message)
        self.assertIn('📝 Detail: Repair leaking sink', message)
        self.assertIn('👤 Assigned to: Mali Manager', message)
        self.assertIn('📌 Status: Pending', message)
        self.assertIn(f'⏰ Created: {timezone.localtime(job.created_at):%d %b %Y %H:%M}', message)
        self.assertIn(f'Job ID: {job.job_id}', message)
        self.assertIn(f'https://staymaint.com/dashboard/jobs/{job.job_id}', message)
        self.assertTrue(message.endswith('StayMaint'))
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

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_two_properties_never_cross_route(self, send):
        self._enable('line-siam')
        Job.objects.create(
            user=self.technician,
            updated_by=self.manager,
            property=self.property,
            description='Siam issue',
            remarks='',
        )
        Job.objects.create(
            user=self.technician,
            updated_by=self.manager,
            property=self.other_property,
            description='Chinatown issue',
            remarks='',
        )

        self.assertEqual(send.call_count, 2)
        self.assertEqual(
            [call.kwargs['destination_id'] for call in send.call_args_list],
            ['line-siam', 'line-chinatown'],
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
    def test_status_change_sends_once_with_labels_assignee_and_property(self, send):
        _, job = self._create_job()
        self._enable()

        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/update_status/',
            {'status': 'in_progress'},
            format='json',
            secure=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        send.assert_called_once()
        job.refresh_from_db()
        self.assertEqual(send.call_args.kwargs['destination_id'], 'line-siam')
        message = send.call_args.kwargs['text']
        self.assertIn('🔄 Job Status Updated', message)
        self.assertIn('Pending ➜ In Progress', message)
        self.assertIn('👤 Technician: Mali Manager', message)
        self.assertIn('🏨 LINE Siam', message)
        self.assertIn(f'⏰ Updated: {timezone.localtime(job.updated_at):%d %b %Y %H:%M}', message)
        self.assertIn(f'Job ID: {job.job_id}', message)

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_completed_status_uses_dedicated_template(self, send):
        _, job = self._create_job()
        self._enable()

        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/update_status/',
            {'status': 'completed'},
            format='json',
            secure=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        send.assert_called_once()
        job.refresh_from_db()
        message = send.call_args.kwargs['text']
        self.assertIn('✅ Maintenance Completed', message)
        self.assertNotIn('🔄 Job Status Updated', message)
        self.assertIn('📌 Status: Completed', message)
        self.assertIn('👤 Completed by: Mali Manager', message)
        self.assertIn(
            f'⏰ Completed: {timezone.localtime(job.completed_at):%d %b %Y %H:%M}',
            message,
        )
        self.assertIn(f'Job ID: {job.job_id}', message)
        self.assertTrue(message.endswith('StayMaint'))

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_unchanged_status_sends_nothing(self, send):
        _, job = self._create_job()
        self._enable()

        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/update_status/',
            {'status': 'pending'},
            format='json',
            secure=True,
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
            secure=True,
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
            secure=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        send.assert_called_once()
        message = send.call_args.kwargs['text']
        self.assertIn('👷 Job Reassigned', message)
        self.assertIn('From: Mali Manager', message)
        self.assertIn('To: Tech Two', message)
        self.assertIn('📌 Status: Pending', message)
        self.assertIn(f'Job ID: {job.job_id}', message)

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_unicode_detail_is_preserved_and_long_detail_is_truncated(self, send):
        self._enable()
        payload = self._payload()
        payload['description'] = '  แอร์ไม่เย็น\n\n' + ('ทดสอบ' * 70)

        _, job = self._create_job(payload)

        message = send.call_args.kwargs['text']
        detail_line = next(line for line in message.splitlines() if line.startswith('📝 Detail: '))
        rendered_detail = detail_line.removeprefix('📝 Detail: ')
        self.assertIn('แอร์ไม่เย็น', rendered_detail)
        self.assertNotIn('\n', rendered_detail)
        self.assertEqual(len(rendered_detail), DETAIL_MAX_LENGTH)
        self.assertTrue(rendered_detail.endswith('…'))
        self.assertEqual(rendered_detail, _detail(job))

    def test_formatter_fallbacks_avoid_none_email_and_raw_relations(self):
        _, job = self._create_job()
        email_user = User.objects.create_user(username='private@example.com')
        second_room = Room.objects.create(
            name='LINE-102', room_type='Standard', property=self.property,
        )
        job.user = email_user
        job.description = '  Check\n\nwater   pressure  '
        job.rooms.add(second_room)

        message = _compose_created(job)

        self.assertIn('📍 Location: Rooms LINE-101, LINE-102', message)
        self.assertIn('📝 Detail: Check water pressure', message)
        self.assertIn('👤 Assigned to: Unassigned', message)
        self.assertNotIn('private@example.com', message)
        self.assertNotIn('None', message)
        self.assertNotIn('null', message.casefold())
        self.assertNotIn('<QuerySet', message)

        job.user = None
        self.assertIn('👤 Assigned to: Unassigned', _compose_created(job))

    def test_area_fallback_and_human_status_label(self):
        _, job = self._create_job()
        job.rooms.clear()

        self.assertEqual(_location(job), 'LINE Lobby')
        self.assertEqual(_status_label('waiting_sparepart'), 'Waiting Spare Part')

    @patch('myappLubd.notifications.jobs.send_text_message')
    def test_message_does_not_leak_internal_or_line_configuration_values(self, send):
        self._enable(destination='private-group-destination-A1B2')

        _, job = self._create_job()

        message = send.call_args.kwargs['text']
        self.assertIn(f'Job ID: {job.job_id}', message)
        self.assertNotIn('private-group-destination-A1B2', message)
        self.assertNotIn('server-only-test-token', message)
        self.assertNotIn('server-only-test-secret', message)
        self.assertNotIn('LINE_CHANNEL_ACCESS_TOKEN', message)
        self.assertNotIn('LINE_CHANNEL_SECRET', message)
        self.assertNotIn('Property ID:', message)
        self.assertNotIn('Tenant ID:', message)

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
            secure=True,
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
            secure=True,
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
            secure=True,
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        send.assert_not_called()
