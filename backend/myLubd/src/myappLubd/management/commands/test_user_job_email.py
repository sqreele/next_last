import logging
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from myappLubd.models import Property, Job
from myappLubd.email_utils import send_email

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Test user-specific property job email functionality"

    def add_arguments(self, parser):
        parser.add_argument(
            "--user-id",
            dest="user_id",
            required=True,
            help="User ID to test email for",
        )
        parser.add_argument(
            "--property-id",
            dest="property_id",
            default=None,
            help="Property ID to filter jobs by",
        )
        parser.add_argument(
            "--days",
            dest="days",
            type=int,
            default=7,
            help="Number of days to look back for jobs (default: 7)",
        )

    def handle(self, *args, **options):
        try:
            user_id = options.get('user_id')
            property_id = options.get('property_id')
            days = options.get('days', 7)
            
            User = get_user_model()
            
            # Get user
            try:
                user = User.objects.get(id=user_id, is_active=True)
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"User with ID {user_id} not found or inactive"))
                return
            
            if not user.email:
                self.stdout.write(self.style.ERROR(f"User {user.username} has no email address"))
                return
            
            # Get property info
            property_obj = None
            if property_id:
                try:
                    property_obj = Property.objects.get(id=property_id)
                except Property.DoesNotExist:
                    self.stdout.write(self.style.ERROR(f"Property with ID {property_id} not found"))
                    return
            
            # Get user's jobs
            from datetime import timedelta
            now = timezone.localtime()
            start_date = now - timedelta(days=days)
            
            jobs_query = Job.objects.filter(created_at__gte=start_date)
            
            if property_id:
                jobs_query = jobs_query.filter(
                    Q(property_id=property_id) | 
                    Q(rooms__properties__id=property_id) |
                    Q(properties__contains=[str(property_id)])
                )
            else:
                # Get user's accessible properties
                user_properties = Property.objects.filter(users=user).values_list('id', flat=True)
                if user_properties:
                    jobs_query = jobs_query.filter(
                        Q(property_id__in=user_properties) | 
                        Q(rooms__properties__id__in=user_properties) |
                        Q(properties__overlap=list(map(str, user_properties)))
                    )
                else:
                    self.stdout.write(self.style.WARNING("User has no accessible properties"))
                    return
            
            jobs = jobs_query.distinct()
            total_jobs = jobs.count()
            
            # Create test email
            property_name = property_obj.name if property_obj else "Your Properties"
            date_range = f"{start_date.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')}"
            
            subject = f"Test: Your Jobs - {property_name} ({date_range})"
            
            body = f"""
Hello {user.get_full_name() or user.username},

This is a test email for the user-specific property job notification system.

Property: {property_name} (ID: {property_id or 'Multiple'})
Date Range: {date_range}
Total Jobs Found: {total_jobs}

Recent Jobs:
"""
            
            for job in jobs[:10]:  # Show first 10 jobs
                body += f"- {job.job_id}: {job.description[:50]}... ({job.status}, {job.priority})\n"
            
            if total_jobs > 10:
                body += f"... and {total_jobs - 10} more jobs\n"
            
            body += f"""
This test email verifies that the user-specific property job email system is working correctly.

Best regards,
PCMS System
            """.strip()
            
            # Send test email
            success = send_email(
                to_email=user.email,
                subject=subject,
                body=body
            )
            
            if success:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Test email sent successfully to {user.email} "
                        f"({user.get_full_name() or user.username}) for property {property_name}"
                    )
                )
                self.stdout.write(f"Found {total_jobs} jobs in the last {days} days")
            else:
                self.stdout.write(
                    self.style.ERROR("Failed to send test email")
                )
                
        except Exception as exc:
            logger.exception("Error while sending test user job email: %s", exc)
            self.stdout.write(self.style.ERROR(f"Error: {exc}"))
