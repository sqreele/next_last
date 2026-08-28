import inspect
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.db.models import Q
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from .email_utils import normalize_email_addresses, send_email
from .management.commands.send_daily_summary import Command as DailyCommand
from .management.commands.send_pending_jobs_summary import Command as PendingCommand
from .management.commands.send_property_jobs_summary import Command as PropertyCommand
from .management.commands.send_user_property_jobs import Command as UserPropertyCommand
from .models import Job, Property, Tenant, TenantMembership, UserProfile
from .tenancy import (
    get_property_summary_email_users,
    get_property_summary_recipients,
)
from .timezones import localtime_for


User = get_user_model()


class SummaryCommandFixture(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Summary Tenant A')
        self.other_tenant = Tenant.objects.create(name='Summary Tenant B')
        self.property = Property.objects.create(
            name='Summary Property A1', tenant=self.tenant
        )
        self.second_property = Property.objects.create(
            name='Summary Property A2', tenant=self.tenant
        )
        self.other_property = Property.objects.create(
            name='Summary Property B1', tenant=self.other_tenant
        )

    def make_user(
        self,
        name,
        *,
        role='technician',
        tenant=None,
        properties=(),
        membership_active=True,
        user_active=True,
        notifications=True,
        email=None,
    ):
        user = User.objects.create_user(
            username=name,
            email=email or f'{name}@example.test',
            password='pw12345!',
            is_active=user_active,
        )
        membership = TenantMembership.objects.create(
            user=user,
            tenant=tenant or self.tenant,
            role=role,
            is_active=membership_active,
        )
        if properties:
            membership.properties.add(*properties)
        UserProfile.objects.update_or_create(
            user=user,
            defaults={'email_notifications_enabled': notifications},
        )
        return user, membership

    def make_job(self, user, property_obj=None, **overrides):
        values = {
            'user': user,
            'property': property_obj or self.property,
            'description': 'Summary regression job',
            'remarks': '',
            'status': 'pending',
            'priority': 'medium',
        }
        values.update(overrides)
        return Job.objects.create(**values)


class TestSummaryRecipientAuthorization(SummaryCommandFixture):
    def test_roles_memberships_preferences_and_legacy_profile_are_canonical(self):
        tenant_wide = {}
        for role in ('owner', 'admin', 'manager'):
            tenant_wide[role], _ = self.make_user(f'{role}-wide', role=role)

        scoped = {}
        for role in ('supervisor', 'technician', 'viewer'):
            scoped[role], _ = self.make_user(
                f'{role}-scoped', role=role, properties=(self.property,)
            )

        billing, _ = self.make_user(
            'billing-scoped', role='billing', properties=(self.property,)
        )
        inactive_membership, _ = self.make_user(
            'inactive-membership',
            properties=(self.property,),
            membership_active=False,
        )
        inactive_user, _ = self.make_user(
            'inactive-user', properties=(self.property,), user_active=False
        )
        opted_out, _ = self.make_user(
            'opted-out', properties=(self.property,), notifications=False
        )

        cross_tenant, cross_membership = self.make_user(
            'cross-tenant', tenant=self.other_tenant
        )
        cross_membership.properties.add(self.property)

        legacy_only = User.objects.create_user(
            username='legacy-profile-only',
            email='legacy-profile-only@example.test',
            password='pw12345!',
        )
        UserProfile.objects.update_or_create(
            user=legacy_only,
            defaults={
                'property_id': self.property.property_id,
                'email_notifications_enabled': True,
            },
        )

        recipients = set(get_property_summary_email_users(self.property))
        second_recipients = set(
            get_property_summary_email_users(self.second_property)
        )

        self.assertTrue(set(tenant_wide.values()).issubset(recipients))
        self.assertTrue(set(tenant_wide.values()).issubset(second_recipients))
        self.assertTrue(set(scoped.values()).issubset(recipients))
        self.assertTrue(set(scoped.values()).isdisjoint(second_recipients))
        self.assertIn(billing, recipients)
        self.assertNotIn(billing, second_recipients)
        self.assertNotIn(inactive_membership, recipients)
        self.assertNotIn(inactive_user, recipients)
        self.assertNotIn(opted_out, recipients)
        self.assertNotIn(cross_tenant, recipients)
        self.assertNotIn(legacy_only, recipients)
        self.assertNotIn(
            cross_tenant, set(get_property_summary_recipients(self.property))
        )

    def test_email_normalization_rejects_objects_blanks_and_invalid_values(self):
        user, _ = self.make_user('recipient-object', properties=(self.property,))
        self.assertEqual(
            normalize_email_addresses(
                [' Valid@Example.test ', 'valid@example.test', '', None, user, 'bad']
            ),
            ['Valid@Example.test'],
        )


class TestDailySummaryRegression(SummaryCommandFixture):
    def setUp(self):
        super().setUp()
        self.user, _ = self.make_user(
            'daily-assignee', properties=(self.property, self.second_property)
        )

    def test_monthly_completed_total_is_property_scoped(self):
        now = localtime_for(self.property)
        self.make_job(
            self.user,
            self.property,
            status='completed',
            completed_at=now,
        )
        self.make_job(
            self.user,
            self.second_property,
            status='completed',
            completed_at=now,
        )

        stats = DailyCommand().get_daily_and_monthly_stats(
            now, Q(property=self.property)
        )

        self.assertEqual(stats['total_completed_this_month'], 1)

    @patch('myappLubd.management.commands.send_daily_summary.send_email')
    def test_dry_run_never_calls_transport(self, transport):
        self.make_job(self.user)
        output = StringIO()

        call_command(
            'send_daily_summary', '--all-properties', '--dry-run', stdout=output
        )

        transport.assert_not_called()
        self.assertIn('DRY RUN - no email will be sent', output.getvalue())


class TestPendingSummaryRegression(SummaryCommandFixture):
    def setUp(self):
        super().setUp()
        self.user, _ = self.make_user(
            'pending-assignee', properties=(self.property,)
        )

    def test_pending_scope_window_statuses_and_canonical_property(self):
        expected = {
            self.make_job(self.user, status=status).pk
            for status in ('pending', 'in_progress', 'waiting_sparepart')
        }
        self.make_job(self.user, status='completed')
        old = self.make_job(self.user, status='pending')
        Job.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=31)
        )

        command = PendingCommand()
        jobs = command.get_pending_jobs(self.property.id, days=30)
        details = command.get_job_details_with_images(
            jobs, include_images=False
        )

        self.assertEqual(set(jobs.values_list('pk', flat=True)), expected)
        self.assertTrue(
            all(item['properties'] == [self.property.name] for item in details)
        )
        self.assertNotIn('rooms__jobs', inspect.getsource(PendingCommand))

    @patch('myappLubd.management.commands.send_pending_jobs_summary.send_email')
    def test_dry_run_never_calls_transport(self, transport):
        self.make_job(self.user)
        output = StringIO()
        call_command(
            'send_pending_jobs_summary',
            '--all-properties',
            '--dry-run',
            stdout=output,
        )
        transport.assert_not_called()
        self.assertIn('Jobs selected: 1', output.getvalue())

    @patch.object(PendingCommand, 'get_pending_jobs', side_effect=RuntimeError('db'))
    def test_database_failure_is_nonzero(self, _failure):
        with self.assertRaises(CommandError):
            call_command(
                'send_pending_jobs_summary', '--all-properties', '--dry-run'
            )

    @patch(
        'myappLubd.management.commands.send_pending_jobs_summary.send_email',
        return_value=False,
    )
    def test_complete_transport_failure_is_nonzero(self, transport):
        self.make_job(self.user)
        with self.assertRaises(CommandError):
            call_command(
                'send_pending_jobs_summary',
                '--property-id',
                str(self.property.id),
                '--to',
                'operator@example.test',
            )
        transport.assert_called_once()


