"""Focused coverage for grouped, idempotent PM LINE reminders."""

from datetime import date, datetime, time, timedelta, timezone as datetime_timezone
from io import StringIO
from threading import Barrier, Lock, Thread
from unittest.mock import patch

import requests
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError, IntegrityError, close_old_connections, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from .models import (
    Job,
    Machine,
    MaintenanceSchedule,
    PMLineReminderBatch,
    PMLineReminderDelivery,
    PreventiveMaintenance,
    Property,
    Tenant,
)
from .notifications.pm_reminders import (
    BANGKOK,
    _mark_batch_delivered as real_mark_batch_delivered,
    compose_reminder_message,
    get_due_groups,
    send_due_pm_reminders,
)


User = get_user_model()


@override_settings(LINE_CHANNEL_ACCESS_TOKEN='test-token')
class PMLineReminderTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='pm-line-user')
        self.tenant = Tenant.objects.create(name='PM LINE Tenant')
        self.siam = Property.objects.create(
            name='Lub d Bangkok Siam',
            tenant=self.tenant,
            line_notifications_enabled=True,
            line_destination_id='line-siam-secret-1234',
        )
        self.chinatown = Property.objects.create(
            name='Lub d Bangkok Chinatown',
            tenant=self.tenant,
            line_notifications_enabled=True,
            line_destination_id='line-chinatown-secret-5678',
        )
        self.run_date = date(2026, 9, 14)

    def _now(self, hour=9, minute=0):
        return timezone.make_aware(
            datetime.combine(self.run_date, time(hour, minute)),
            BANGKOK,
        )

    def _scheduled(self, day):
        return timezone.make_aware(datetime.combine(day, time(14, 0)), BANGKOK)

    def _make_pm(self, property_obj=None, *, day=None, title='Air Conditioner Deep Cleaning',
                 status='pending', completed_date=None, location='Room 315'):
        property_obj = property_obj or self.siam
        pm = PreventiveMaintenance.objects.create(
            pmtitle=title,
            scheduled_date=self._scheduled(day or self.run_date),
            status=status,
            completed_date=completed_date,
            created_by=self.user,
        )
        machine = Machine.objects.create(
            machine_id=f'M-{pm.pk}',
            name=f'Machine {pm.pk}',
            location=location,
            property=property_obj,
        )
        pm.machines.add(machine)
        return pm

    def _make_job_pm(self, *, title=None):
        job = Job.objects.create(
            user=self.user,
            updated_by=self.user,
            property=self.siam,
            description='PM work',
            remarks='',
        )
        return PreventiveMaintenance.objects.create(
            job=job,
            pmtitle=title or '',
            scheduled_date=self._scheduled(self.run_date),
            created_by=self.user,
        )

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_day_before_eligible_pm_sends(self, send):
        self._make_pm(day=self.run_date + timedelta(days=1))
        results = send_due_pm_reminders(now=self._now())
        self.assertEqual([item['status'] for item in results], ['sent'])
        self.assertIn('Tomorrow: 15 Sep 2026', send.call_args.kwargs['text'])

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_same_day_eligible_pm_sends_at_nine(self, send):
        self._make_pm()
        send_due_pm_reminders(now=self._now())
        self.assertIn('Preventive Maintenance Today', send.call_args.kwargs['text'])
        self.assertIn('Reminder: 09:00', send.call_args.kwargs['text'])

    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_same_day_before_nine_does_not_send(self, send):
        self._make_pm()
        self.assertEqual(send_due_pm_reminders(now=self._now(8, 59)), [])
        send.assert_not_called()

    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_cancelled_pm_is_excluded(self, send):
        self._make_pm(status='cancelled')
        send_due_pm_reminders(now=self._now())
        send.assert_not_called()

    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_completed_status_is_excluded(self, send):
        self._make_pm(status='completed')
        send_due_pm_reminders(now=self._now())
        send.assert_not_called()

    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_completed_date_is_excluded(self, send):
        self._make_pm(completed_date=self._now(8))
        send_due_pm_reminders(now=self._now())
        send.assert_not_called()

    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_inactive_legacy_schedule_is_excluded(self, send):
        pm = self._make_pm()
        MaintenanceSchedule.objects.create(
            maintenance=pm,
            next_occurrence=pm.scheduled_date,
            is_active=False,
        )
        send_due_pm_reminders(now=self._now())
        send.assert_not_called()

    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_property_line_disabled_skips(self, send):
        self.siam.line_notifications_enabled = False
        self.siam.save(update_fields=['line_notifications_enabled'])
        self._make_pm()
        results = send_due_pm_reminders(now=self._now())
        self.assertEqual(results[0]['status'], 'skipped')
        send.assert_not_called()

    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_missing_destination_skips(self, send):
        self.siam.line_destination_id = ''
        self.siam.save(update_fields=['line_destination_id'])
        self._make_pm()
        send_due_pm_reminders(now=self._now())
        send.assert_not_called()

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_properties_route_only_to_their_canonical_destinations(self, send):
        self._make_pm(self.siam, title='Siam PM')
        self._make_pm(self.chinatown, title='Chinatown PM')
        send_due_pm_reminders(now=self._now())
        self.assertEqual(send.call_count, 2)
        calls = {call.kwargs['destination_id']: call.kwargs['text'] for call in send.call_args_list}
        self.assertIn('Siam PM', calls[self.siam.line_destination_id])
        self.assertNotIn('Chinatown PM', calls[self.siam.line_destination_id])
        self.assertIn('Chinatown PM', calls[self.chinatown.line_destination_id])
        self.assertNotIn('Siam PM', calls[self.chinatown.line_destination_id])

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_multiple_tasks_are_grouped_per_property(self, send):
        self._make_pm(title='Task one')
        self._make_pm(title='Task two')
        send_due_pm_reminders(now=self._now())
        send.assert_called_once()
        message = send.call_args.kwargs['text']
        self.assertIn('PM Today: 2 tasks', message)
        self.assertIn('Room 315 — Task one', message)
        self.assertIn('Room 315 — Task two', message)

    def test_thai_unicode_is_preserved(self):
        pm = self._make_pm(title='ตรวจสอบระบบปรับอากาศ', location='ล็อบบี้')
        message = compose_reminder_message(
            property_obj=self.siam,
            reminder_type=PMLineReminderDelivery.SAME_DAY,
            scheduled_date=self.run_date,
            tasks=[pm],
        )
        self.assertIn('ล็อบบี้ — ตรวจสอบระบบปรับอากาศ', message)

    def test_missing_location_and_title_have_safe_fallbacks(self):
        pm = self._make_job_pm(title=None)
        message = compose_reminder_message(
            property_obj=self.siam,
            reminder_type=PMLineReminderDelivery.SAME_DAY,
            scheduled_date=self.run_date,
            tasks=[pm],
        )
        self.assertIn('Location not specified — Preventive maintenance', message)
        self.assertNotIn('None', message)
        self.assertNotIn('null', message.casefold())

    def test_destination_id_is_never_rendered(self):
        pm = self._make_pm()
        message = compose_reminder_message(
            property_obj=self.siam,
            reminder_type=PMLineReminderDelivery.SAME_DAY,
            scheduled_date=self.run_date,
            tasks=[pm],
        )
        self.assertNotIn(self.siam.line_destination_id, message)

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_day_before_reminder_is_not_duplicated(self, send):
        self._make_pm(day=self.run_date + timedelta(days=1))
        send_due_pm_reminders(now=self._now(), reminder_type='day_before')
        send_due_pm_reminders(now=self._now(), reminder_type='day_before')
        send.assert_called_once()

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_same_day_command_retry_is_not_duplicated(self, send):
        self._make_pm()
        send_due_pm_reminders(now=self._now(), reminder_type='same_day')
        send_due_pm_reminders(now=self._now(), reminder_type='same_day')
        send.assert_called_once()

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=False)
    def test_line_failure_does_not_mark_delivered(self, send):
        self._make_pm()
        results = send_due_pm_reminders(now=self._now())
        self.assertEqual(results[0]['status'], 'failed')
        self.assertFalse(PMLineReminderDelivery.objects.exists())

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_success_records_one_delivery_per_pm(self, send):
        first = self._make_pm(title='First')
        second = self._make_pm(title='Second')
        send_due_pm_reminders(now=self._now())
        self.assertEqual(
            set(PMLineReminderDelivery.objects.values_list('preventive_maintenance_id', flat=True)),
            {first.pk, second.pk},
        )

    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_dry_run_sends_nothing_and_creates_no_delivery(self, send):
        pm = self._make_pm()
        original = (pm.status, pm.scheduled_date, pm.completed_date)
        results = send_due_pm_reminders(now=self._now(), dry_run=True)
        self.assertTrue(results[0]['would_send'])
        self.assertFalse(results[0]['sent'])
        send.assert_not_called()
        self.assertFalse(PMLineReminderDelivery.objects.exists())
        self.assertFalse(PMLineReminderBatch.objects.exists())
        pm.refresh_from_db()
        self.assertEqual((pm.status, pm.scheduled_date, pm.completed_date), original)

    @patch('myappLubd.management.commands.send_pm_line_reminders.timezone.now')
    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_command_dry_run_is_safe_and_reports_counts(self, send, now):
        now.return_value = self._now()
        self._make_pm()
        output = StringIO()
        call_command('send_pm_line_reminders', '--dry-run', stdout=output)
        rendered = output.getvalue()
        self.assertIn('Property: Lub d Bangkok Siam', rendered)
        self.assertIn('same-day PM count: 1', rendered)
        self.assertIn('actual send: NO', rendered)
        self.assertNotIn(self.siam.line_destination_id, rendered)
        send.assert_not_called()
        self.assertFalse(PMLineReminderDelivery.objects.exists())

    @patch('myappLubd.management.commands.send_pm_line_reminders.timezone.now')
    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=False)
    def test_command_returns_failure_status_when_provider_fails(self, send, now):
        now.return_value = self._now()
        self._make_pm()
        with self.assertRaises(CommandError):
            call_command('send_pm_line_reminders', stdout=StringIO(), stderr=StringIO())
        send.assert_called_once()
        self.assertFalse(PMLineReminderDelivery.objects.exists())

    def test_delivery_unique_constraint_enforces_idempotency_key(self):
        pm = self._make_pm()
        batch = PMLineReminderBatch.objects.create(
            property=self.siam,
            reminder_type=PMLineReminderDelivery.SAME_DAY,
            scheduled_date=self.run_date,
            destination_id=self.siam.line_destination_id,
            message_text='test',
            accepted_at=self._now(),
        )
        values = dict(
            batch=batch,
            property=self.siam,
            preventive_maintenance=pm,
            reminder_type=PMLineReminderDelivery.SAME_DAY,
            scheduled_date=self.run_date,
            delivered_at=self._now(),
        )
        PMLineReminderDelivery.objects.create(**values)
        with self.assertRaises(IntegrityError), transaction.atomic():
            PMLineReminderDelivery.objects.create(**values)

    def test_same_pm_has_independent_reminder_types_and_properties(self):
        pm = self._make_pm()
        same_day_batch = PMLineReminderBatch.objects.create(
            property=self.siam,
            reminder_type=PMLineReminderDelivery.SAME_DAY,
            scheduled_date=self.run_date,
            destination_id=self.siam.line_destination_id,
            message_text='same day',
            accepted_at=self._now(),
        )
        day_before_batch = PMLineReminderBatch.objects.create(
            property=self.siam,
            reminder_type=PMLineReminderDelivery.DAY_BEFORE,
            scheduled_date=self.run_date,
            destination_id=self.siam.line_destination_id,
            message_text='day before',
            accepted_at=self._now(),
        )
        other_property_batch = PMLineReminderBatch.objects.create(
            property=self.chinatown,
            reminder_type=PMLineReminderDelivery.SAME_DAY,
            scheduled_date=self.run_date,
            destination_id=self.chinatown.line_destination_id,
            message_text='other property',
            accepted_at=self._now(),
        )
        for batch, property_obj, reminder_type in (
            (same_day_batch, self.siam, PMLineReminderDelivery.SAME_DAY),
            (day_before_batch, self.siam, PMLineReminderDelivery.DAY_BEFORE),
            (other_property_batch, self.chinatown, PMLineReminderDelivery.SAME_DAY),
        ):
            PMLineReminderDelivery.objects.create(
                batch=batch,
                property=property_obj,
                preventive_maintenance=pm,
                reminder_type=reminder_type,
                scheduled_date=self.run_date,
                delivered_at=self._now(),
            )
        self.assertEqual(PMLineReminderDelivery.objects.count(), 3)

    @patch('myappLubd.notifications.pm_reminders._mark_batch_delivered')
    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_provider_acceptance_then_db_failure_retries_exact_request(self, send, mark):
        self._make_pm(title='First')
        self._make_pm(title='Second')
        mark.side_effect = DatabaseError('simulated commit failure')
        with self.assertRaises(DatabaseError):
            send_due_pm_reminders(now=self._now())
        first_request = send.call_args.kwargs.copy()
        self.assertFalse(PMLineReminderDelivery.objects.exists())

        mark.side_effect = real_mark_batch_delivered
        send.reset_mock()
        send_due_pm_reminders(now=self._now())
        self.assertEqual(send.call_args.kwargs, first_request)
        self.assertEqual(PMLineReminderDelivery.objects.count(), 2)

    @patch('myappLubd.notifications.pm_reminders._mark_batch_delivered')
    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_crash_then_later_added_pm_does_not_regroup_accepted_tasks(self, send, mark):
        self._make_pm(title='A')
        self._make_pm(title='B')
        mark.side_effect = DatabaseError('simulated commit failure')
        with self.assertRaises(DatabaseError):
            send_due_pm_reminders(now=self._now())
        accepted_request = send.call_args.kwargs.copy()

        self._make_pm(title='C')
        mark.side_effect = real_mark_batch_delivered
        send.reset_mock()
        send_due_pm_reminders(now=self._now())

        self.assertEqual(send.call_count, 2)
        retry_old, send_new = [call.kwargs for call in send.call_args_list]
        self.assertEqual(retry_old, accepted_request)
        self.assertIn(' — C', send_new['text'])
        self.assertNotIn(' — A', send_new['text'])
        self.assertNotIn(' — B', send_new['text'])
        self.assertNotEqual(retry_old['retry_key'], send_new['retry_key'])
        self.assertEqual(PMLineReminderDelivery.objects.count(), 3)

    @patch('myappLubd.notifications.line.requests.post')
    def test_provider_timeout_then_409_retry_records_without_new_request_key(self, post):
        self._make_pm()
        duplicate = requests.Response()
        duplicate.status_code = 409
        duplicate.headers['X-Line-Accepted-Request-Id'] = 'accepted-request-id'
        post.side_effect = [requests.Timeout('ambiguous timeout'), duplicate]
        first = send_due_pm_reminders(now=self._now())
        second = send_due_pm_reminders(now=self._now())
        self.assertEqual(first[0]['status'], 'failed')
        self.assertEqual(second[0]['status'], 'sent')
        self.assertEqual(
            post.call_args_list[0].kwargs['headers']['X-Line-Retry-Key'],
            post.call_args_list[1].kwargs['headers']['X-Line-Retry-Key'],
        )
        self.assertEqual(PMLineReminderDelivery.objects.count(), 1)

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_later_added_pm_after_success_gets_its_own_message(self, send):
        self._make_pm(title='A')
        self._make_pm(title='B')
        send_due_pm_reminders(now=self._now())
        self._make_pm(title='C')
        send_due_pm_reminders(now=self._now())
        self.assertEqual(send.call_count, 2)
        later = send.call_args_list[1].kwargs
        self.assertIn(' — C', later['text'])
        self.assertNotIn(' — A', later['text'])
        self.assertNotIn(' — B', later['text'])

    def test_retry_key_is_uuid_and_not_derived_from_destination(self):
        self._make_pm()
        with patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=False):
            send_due_pm_reminders(now=self._now())
        batch = PMLineReminderBatch.objects.get()
        self.assertEqual(len(str(batch.retry_key)), 36)
        self.assertNotIn(self.siam.line_destination_id, str(batch.retry_key))

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_rescheduled_pm_uses_a_new_idempotency_date(self, send):
        pm = self._make_pm()
        send_due_pm_reminders(now=self._now(), reminder_type='same_day')
        next_date = self.run_date + timedelta(days=1)
        pm.scheduled_date = self._scheduled(next_date)
        pm.save(update_fields=['scheduled_date'])
        send_due_pm_reminders(
            now=self._now(),
            run_date=next_date,
            reminder_type='same_day',
        )
        self.assertEqual(send.call_count, 2)
        self.assertEqual(PMLineReminderDelivery.objects.count(), 2)

    def test_malformed_cross_property_pm_is_not_grouped(self):
        pm = self._make_pm(self.siam)
        other_machine = Machine.objects.create(
            machine_id='M-CROSS',
            name='Cross-property machine',
            property=self.chinatown,
        )
        pm.machines.add(other_machine)
        self.assertEqual(get_due_groups(now=self._now()), [])

    def test_job_machine_property_conflict_is_not_grouped(self):
        job = Job.objects.create(
            user=self.user,
            updated_by=self.user,
            property=self.siam,
            description='Conflicting PM work',
            remarks='',
        )
        pm = self._make_pm(self.chinatown)
        pm.job = job
        pm.save(update_fields=['job'])
        self.assertEqual(get_due_groups(now=self._now()), [])

    def test_missing_property_pm_is_not_grouped(self):
        PreventiveMaintenance.objects.create(
            pmtitle='Orphan',
            scheduled_date=self._scheduled(self.run_date),
            created_by=self.user,
        )
        self.assertEqual(get_due_groups(now=self._now()), [])

    def test_utc_clock_uses_bangkok_boundary(self):
        self._make_pm()
        utc_now = self._now().astimezone(datetime_timezone.utc)
        self.assertEqual(len(get_due_groups(now=utc_now)), 1)

    def test_reminder_type_restricts_exactly_one_window(self):
        self._make_pm()
        self._make_pm(day=self.run_date + timedelta(days=1))
        groups = get_due_groups(now=self._now(), reminder_type='day_before')
        self.assertEqual({group['reminder_type'] for group in groups}, {'day_before'})
        self.assertEqual(sum(len(group['tasks']) for group in groups), 1)

    def test_date_override_requires_dry_run_at_command_boundary(self):
        with self.assertRaises(CommandError):
            call_command('send_pm_line_reminders', '--date', '2026-09-14')

    def test_date_override_is_independent_of_current_time(self):
        self._make_pm()
        groups = get_due_groups(now=self._now(8, 59), run_date=self.run_date)
        self.assertEqual(sum(len(group['tasks']) for group in groups), 1)

    @patch('myappLubd.notifications.pm_reminders.send_text_message', return_value=True)
    def test_pending_batch_is_reconciled_after_due_window(self, send):
        self._make_pm()
        with patch(
            'myappLubd.notifications.pm_reminders._mark_batch_delivered',
            side_effect=DatabaseError('simulated commit failure'),
        ):
            with self.assertRaises(DatabaseError):
                send_due_pm_reminders(now=self._now())
        original_request = send.call_args.kwargs.copy()

        send.reset_mock()
        next_day = self.run_date + timedelta(days=1)
        send_due_pm_reminders(
            now=timezone.make_aware(datetime.combine(next_day, time(9)), BANGKOK),
        )

        self.assertEqual(send.call_args.kwargs, original_request)
        self.assertEqual(PMLineReminderDelivery.objects.count(), 1)

    @patch('myappLubd.notifications.pm_reminders.send_text_message')
    def test_expired_pending_retry_key_is_not_resent(self, send):
        pm = self._make_pm()
        batch = PMLineReminderBatch.objects.create(
            property=self.siam,
            reminder_type=PMLineReminderDelivery.SAME_DAY,
            scheduled_date=self.run_date,
            destination_id=self.siam.line_destination_id,
            message_text='immutable old request',
        )
        batch.items.create(
            property=self.siam,
            preventive_maintenance=pm,
            reminder_type=PMLineReminderDelivery.SAME_DAY,
            scheduled_date=self.run_date,
        )
        PMLineReminderBatch.objects.filter(pk=batch.pk).update(
            created_at=timezone.now() - timedelta(hours=24, seconds=1),
        )

        results = send_due_pm_reminders(now=self._now())

        self.assertIn('retry_expired', {result['status'] for result in results})
        send.assert_not_called()
        self.assertFalse(PMLineReminderDelivery.objects.exists())

    def test_huge_pm_list_message_stays_below_transport_limit(self):
        tasks = [
            self._make_pm(title=f'Task {index} ' + ('detail ' * 30))
            for index in range(75)
        ]
        with patch('myappLubd.notifications.pm_reminders._location', return_value='Room 315'):
            message = compose_reminder_message(
                property_obj=self.siam,
                reminder_type=PMLineReminderDelivery.SAME_DAY,
                scheduled_date=self.run_date,
                tasks=tasks,
            )
        self.assertLessEqual(len(message), 4900)
        self.assertIn('more tasks', message)


