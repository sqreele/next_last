from io import StringIO
import os
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core import mail
from django.core.management import call_command
from django.db import OperationalError
from django.test import TestCase, override_settings
from django.urls import reverse

from .email_utils import send_email
from .models import EmailDeliveryLog, ScheduledTaskRun, Property, Tenant
from .operations_monitoring import cron_snapshot, monitored_task


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    EMAIL_HOST_USER='test-sender', EMAIL_HOST_PASSWORD='test-password',
    MAILERSEND_API_TOKEN='', DEFAULT_FROM_EMAIL='sender@example.test',
)
class MonitoringDeliveryTests(TestCase):
    def test_success_records_metadata_without_body(self):
        prop = Property.objects.create(name='Log property', tenant=Tenant.objects.create(name='Log tenant'))
        self.assertTrue(send_email('recipient@example.test', 'Inspection report', 'PRIVATE BODY', property_id=prop.pk))
        delivery = EmailDeliveryLog.objects.get()
        self.assertEqual(delivery.recipient, 'recipient@example.test')
        self.assertEqual(delivery.status, 'sent')
        self.assertEqual(delivery.provider, 'smtp')
        self.assertEqual(delivery.property, prop)
        self.assertIsNotNone(delivery.finished_at)
        self.assertNotIn('PRIVATE BODY', str(delivery.__dict__))
        self.assertEqual(len(mail.outbox), 1)

    @patch('myappLubd.email_utils.EmailMultiAlternatives.send', side_effect=RuntimeError('secret-password'))
    def test_failure_records_only_error_class(self, transport):
        self.assertFalse(send_email('recipient@example.test', 'Report', 'Body'))
        delivery = EmailDeliveryLog.objects.get()
        self.assertEqual(delivery.status, 'failed')
        self.assertEqual(delivery.error_code, 'RuntimeError')
        self.assertNotIn('secret-password', str(delivery.__dict__))

    def test_invalid_recipient_is_recorded_as_failure(self):
        self.assertFalse(send_email('invalid', 'Report', 'Body'))
        self.assertEqual(EmailDeliveryLog.objects.get().error_code, 'invalid_recipient')

    @override_settings(EMAIL_HOST_USER='', EMAIL_HOST_PASSWORD='')
    @patch.dict(os.environ, {'EMAIL_REQUIRE_AUTH': 'True'})
    def test_missing_smtp_auth_has_actionable_error_code(self):
        self.assertFalse(send_email('recipient@example.test', 'Report', 'Body'))
        self.assertEqual(EmailDeliveryLog.objects.get().error_code, 'smtp_auth_not_configured')

    @override_settings(MAILERSEND_API_TOKEN='private-api-key')
    @patch('myappLubd.email_utils.requests.post')
    def test_provider_message_id_and_status_are_recorded(self, post):
        post.return_value.status_code = 202
        post.return_value.headers = {'X-Message-Id': 'message-123'}
        self.assertTrue(send_email('recipient@example.test', 'Report', 'Body'))
        delivery = EmailDeliveryLog.objects.get()
        self.assertEqual(delivery.provider, 'mailersend')
        self.assertEqual(delivery.http_status, 202)
        self.assertEqual(delivery.provider_message_id, 'message-123')
        self.assertNotIn('private-api-key', str(delivery.__dict__))

    @override_settings(MAILERSEND_API_TOKEN='private-api-key')
    @patch('myappLubd.email_utils.requests.post')
    def test_provider_failure_then_smtp_success_is_not_marked_failed(self, post):
        post.return_value.status_code = 500
        post.return_value.headers = {}
        post.return_value.json.return_value = {'message': 'Provider error'}
        self.assertTrue(send_email('recipient@example.test', 'Report', 'Body'))
        delivery = EmailDeliveryLog.objects.get()
        self.assertEqual(delivery.status, 'sent')
        self.assertEqual(delivery.provider, 'smtp')
        self.assertEqual(delivery.error_code, '')
        self.assertIsNone(delivery.http_status)

    @patch('myappLubd.models.EmailDeliveryLog.objects.create', side_effect=OperationalError('log table unavailable'))
    def test_logging_failure_does_not_prevent_delivery(self, create):
        self.assertTrue(send_email('recipient@example.test', 'Report', 'Body'))
        self.assertEqual(len(mail.outbox), 1)

    @patch('myappLubd.models.EmailDeliveryLog.objects.filter')
    def test_log_update_failure_does_not_turn_sent_email_into_failure(self, query):
        query.return_value.update.side_effect = OperationalError('log update failed')
        self.assertTrue(send_email('recipient@example.test', 'Report', 'Body'))
        self.assertEqual(len(mail.outbox), 1)

    @patch('myappLubd.email_utils.EmailMultiAlternatives.send', side_effect=[1, 0])
    @patch.dict(os.environ, {'SCHEDULED_TASK_SOURCE': 'cron'})
    def test_partial_run_counts_and_delivery_links(self, transport):
        @monitored_task('send_daily_summary')
        def run(command, **options):
            send_email('first@example.test', 'Report', 'Body')
            send_email('second@example.test', 'Report', 'Body')
        run(None)
        history = ScheduledTaskRun.objects.get()
        self.assertEqual(history.status, 'partial')
        self.assertEqual(history.source, 'cron')
        self.assertEqual((history.attempted_count, history.sent_count, history.failed_count), (2, 1, 1))
        self.assertEqual(history.deliveries.count(), 2)
        self.assertIsNotNone(history.finished_at)
        # After the task ends, ordinary mail must not inherit its task context.
        with patch('myappLubd.email_utils.EmailMultiAlternatives.send', return_value=1):
            send_email('outside@example.test', 'Report', 'Body')
        self.assertIsNone(EmailDeliveryLog.objects.get(recipient='outside@example.test').run_id)

    def test_command_failure_is_preserved_and_recorded(self):
        @monitored_task('send_daily_summary')
        def run(command, **options):
            raise RuntimeError('do-not-store-this-message')
        with self.assertRaises(RuntimeError):
            run(None)
        history = ScheduledTaskRun.objects.get()
        self.assertEqual(history.status, 'failed')
        self.assertEqual(history.error_code, 'RuntimeError')
        self.assertNotIn('do-not-store', str(history.__dict__))

    def test_no_email_run_is_distinct_from_sent(self):
        @monitored_task('send_daily_summary')
        def run(command, **options):
            return
        run(None)
        history = ScheduledTaskRun.objects.get()
        self.assertEqual(history.status, 'skipped')
        self.assertEqual(history.sent_count, 0)

    def test_daily_summary_dry_run_is_logged_without_delivery(self):
        call_command('send_daily_summary', '--to', 'preview@example.test', '--dry-run', stdout=StringIO())
        self.assertEqual(ScheduledTaskRun.objects.get().status, 'dry_run')
        self.assertFalse(EmailDeliveryLog.objects.exists())
        self.assertEqual(len(getattr(mail, 'outbox', [])), 0)

    def test_daily_summary_records_real_transport_result(self):
        call_command('send_daily_summary', '--to', 'recipient@example.test', stdout=StringIO())
        history = ScheduledTaskRun.objects.get()
        self.assertEqual(history.status, 'succeeded')
        self.assertEqual((history.attempted_count, history.sent_count), (1, 1))
        self.assertEqual(history.deliveries.get().recipient, 'recipient@example.test')

    def test_dry_run_guard_prevents_accidental_send_even_when_history_unavailable(self):
        @monitored_task('send_daily_summary')
        def run(command, **options):
            send_email('recipient@example.test', 'Report', 'Body')
        with patch('myappLubd.models.ScheduledTaskRun.objects.create', side_effect=OperationalError):
            with self.assertRaises(RuntimeError):
                run(None, dry_run=True)
        self.assertFalse(EmailDeliveryLog.objects.exists())
        self.assertEqual(len(getattr(mail, 'outbox', [])), 0)


