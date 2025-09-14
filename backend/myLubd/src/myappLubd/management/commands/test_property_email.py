import logging
from django.core.management.base import BaseCommand
from django.utils import timezone
from myappLubd.models import Property, Job
from myappLubd.email_utils import send_email

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Test property-specific email functionality"

    def add_arguments(self, parser):
        parser.add_argument(
            "--property-id",
            dest="property_id",
            required=True,
            help="Property ID to test email for",
        )
        parser.add_argument(
            "--to",
            dest="to_email",
            required=True,
            help="Test recipient email address",
        )

    def handle(self, *args, **options):
        try:
            property_id = options.get('property_id')
            to_email = options.get('to_email')
            
            # Get property info
            try:
                property_obj = Property.objects.get(id=property_id)
                property_name = property_obj.name
            except Property.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"Property with ID {property_id} not found"))
                return
            
            # Get job statistics for this property
            now = timezone.localtime()
            jobs = Job.objects.filter(
                Q(property_id=property_id) | 
                Q(rooms__properties__id=property_id) |
                Q(properties__contains=[str(property_id)])
            ).distinct()
            
            total_jobs = jobs.count()
            completed_jobs = jobs.filter(status='completed').count()
            
            # Create test email
            subject = f"Test Property Email - {property_name}"
            
            body = f"""
Property: {property_name} (ID: {property_id})
Date: {now.strftime('%Y-%m-%d')} (Asia/Bangkok)

SUMMARY:
Total jobs: {total_jobs}
Completed jobs: {completed_jobs}

This is a test email to verify property-specific email functionality.
            """.strip()
            
            # Send test email
            success = send_email(
                to_email=to_email,
                subject=subject,
                body=body
            )
            
            if success:
                self.stdout.write(
                    self.style.SUCCESS(f"Test email sent successfully to {to_email} for property {property_name}")
                )
            else:
                self.stdout.write(
                    self.style.ERROR("Failed to send test email")
                )
                
        except Exception as exc:
            logger.exception("Error while sending test email: %s", exc)
            self.stdout.write(self.style.ERROR(f"Error: {exc}"))