@override_settings(LINE_CHANNEL_ACCESS_TOKEN='test-token')
class PMLineReminderConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def test_overlapping_executions_share_one_provider_request(self):
        user = User.objects.create_user(username='pm-concurrent-user')
        tenant = Tenant.objects.create(name='PM Concurrent Tenant')
        property_obj = Property.objects.create(
            name='Concurrent Property', tenant=tenant,
            line_notifications_enabled=True, line_destination_id='concurrent-destination',
        )
        run_date = date(2026, 9, 14)
        scheduled = timezone.make_aware(datetime.combine(run_date, time(14)), BANGKOK)
        pm = PreventiveMaintenance.objects.create(
            pmtitle='Concurrent PM', scheduled_date=scheduled, created_by=user,
        )
        machine = Machine.objects.create(
            machine_id='M-CONCURRENT', name='Concurrent machine', property=property_obj,
        )
        pm.machines.add(machine)
        now = timezone.make_aware(datetime.combine(run_date, time(9)), BANGKOK)
        barrier = Barrier(2)
        lock = Lock()
        provider_keys = []
        errors = []

        def provider(**kwargs):
            with lock:
                provider_keys.append(kwargs['retry_key'])
            barrier.wait(timeout=10)
            return True

        def invoke():
            close_old_connections()
            try:
                send_due_pm_reminders(now=now)
            except Exception as exc:  # pragma: no cover - asserted below
                errors.append(exc)
            finally:
                close_old_connections()

        with patch('myappLubd.notifications.pm_reminders.send_text_message', side_effect=provider):
            threads = [Thread(target=invoke), Thread(target=invoke)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=15)

        self.assertFalse(errors)
        self.assertEqual(len(provider_keys), 2)
        self.assertEqual(len(set(provider_keys)), 1)
        self.assertEqual(PMLineReminderDelivery.objects.count(), 1)