class TestPropertySummaryRegression(SummaryCommandFixture):
    def setUp(self):
        super().setUp()
        self.user, _ = self.make_user(
            'property-recipient', properties=(self.property,)
        )
        self.job = self.make_job(self.user)

    def test_rolling_scope_and_recent_job_use_canonical_property(self):
        other_user, _ = self.make_user(
            'other-property-user', properties=(self.second_property,)
        )
        self.make_job(other_user, self.second_property)
        old = self.make_job(self.user)
        Job.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=8)
        )

        stats = PropertyCommand().get_property_job_statistics(
            self.property.id, days=7
        )

        self.assertEqual(stats['total_jobs'], 1)
        self.assertEqual(
            stats['recent_jobs'][0]['properties'], [self.property.name]
        )
        self.assertNotIn('rooms__jobs', inspect.getsource(PropertyCommand))

    @patch(
        'myappLubd.management.commands.send_property_jobs_summary.send_email',
        return_value=True,
    )
    def test_all_properties_passes_email_strings_not_users(self, transport):
        call_command('send_property_jobs_summary', '--all-properties')

        self.assertGreater(transport.call_count, 0)
        for call in transport.call_args_list:
            recipient = call.kwargs['to_email']
            self.assertIsInstance(recipient, str)
            self.assertIn('@', recipient)

    @patch('myappLubd.management.commands.send_property_jobs_summary.send_email')
    def test_dry_run_never_calls_transport(self, transport):
        output = StringIO()
        call_command(
            'send_property_jobs_summary',
            '--all-properties',
            '--dry-run',
            stdout=output,
        )
        transport.assert_not_called()
        self.assertIn('Jobs selected: 1', output.getvalue())

    @patch(
        'myappLubd.management.commands.send_property_jobs_summary.send_email',
        return_value=False,
    )
    def test_complete_transport_failure_is_nonzero(self, transport):
        with self.assertRaises(CommandError):
            call_command(
                'send_property_jobs_summary',
                '--property-id',
                str(self.property.id),
                '--to',
                'operator@example.test',
            )
        transport.assert_called_once()


