import logging
from datetime import datetime, timedelta
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from django.template.loader import render_to_string
from django.db.models import Count, Q

from django.contrib.auth import get_user_model
from myappLubd.models import Job, Topic, Property
from myappLubd.email_utils import send_email


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send personalized job emails to users based on their property access and date filtering"

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            dest="days",
            type=int,
            default=7,
            help="Number of days to look back for jobs (default: 7)",
        )
        parser.add_argument(
            "--property-id",
            dest="property_id",
            default=None,
            help="Send emails only for specific property ID",
        )
        parser.add_argument(
            "--user-id",
            dest="user_id",
            default=None,
            help="Send email only to specific user ID",
        )
        parser.add_argument(
            "--status",
            dest="status",
            default=None,
            help="Filter jobs by status (pending, in_progress, completed, cancelled)",
        )
        parser.add_argument(
            "--priority",
            dest="priority",
            default=None,
            help="Filter jobs by priority (low, medium, high)",
        )
        parser.add_argument(
            "--test",
            action="store_true",
            dest="test_mode",
            help="Test mode - send to first user only",
        )
        parser.add_argument(
            "--exclude-emails",
            dest="exclude_emails",
            default=None,
            help="Comma-separated list of email addresses to exclude from sending",
        )
        parser.add_argument(
            "--exclude-user-ids",
            dest="exclude_user_ids",
            default=None,
            help="Comma-separated list of user IDs to exclude from sending",
        )

    def get_user_property_jobs(self, user, property_id, days, status_filter=None, priority_filter=None):
        """Get jobs for a specific user and property within date range."""
        now = timezone.localtime()
        start_date = now - timedelta(days=days)
        
        # Base query for jobs in date range
        jobs_query = Job.objects.filter(
            created_at__gte=start_date
        )
        
        # Apply property filter
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
                # If user has no properties, return empty queryset
                return Job.objects.none()
        
        # Apply status filter
        if status_filter:
            jobs_query = jobs_query.filter(status=status_filter)
        
        # Apply priority filter
        if priority_filter:
            jobs_query = jobs_query.filter(priority=priority_filter)
        
        return jobs_query.distinct()

    def get_job_statistics(self, jobs):
        """Calculate job statistics from queryset."""
        total_jobs = jobs.count()
        completed_jobs = jobs.filter(status='completed').count()
        pending_jobs = jobs.filter(status='pending').count()
        
        # Status breakdown
        status_counts = {}
        for status_key, _ in Job.STATUS_CHOICES:
            status_counts[status_key] = jobs.filter(status=status_key).count()
        
        # Room statistics
        room_stats = []
        room_counts = jobs.values('rooms__name').annotate(
            job_count=Count('id')
        ).filter(rooms__name__isnull=False).order_by('-job_count')
        
        for room in room_counts:
            room_stats.append({
                'name': room['rooms__name'],
                'job_count': room['job_count']
            })
        
        # Topic statistics
        topic_stats = []
        topic_counts = jobs.values('topics__title').annotate(
            count=Count('id')
        ).filter(topics__title__isnull=False).order_by('-count')[:10]
        
        for topic in topic_counts:
            topic_stats.append({
                'title': topic['topics__title'],
                'count': topic['count']
            })
        
        return {
            'total_jobs': total_jobs,
            'completed_jobs': completed_jobs,
            'pending_jobs': pending_jobs,
            'status_counts': status_counts,
            'room_stats': room_stats,
            'topic_stats': topic_stats,
        }

    def send_user_job_email(self, user, property_obj, jobs, stats, days, now):
        """Send personalized job email to user."""
        try:
            # Get property info
            property_name = property_obj.name if property_obj else "Your Properties"
            property_id = property_obj.id if property_obj else "Multiple"
            
            # Create date range string
            start_date = now - timedelta(days=days)
            date_range = f"{start_date.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')}"
            
            # Compose email
            subject = f"Your Jobs - {property_name} ({date_range})"
            
            # Plain-text fallback body
            lines = [
                f"Hello {user.get_full_name() or user.username},",
                "",
                f"Property: {property_name} (ID: {property_id})",
                f"Date Range: {date_range}",
                "",
                f"YOUR JOBS SUMMARY:",
                f"Total jobs: {stats['total_jobs']}",
                f"Completed jobs: {stats['completed_jobs']}",
                f"Pending jobs: {stats['pending_jobs']}",
                "",
                "Breakdown by status:",
            ]
            
            for key, label in Job.STATUS_CHOICES:
                lines.append(f"- {label}: {stats['status_counts'].get(key, 0)}")
            
            lines.extend([
                "",
                "Your jobs:",
            ])
            
            for job in jobs[:20]:  # Limit to first 20 jobs
                lines.append(f"- {job.job_id}: {job.description[:50]}... ({job.status}, {job.priority})")
            
            if jobs.count() > 20:
                lines.append(f"... and {jobs.count() - 20} more jobs")
            
            if stats['room_stats']:
                lines.extend([
                    "",
                    "Jobs by room:",
                ])
                for room in stats['room_stats']:
                    lines.append(f"- {room['name']}: {room['job_count']} jobs")
            
            if stats['topic_stats']:
                lines.extend([
                    "",
                    "Top topics:",
                ])
                for topic in stats['topic_stats']:
                    lines.append(f"- {topic['title']}: {topic['count']} jobs")
            
            body = "\n".join(lines)
            
            # HTML body using template
            status_list = [
                {
                    "label": label,
                    "count": stats['status_counts'].get(key, 0),
                }
                for key, label in Job.STATUS_CHOICES
            ]
            
            context = {
                "user_name": user.get_full_name() or user.username,
                "property_id": property_id,
                "property_name": property_name,
                "date_range": date_range,
                "date_str": now.strftime('%Y-%m-%d'),
                "total_jobs": stats['total_jobs'],
                "completed_jobs": stats['completed_jobs'],
                "pending_jobs": stats['pending_jobs'],
                "status_list": status_list,
                "jobs": jobs[:50],  # Limit to 50 jobs for email
                "room_stats": stats['room_stats'],
                "topic_stats": stats['topic_stats'],
                "brand_name": "PCMS",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://pcms.live"),
            }
            
            html_body = render_to_string("emails/user_property_jobs.html", context)
            
            # Send email
            success = send_email(
                to_email=user.email,
                subject=subject,
                body=body,
                html_body=html_body
            )
            
            if success:
                logger.info(f"User job email sent to {user.email} for property {property_name}")
                return True
            else:
                logger.error(f"Failed to send user job email to {user.email}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending user job email to {user.email}: {e}")
            return False

    def handle(self, *args, **options):
        try:
            now = timezone.localtime()
            days = options.get('days', 7)
            property_id = options.get('property_id')
            user_id = options.get('user_id')
            status_filter = options.get('status')
            priority_filter = options.get('priority')
            test_mode = options.get('test_mode', False)
            
            User = get_user_model()
            
            # Get users to send emails to
            if user_id:
                users = User.objects.filter(id=user_id, is_active=True).exclude(email__isnull=True).exclude(email__exact="")
            else:
                users = User.objects.filter(is_active=True).exclude(email__isnull=True).exclude(email__exact="")
            
            # Exclude users with email notifications disabled
            users = users.filter(
                Q(profile__email_notifications_enabled=True) | Q(profile__isnull=True)
            )
            
            # Exclude specific emails if provided
            exclude_emails = options.get('exclude_emails')
            if exclude_emails:
                email_list = [e.strip() for e in exclude_emails.split(",") if e.strip()]
                if email_list:
                    users = users.exclude(email__in=email_list)
            
            # Exclude specific user IDs if provided
            exclude_user_ids = options.get('exclude_user_ids')
            if exclude_user_ids:
                try:
                    user_id_list = [int(uid.strip()) for uid in exclude_user_ids.split(",") if uid.strip()]
                    if user_id_list:
                        users = users.exclude(id__in=user_id_list)
                except ValueError:
                    logger.warning(f"Invalid user IDs in --exclude-user-ids: {exclude_user_ids}")
            
            if not users.exists():
                self.stdout.write(self.style.ERROR("No active users with email addresses found"))
                return
            
            # Test mode - send to first user only
            if test_mode:
                users = users[:1]
                self.stdout.write(self.style.WARNING("Test mode: Sending to first user only"))
            
            # Get property info
            property_obj = None
            if property_id:
                try:
                    property_obj = Property.objects.get(id=property_id)
                except Property.DoesNotExist:
                    self.stdout.write(self.style.ERROR(f"Property with ID {property_id} not found"))
                    return
            
            sent_count = 0
            total_users = users.count()
            
            for user in users:
                # Get user's jobs
                jobs = self.get_user_property_jobs(user, property_id, days, status_filter, priority_filter)
                
                if not jobs.exists():
                    logger.info(f"No jobs found for user {user.email}")
                    continue
                
                # Get job statistics
                stats = self.get_job_statistics(jobs)
                
                # Send email
                success = self.send_user_job_email(user, property_obj, jobs, stats, days, now)
                if success:
                    sent_count += 1
                
                # In test mode, only send to first user
                if test_mode:
                    break
            
            if sent_count > 0:
                self.stdout.write(
                    self.style.SUCCESS(f"User job emails sent to {sent_count}/{total_users} users")
                )
            else:
                self.stdout.write(
                    self.style.WARNING("No emails were sent (no jobs found or email failures)")
                )
                
        except Exception as exc:
            logger.exception("Error while sending user property job emails: %s", exc)
            self.stdout.write(self.style.ERROR(f"Error: {exc}"))
