from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from .models import Job, Property, Tenant, TenantMembership
from .tenancy import get_property_summary_recipients


User = get_user_model()


class DailySummaryCommandTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Daily Summary Tenant")
        self.property = Property.objects.create(
            name="Daily Summary Property", tenant=self.tenant
        )
        self.user = User.objects.create_user(
            username="daily-summary-user",
            email="daily-summary-user@example.test",
            password="pw12345!",
        )
        membership = TenantMembership.objects.create(
            user=self.user,
            tenant=self.tenant,
            role="technician",
        )
        membership.properties.add(self.property)
        self.job = Job.objects.create(
            user=self.user,
            property=self.property,
            description="Daily summary test job",
            remarks="",
            status="pending",
            priority="medium",
        )

    def run_command(self, *args):
        output = StringIO()
        call_command("send_daily_summary", *args, stdout=output)
        return output.getvalue()

    @patch("myappLubd.management.commands.send_daily_summary.send_email")
    def test_dry_run_never_calls_transport(self, send_email_mock):
        output = self.run_command("--to", "dry-run@example.test", "--dry-run")

        send_email_mock.assert_not_called()
        self.assertIn("DRY RUN - no email will be sent", output)
        self.assertIn("Recipient count: 1", output)
        self.assertNotIn("dry-run@example.test", output)

    @patch("myappLubd.management.commands.send_daily_summary.send_email", return_value=True)
    def test_normal_execution_calls_transport(self, send_email_mock):
        self.run_command("--to", "normal@example.test")

        send_email_mock.assert_called_once()

    @patch(
        "myappLubd.management.commands.send_daily_summary.Command.get_daily_and_monthly_stats",
        side_effect=RuntimeError("fatal database-style failure"),
    )
    def test_fatal_exception_becomes_command_error(self, _stats_mock):
        with self.assertRaises(CommandError):
            self.run_command("--to", "fatal@example.test")

    @patch("myappLubd.management.commands.send_daily_summary.send_email", return_value=False)
    def test_all_attempted_deliveries_failing_is_nonzero(self, send_email_mock):
        with self.assertRaises(CommandError):
            self.run_command("--to", "failure@example.test")

        send_email_mock.assert_called_once()

    @override_settings(
        DAILY_SUMMARY_RECIPIENTS="first@example.test,second@example.test"
    )
    @patch(
        "myappLubd.management.commands.send_daily_summary.send_email",
        side_effect=[False, True],
    )
    def test_partial_recipient_success_remains_successful(self, send_email_mock):
        output = self.run_command()

        self.assertEqual(send_email_mock.call_count, 2)
        self.assertIn("1/2 recipients", output)

    @patch("myappLubd.management.commands.send_daily_summary.send_email")
    def test_all_properties_dry_run_resolves_property_recipients(self, send_email_mock):
        output = self.run_command("--all-properties", "--dry-run")

        send_email_mock.assert_not_called()
        self.assertIn(f"Property ID: {self.property.id}", output)
        self.assertIn(f"Property name: {self.property.name}", output)
        self.assertIn("Recipient count: 1", output)
        self.assertIn("Jobs created: 1", output)
        self.assertIn("Would send: YES", output)

    @patch("myappLubd.management.commands.send_daily_summary.send_email")
    def test_all_properties_dry_run_preserves_tenant_isolation(self, send_email_mock):
        other_tenant = Tenant.objects.create(name="Other Daily Summary Tenant")
        other_property = Property.objects.create(
            name="Other Daily Summary Property", tenant=other_tenant
        )
        other_user = User.objects.create_user(
            username="other-daily-summary-user",
            email="other-daily-summary-user@example.test",
            password="pw12345!",
        )
        other_membership = TenantMembership.objects.create(
            user=other_user,
            tenant=other_tenant,
            role="technician",
        )
        other_membership.properties.add(other_property)
        Job.objects.create(
            user=other_user,
            property=other_property,
            description="Other tenant daily summary test job",
            remarks="",
            status="pending",
            priority="medium",
        )

        output = self.run_command("--all-properties", "--dry-run")

        send_email_mock.assert_not_called()
        self.assertEqual(output.count("Recipient count: 1"), 2)
        self.assertEqual(
            set(get_property_summary_recipients(self.property)),
            {self.user},
        )
        self.assertEqual(
            set(get_property_summary_recipients(other_property)),
            {other_user},
        )
