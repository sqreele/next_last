import logging
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from django.template.loader import render_to_string

from django.contrib.auth import get_user_model
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
        parser.add_argument(
            "--all-users",
            action="store_true",
            dest="all_users",
            help="Send to all active users with an email (default sends to active staff only)",
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

            # Plain-text fallback body
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

            # HTML body using template
            status_list = [
                {
                    "label": label,
                    "count": status_counts.get(key, 0),
                }
                for key, label in Job.STATUS_CHOICES
            ]
            context = {
                "date_str": now.strftime('%Y-%m-%d'),
                "timezone_label": "Asia/Bangkok",
                "total_created": total_created,
                "completed_today": completed_today,
                "status_list": status_list,
                "brand_name": "PCMS",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://pcms.live"),
            }
            html_body = render_to_string("emails/daily_summary.html", context)

            # Determine recipients
            explicit_to = options.get("to_email")
            recipients = []

            if explicit_to:
                recipients = [explicit_to]
            else:
                User = get_user_model()
                if options.get("all_users"):
                    users_qs = User.objects.filter(is_active=True).exclude(email__isnull=True).exclude(email__exact="")
                else:
                    users_qs = (
                        User.objects.filter(is_active=True, is_staff=True)
                        .exclude(email__isnull=True)
                        .exclude(email__exact="")
                    )
                recipients = list(users_qs.values_list("email", flat=True))

                if not recipients:
                    fallback = getattr(settings, "SERVER_EMAIL", None) or getattr(settings, "DEFAULT_FROM_EMAIL", None)
                    if fallback:
                        recipients = [fallback]

            if not recipients:
                logger.error("No recipient email addresses found.")
                self.stdout.write(self.style.ERROR("No recipient email addresses found"))
                return

            sent_count = 0
            for to_email in recipients:
                success = send_email(to_email=to_email, subject=subject, body=body, html_body=html_body)
                if success:
                    sent_count += 1
                    logger.info("Daily summary email sent to %s", to_email)
                else:
                    logger.error("Failed to send daily summary email to %s", to_email)

            if sent_count:
                self.stdout.write(self.style.SUCCESS(f"Daily summary email sent to {sent_count}/{len(recipients)} recipients"))
            else:
                self.stdout.write(self.style.ERROR("Failed to send daily summary email to all recipients"))
        except Exception as exc:
            logger.exception("Error while sending daily summary email: %s", exc)
            self.stdout.write(self.style.ERROR(f"Error: {exc}"))

