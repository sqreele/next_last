from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from .management.commands.send_daily_summary import Command
from .models import Job, Property, Tenant, TenantMembership, Topic
from .timezones import localtime_for


User = get_user_model()


class DailySummaryPropertyIsolationTests(TestCase):
    def setUp(self):
        self.owner_a = self.create_user('a4-owner-a')
        self.owner_b = self.create_user('a4-owner-b')
        self.supervisor_a1 = self.create_user('a4-supervisor-a1')
        self.supervisor_a2 = self.create_user('a4-supervisor-a2')
        self.cross_tenant_user = self.create_user('a4-cross-tenant')

        self.tenant_a = Tenant.objects.create(
            name='A4 Tenant A',
            owner=self.owner_a,
            status='active',
        )
        self.tenant_b = Tenant.objects.create(
            name='A4 Tenant B',
            owner=self.owner_b,
            status='active',
        )
        self.property_a1 = Property.objects.create(
            name='A4 Property A1',
            tenant=self.tenant_a,
        )
        self.property_a2 = Property.objects.create(
            name='A4 Property A2',
            tenant=self.tenant_a,
        )
        self.property_b1 = Property.objects.create(
            name='A4 Property B1',
            tenant=self.tenant_b,
        )

        TenantMembership.objects.create(
            user=self.owner_a,
            tenant=self.tenant_a,
            role='owner',
        )
        TenantMembership.objects.create(
            user=self.owner_b,
            tenant=self.tenant_b,
            role='owner',
        )
        membership_a1 = TenantMembership.objects.create(
            user=self.supervisor_a1,
            tenant=self.tenant_a,
            role='supervisor',
        )
        membership_a1.properties.add(self.property_a1)
        membership_a2 = TenantMembership.objects.create(
            user=self.supervisor_a2,
            tenant=self.tenant_a,
            role='supervisor',
        )
        membership_a2.properties.add(self.property_a2)

        # Deliberately reproduce an invalid legacy cross-tenant M2M row. It
        # must never grant delivery rights to the foreign Property summary.
        invalid_membership = TenantMembership.objects.create(
            user=self.cross_tenant_user,
            tenant=self.tenant_b,
            role='supervisor',
        )
        invalid_membership.properties.add(self.property_a1)

        self.topic_a1 = Topic.objects.create(title='A4-A1-TOPIC-ONLY')
        self.topic_a2 = Topic.objects.create(title='A4-A2-FOREIGN-TOPIC')
        self.topic_b1 = Topic.objects.create(title='A4-B1-FOREIGN-TOPIC')

        self.create_jobs(
            self.property_a1,
            completed=2,
            pending=1,
            topic=self.topic_a1,
        )

    def create_user(self, username):
        return User.objects.create_user(
            username=username,
            email=f'{username}@example.com',
            password='pw12345!',
        )

    def create_jobs(self, property_obj, *, completed, pending, topic):
        for index in range(completed):
            job = Job.objects.create(
                user=self.owner_a if property_obj.tenant_id == self.tenant_a.pk else self.owner_b,
                property=property_obj,
                description=f'{property_obj.name} completed {index}',
                status='completed',
            )
            job.topics.add(topic)
        for index in range(pending):
            job = Job.objects.create(
                user=self.owner_a if property_obj.tenant_id == self.tenant_a.pk else self.owner_b,
                property=property_obj,
                description=f'{property_obj.name} pending {index}',
                status='pending',
            )
            job.topics.add(topic)

    def add_foreign_property_jobs(self):
        self.create_jobs(
            self.property_a2,
            completed=5,
            pending=3,
            topic=self.topic_a2,
        )
        self.create_jobs(
            self.property_b1,
            completed=11,
            pending=7,
            topic=self.topic_b1,
        )

    def test_every_property_metric_is_invariant_to_foreign_jobs(self):
        command = Command()
        now = localtime_for(self.property_a1)
        before = command.build_property_summary(self.property_a1, now)

        self.add_foreign_property_jobs()
        after = command.build_property_summary(self.property_a1, now)

        self.assertEqual(after, before)
        self.assertEqual(after['total_created'], 3)
        self.assertEqual(after['completed_today'], 2)
        self.assertEqual(after['status_counts']['completed'], 2)
        self.assertEqual(after['status_counts']['pending'], 1)
        self.assertEqual(after['monthly_stats']['total_created_this_month'], 3)
        self.assertEqual(after['monthly_stats']['total_completed_this_month'], 2)
        self.assertEqual(after['topic_stats']['total_unique_topics_today'], 1)
        self.assertEqual(after['topic_stats']['total_unique_topics_month'], 1)
        self.assertEqual(after['topic_stats']['total_topic_assignments_today'], 3)
        self.assertEqual(after['topic_stats']['total_topic_assignments_month'], 3)
        self.assertEqual(
            after['topic_stats']['today_topics'],
            [{'title': self.topic_a1.title, 'count': 3}],
        )
        self.assertEqual(
            after['topic_stats']['monthly_topics'],
            [{'title': self.topic_a1.title, 'count': 3}],
        )

    @override_settings(DAILY_SUMMARY_RECIPIENTS='platform-summary@example.com')
    @patch('myappLubd.management.commands.send_daily_summary.send_email', return_value=True)
    def test_single_property_payload_and_recipients_are_isolated(self, send_email):
        self.add_foreign_property_jobs()

        call_command(
            'send_daily_summary',
            property_id=self.property_a1.property_id,
        )

        self.assertEqual(send_email.call_count, 2)
        recipients = {
            call.kwargs['to_email']
            for call in send_email.call_args_list
        }
        self.assertEqual(
            recipients,
            {self.owner_a.email, self.supervisor_a1.email},
        )
        self.assertNotIn(self.supervisor_a2.email, recipients)
        self.assertNotIn(self.cross_tenant_user.email, recipients)
        self.assertNotIn('platform-summary@example.com', recipients)

        for email_call in send_email.call_args_list:
            subject = email_call.kwargs['subject']
            body = email_call.kwargs['body']
            html_body = email_call.kwargs['html_body']
            self.assertIn(self.property_a1.name, subject)
            self.assertNotIn(self.property_a2.name, subject)
            self.assertNotIn(self.property_b1.name, subject)
            self.assertIn('Total jobs created today: 3', body)
            self.assertIn('Total jobs completed today: 2', body)
            self.assertIn('Total jobs created this month: 3', body)
            self.assertIn('Total jobs completed this month: 2', body)
            self.assertIn(self.topic_a1.title, body)
            self.assertIn(self.topic_a1.title, html_body)
            self.assertNotIn(self.topic_a2.title, body + html_body)
            self.assertNotIn(self.topic_b1.title, body + html_body)

    @patch('myappLubd.management.commands.send_daily_summary.send_email', return_value=True)
    def test_all_properties_builds_independent_payloads_and_recipients(self, send_email):
        self.add_foreign_property_jobs()

        call_command('send_daily_summary', all_properties=True)

        messages_by_property = {
            property_obj.name: [
                call.kwargs
                for call in send_email.call_args_list
                if property_obj.name in call.kwargs['subject']
            ]
            for property_obj in (
                self.property_a1,
                self.property_a2,
                self.property_b1,
            )
        }
        self.assertEqual(
            {message['to_email'] for message in messages_by_property[self.property_a1.name]},
            {self.owner_a.email, self.supervisor_a1.email},
        )
        self.assertEqual(
            {message['to_email'] for message in messages_by_property[self.property_a2.name]},
            {self.owner_a.email, self.supervisor_a2.email},
        )
        self.assertEqual(
            {message['to_email'] for message in messages_by_property[self.property_b1.name]},
            {self.owner_b.email},
        )

        expected = {
            self.property_a1.name: (self.topic_a1.title, '2'),
            self.property_a2.name: (self.topic_a2.title, '5'),
            self.property_b1.name: (self.topic_b1.title, '11'),
        }
        all_topics = {self.topic_a1.title, self.topic_a2.title, self.topic_b1.title}
        for property_name, messages in messages_by_property.items():
            expected_topic, completed_count = expected[property_name]
            self.assertTrue(messages)
            for message in messages:
                payload = message['body'] + message['html_body']
                self.assertIn(expected_topic, payload)
                for foreign_topic in all_topics - {expected_topic}:
                    self.assertNotIn(foreign_topic, payload)
                self.assertIn(
                    f'>Completed This Month</div>',
                    message['html_body'],
                )
                self.assertIn(
                    f'>{completed_count}</div>',
                    message['html_body'],
                )

    @patch('myappLubd.management.commands.send_daily_summary.send_email')
    def test_invalid_property_fails_closed_without_sending(self, send_email):
        with self.assertRaises(CommandError):
            call_command('send_daily_summary', property_id='P-NOT-FOUND')

        send_email.assert_not_called()

    @override_settings(DAILY_SUMMARY_RECIPIENTS='platform-summary@example.com')
    @patch('myappLubd.management.commands.send_daily_summary.send_email', return_value=True)
    def test_default_mode_remains_separate_global_admin_report(self, send_email):
        self.add_foreign_property_jobs()

        call_command('send_daily_summary')

        send_email.assert_called_once()
        message = send_email.call_args.kwargs
        self.assertEqual(message['to_email'], 'platform-summary@example.com')
        self.assertNotIn('Property:', message['body'])
        self.assertIn('Total jobs completed this month: 18', message['body'])
