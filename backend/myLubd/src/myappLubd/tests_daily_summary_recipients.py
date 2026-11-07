from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import DailySummaryRecipient, EmailDeliveryLog, Job, Property, ScheduledTaskRun, Tenant, TenantMembership


@override_settings(
    MAILERSEND_API_TOKEN='', EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    EMAIL_HOST_USER='test-user', EMAIL_HOST_PASSWORD='test-password',
    DEFAULT_FROM_EMAIL='sender@example.test', DAILY_SUMMARY_RECIPIENTS='',
)
class DailySummaryRecipientTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='recipient-admin', email='admin@example.test', password='test')
        self.tenant = Tenant.objects.create(name='Recipient tenant')
        self.property = Property.objects.create(name='Recipient hotel', tenant=self.tenant)
        member = TenantMembership.objects.create(user=self.admin, tenant=self.tenant, role='owner')
        member.properties.add(self.property)
        Job.objects.create(user=self.admin, property=self.property, description='Recipient report', remarks='')

    def run_summary(self, *args):
        output = StringIO()
        call_command('send_daily_summary', *args, stdout=output)
        return output.getvalue()

    def test_active_additional_recipient_receives_default_summary_and_has_delivery_history(self):
        DailySummaryRecipient.objects.create(email='extra@example.test', name='Operations')
        self.run_summary()
        self.assertEqual({message.to[0] for message in mail.outbox}, {'admin@example.test', 'extra@example.test'})
        self.assertEqual(ScheduledTaskRun.objects.get().sent_count, 2)
        self.assertEqual(EmailDeliveryLog.objects.get(recipient='extra@example.test').status, 'sent')

    def test_disabled_recipient_is_not_added(self):
        DailySummaryRecipient.objects.create(email='disabled@example.test', is_active=False)
        self.run_summary()
        self.assertEqual([message.to[0] for message in mail.outbox], ['admin@example.test'])

    def test_case_insensitive_duplicate_is_sent_only_once(self):
        row = DailySummaryRecipient.objects.create(email='  ADMIN@EXAMPLE.TEST ')
        self.assertEqual(row.email, 'admin@example.test')
        self.run_summary()
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(DAILY_SUMMARY_RECIPIENTS='configured@example.test;EXTRA@example.test')
    def test_admin_recipients_merge_with_environment_and_deduplicate(self):
        DailySummaryRecipient.objects.create(email='extra@example.test')
        self.run_summary()
        self.assertEqual({message.to[0].lower() for message in mail.outbox}, {'configured@example.test', 'extra@example.test'})
        self.assertEqual(len(mail.outbox), 2)

    def test_explicit_to_does_not_include_additional_recipients(self):
        DailySummaryRecipient.objects.create(email='extra@example.test')
        self.run_summary('--to', 'explicit@example.test')
        self.assertEqual([message.to[0] for message in mail.outbox], ['explicit@example.test'])

    def test_excluded_additional_address_does_not_receive(self):
        DailySummaryRecipient.objects.create(email='extra@example.test')
        self.run_summary('--exclude-emails', 'EXTRA@example.test')
        self.assertEqual([message.to[0] for message in mail.outbox], ['admin@example.test'])

    def test_property_report_does_not_include_global_additional_recipients(self):
        DailySummaryRecipient.objects.create(email='extra@example.test')
        self.run_summary('--property-id', str(self.property.pk))
        self.assertNotIn('extra@example.test', {message.to[0] for message in mail.outbox})

    def test_all_properties_reports_do_not_include_global_additional_recipients(self):
        DailySummaryRecipient.objects.create(email='extra@example.test')
        self.run_summary('--all-properties')
        self.assertTrue(mail.outbox)
        self.assertNotIn('extra@example.test', {message.to[0] for message in mail.outbox})

    @patch('myappLubd.management.commands.send_daily_summary.send_email')
    def test_dry_run_includes_recipient_count_without_sending(self, send):
        DailySummaryRecipient.objects.create(email='extra@example.test')
        output = self.run_summary('--dry-run')
        send.assert_not_called()
        self.assertIn('Recipient count: 2', output)
        self.assertFalse(EmailDeliveryLog.objects.exists())

    def test_superuser_can_add_without_sending_immediately(self):
        self.client.force_login(self.admin)
        response = self.client.post(reverse('admin:myappLubd_dailysummaryrecipient_add'), {
            'email': ' Added@Example.Test ', 'name': 'Operations', 'is_active': 'on', '_save': 'Save',
        })
        self.assertEqual(response.status_code, 302)
        self.assertTrue(DailySummaryRecipient.objects.get(email='added@example.test').is_active)
        self.assertFalse(EmailDeliveryLog.objects.exists())
        self.assertEqual(len(getattr(mail, 'outbox', [])), 0)

    def test_admin_validates_address_and_rejects_case_duplicate(self):
        self.client.force_login(self.admin)
        DailySummaryRecipient.objects.create(email='existing@example.test')
        url = reverse('admin:myappLubd_dailysummaryrecipient_add')
        for address in ('invalid', 'EXISTING@EXAMPLE.TEST'):
            response = self.client.post(url, {'email': address, 'name': '', 'is_active': 'on', '_save': 'Save'})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.context['adminform'].form.errors)
        self.assertEqual(DailySummaryRecipient.objects.count(), 1)

    def test_staff_cannot_manage_recipients_even_with_permissions(self):
        staff = get_user_model().objects.create_user(username='recipient-staff', is_staff=True)
        staff.user_permissions.add(*Permission.objects.filter(codename__endswith='dailysummaryrecipient'))
        self.client.force_login(staff)
        self.assertEqual(self.client.get(reverse('admin:myappLubd_dailysummaryrecipient_changelist')).status_code, 403)
        self.assertEqual(self.client.post(reverse('admin:myappLubd_dailysummaryrecipient_add'), {
            'email': 'blocked@example.test', 'is_active': 'on',
        }).status_code, 403)
        self.assertFalse(DailySummaryRecipient.objects.exists())
