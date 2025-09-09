import logging
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings

from myappLubd.models import Job
from myappLubd.email_utils import send_email


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send daily maintenance notification summary via email"

    def add_arguments(self, parser):
        parser.add_argument(
            "--to",
            dest="to_email",
            default=None,
            help="Recipient email address. Defaults to SERVER_EMAIL or DEFAULT_FROM_EMAIL.",
        )

    def handle(self, *args, **options):
        try:
            # Use Asia/Bangkok timezone as configured
            now = timezone.localtime()

            # Define the 24-hour window for the day that just ended at 23:00
            # but since we run at 23:00, we summarize the current day 00:00 -> 23:00
            start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_window = now.replace(minute=59, second=59, microsecond=999999)

            # Aggregate Job status counts for today
            jobs_today = Job.objects.filter(created_at__range=(start_of_day, end_of_window))
            total_created = jobs_today.count()
            status_counts = {
                status_key: jobs_today.filter(status=status_key).count()
                for status_key, _ in Job.STATUS_CHOICES
            }

            completed_today = Job.objects.filter(
                completed_at__range=(start_of_day, end_of_window)
            ).count()

            # Compose email
            subject = f"Daily Maintenance Summary - {now.strftime('%Y-%m-%d')}"

            lines = [
                f"Date: {now.strftime('%Y-%m-%d')} (Asia/Bangkok)",
                "",
                f"Total jobs created today: {total_created}",
                f"Total jobs completed today: {completed_today}",
                "",
                "Breakdown by status (created today):",
            ]

            for key, label in Job.STATUS_CHOICES:
                lines.append(f"- {label}: {status_counts.get(key, 0)}")

            body = "\n".join(lines)

            # Determine recipient
            to_email = options.get("to_email") or getattr(settings, "SERVER_EMAIL", None) or getattr(
                settings, "DEFAULT_FROM_EMAIL", None
            )

            if not to_email:
                logger.error("No recipient email configured. Set SERVER_EMAIL or DEFAULT_FROM_EMAIL or pass --to.")
                self.stdout.write(self.style.ERROR("No recipient email configured"))
                return

            success = send_email(to_email=to_email, subject=subject, body=body)
            if success:
                self.stdout.write(self.style.SUCCESS(f"Daily summary email sent to {to_email}"))
            else:
                self.stdout.write(self.style.ERROR("Failed to send daily summary email"))
        except Exception as exc:
            logger.exception("Error while sending daily summary email: %s", exc)
            self.stdout.write(self.style.ERROR(f"Error: {exc}"))