class TestUserPropertySummaryRegression(SummaryCommandFixture):
    def setUp(self):
        super().setUp()
        self.user, _ = self.make_user(
            'assigned-user', properties=(self.property,)
        )
        self.other_user, _ = self.make_user(
            'other-assigned-user', properties=(self.property,)
        )
        self.user_job = self.make_job(self.user)
        self.other_job = self.make_job(self.other_user)

    def test_only_current_assignees_jobs_are_selected(self):
        jobs = UserPropertyCommand().get_user_property_jobs(
            self.user, self.property.id, days=7
        )

        self.assertEqual(set(jobs), {self.user_job})
        self.assertNotIn(self.other_job, jobs)

    @patch('myappLubd.management.commands.send_user_property_jobs.send_email')
    def test_dry_run_never_calls_transport(self, transport):
        output = StringIO()
        call_command(
            'send_user_property_jobs',
            '--all-properties',
            '--dry-run',
            stdout=output,
        )
        transport.assert_not_called()
        self.assertIn('Assigned jobs selected: 2', output.getvalue())

    @patch(
        'myappLubd.management.commands.send_user_property_jobs.send_email',
        return_value=False,
    )
    def test_complete_transport_failure_is_nonzero(self, transport):
        with self.assertRaises(CommandError):
            call_command(
                'send_user_property_jobs',
                '--property-id',
                str(self.property.id),
                '--user-id',
                str(self.user.id),
            )
        transport.assert_called_once()


class TestEmailTransportValidation(SimpleTestCase):
    @override_settings(
        EMAIL_HOST_USER='configured@example.test',
        EMAIL_HOST_PASSWORD='secret-placeholder',
    )
    @patch('django.core.mail.send_mail')
    @patch('myappLubd.email_utils._build_gmail_service')
    def test_invalid_recipient_never_reaches_transport_or_logs_identity(
        self, gmail_service, smtp_send
    ):
        with self.assertLogs('myappLubd.email_utils', level='WARNING') as logs:
            result = send_email('invalid-recipient', 'subject', 'body')

        self.assertFalse(result)
        gmail_service.assert_not_called()
        smtp_send.assert_not_called()
        self.assertNotIn('invalid-recipient', '\n'.join(logs.output))
