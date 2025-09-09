import logging
from django.core.management.base import BaseCommand
from django.conf import settings
from myappLubd.email_utils import send_email


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send a test email to verify email configuration"

    def add_arguments(self, parser):
        parser.add_argument("to", nargs="?", default=None, help="Recipient email address")
        parser.add_argument("--subject", default="Test Email", help="Email subject")
        parser.add_argument("--body", default="Hello from PCMS test email.", help="Email body")

    def handle(self, *args, **options):
        to_email = options.get("to") or getattr(settings, "SERVER_EMAIL", None) or getattr(settings, "DEFAULT_FROM_EMAIL", None)
        if not to_email:
            self.stdout.write(self.style.ERROR("No recipient specified and no SERVER_EMAIL/DEFAULT_FROM_EMAIL configured."))
            return
        subject = options.get("subject")
        body = options.get("body")

        ok = send_email(to_email=to_email, subject=subject, body=body)
        if ok:
            self.stdout.write(self.style.SUCCESS(f"Test email sent to {to_email}"))
        else:
            self.stdout.write(self.style.ERROR(f"Failed to send test email to {to_email}"))