class MonitoringAdminTests(TestCase):
    def setUp(self):
        self.superuser = get_user_model().objects.create_superuser(username='monitor-admin', email='admin@example.test', password='test')
        self.staff = get_user_model().objects.create_user(username='monitor-staff', is_staff=True)
        self.staff.user_permissions.add(*Permission.objects.filter(codename__in=['view_scheduledtaskrun', 'view_emaildeliverylog']))
        self.run = ScheduledTaskRun.objects.create(task_name='send_daily_summary', source='cron', status='succeeded')
        self.email = EmailDeliveryLog.objects.create(run=self.run, recipient='recipient@example.test', subject='Report', status='sent')
        self.run_url = reverse('admin:myappLubd_scheduledtaskrun_changelist')
        self.email_url = reverse('admin:myappLubd_emaildeliverylog_changelist')

    @patch('myappLubd.admin_monitoring.cron_snapshot', return_value={'daemon_running': True, 'schedules': {'send_daily_summary': '0 23 * * *'}, 'timezone': 'Asia/Bangkok'})
    def test_superuser_sees_dashboard_and_email_history(self, snapshot):
        self.client.force_login(self.superuser)
        response = self.client.get(self.run_url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Cron daemon')
        self.assertContains(response, '0 23 * * *')
        self.assertContains(response, 'does not confirm inbox delivery')
        response = self.client.get(self.email_url, {'run__id__exact': self.run.pk})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'recipient@example.test')
        index = self.client.get(reverse('admin:index'))
        self.assertContains(index, 'Cron &amp; email status')

    def test_staff_cannot_read_global_operational_history_even_with_model_permissions(self):
        self.client.force_login(self.staff)
        self.assertEqual(self.client.get(self.run_url).status_code, 403)
        self.assertEqual(self.client.get(self.email_url).status_code, 403)

    def test_history_cannot_be_added_changed_or_deleted(self):
        self.client.force_login(self.superuser)
        for model, pk in [('scheduledtaskrun', self.run.pk), ('emaildeliverylog', self.email.pk)]:
            self.assertEqual(self.client.get(reverse(f'admin:myappLubd_{model}_add')).status_code, 403)
            self.assertEqual(self.client.post(reverse(f'admin:myappLubd_{model}_change', args=[pk]), {'status': 'failed'}).status_code, 403)
            self.assertEqual(self.client.post(reverse(f'admin:myappLubd_{model}_delete', args=[pk]), {'post': 'yes'}).status_code, 403)

    def test_email_admin_escapes_subject(self):
        self.email.subject = '<script>alert(1)</script>'
        self.email.save()
        self.client.force_login(self.superuser)
        response = self.client.get(self.email_url)
        self.assertContains(response, '&lt;script&gt;')
        self.assertNotContains(response, '<script>alert(1)</script>')

    def test_manual_run_does_not_replace_last_cron_run(self):
        ScheduledTaskRun.objects.create(task_name='send_daily_summary', source='manual', status='dry_run', dry_run=True)
        self.client.force_login(self.superuser)
        response = self.client.get(self.run_url)
        task = next(item for item in response.context['monitored_tasks'] if item['name'] == 'send_daily_summary')
        self.assertEqual(task['last_cron_run'].pk, self.run.pk)


class CronSnapshotTests(TestCase):
    def test_reads_only_schedules_and_process_names(self):
        files = {
            '/proc/10/comm': 'cron\n',
            '/etc/cron.d/daily_summary': 'CRON_TZ=Asia/Bangkok\n0 23 * * * root . /run/private.env && SCHEDULED_TASK_SOURCE=cron python manage.py send_daily_summary >> /var/log/cron.log\n',
        }
        def read(path, *args, **kwargs):
            if str(path) not in files:
                raise FileNotFoundError
            return files[str(path)]
        with patch.object(Path, 'iterdir', return_value=[Path('/proc/10')]), patch.object(Path, 'read_text', autospec=True, side_effect=read):
            result = cron_snapshot()
        self.assertTrue(result['daemon_running'])
        self.assertEqual(result['schedules'], {'send_daily_summary': '0 23 * * *'})
        self.assertEqual(result['timezone'], 'Asia/Bangkok')
        self.assertNotIn('private.env', str(result))
