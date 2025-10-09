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
    help = "Send property-specific job summary via email"

    def add_arguments(self, parser):
        parser.add_argument(
            "--property-id",
            dest="property_id",
            required=True,
            help="Property ID to filter jobs by",
        )
        parser.add_argument(
            "--to",
            dest="to_email",
            default=None,
            help="Recipient email address. Defaults to property users or staff.",
        )
        parser.add_argument(
            "--days",
            dest="days",
            type=int,
            default=7,
            help="Number of days to look back for job statistics (default: 7)",
        )
        parser.add_argument(
            "--all-properties",
            action="store_true",
            dest="all_properties",
            help="Send summary for all properties to their respective users",
        )

    def get_property_job_statistics(self, property_id, days=7):
        """Calculate job statistics for a specific property."""
        now = timezone.localtime()
        start_date = now - timedelta(days=days)
        
        # Get all jobs for this property within the time range
        jobs = Job.objects.filter(
            Q(property_id=property_id) | 
            Q(rooms__properties__id=property_id) |
            Q(properties__contains=[str(property_id)])
        ).filter(
            created_at__gte=start_date
        ).distinct()
        
        # Get property info
        try:
            property_obj = Property.objects.get(id=property_id)
            property_name = property_obj.name
        except Property.DoesNotExist:
            property_name = f"Property {property_id}"
        
        # Calculate status counts
        status_counts = {}
        for status_key, _ in Job.STATUS_CHOICES:
            status_counts[status_key] = jobs.filter(status=status_key).count()
        
        # Calculate completed jobs
        completed_jobs = jobs.filter(status='completed').count()
        
        # Get recent jobs (last 10) with property information
        recent_jobs_queryset = jobs.order_by('-created_at')[:10]
        recent_jobs = []
        for job in recent_jobs_queryset:
            # Get all properties this job belongs to through its rooms
            job_properties = Property.objects.filter(
                rooms__jobs=job
            ).distinct().values_list('name', flat=True)
            
            recent_jobs.append({
                'job': job,
                'properties': list(job_properties) if job_properties else []
            })
        
        # Get room statistics
        room_stats = []
        room_counts = jobs.values('rooms__name').annotate(
            job_count=Count('id')
        ).order_by('-job_count')
        
        for room in room_counts:
            if room['rooms__name']:
                room_stats.append({
                    'name': room['rooms__name'],
                    'job_count': room['job_count']
                })
        
        # Get topic statistics
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
            'property_id': property_id,
            'property_name': property_name,
            'total_jobs': jobs.count(),
            'completed_jobs': completed_jobs,
            'status_counts': status_counts,
            'recent_jobs': recent_jobs,
            'room_stats': room_stats,
            'topic_stats': topic_stats,
            'days': days,
        }

    def get_property_users(self, property_id):
        """Get users who have access to this property."""
        User = get_user_model()
        return User.objects.filter(
            Q(is_active=True) & 
            (Q(profile__properties__id=property_id) | Q(is_staff=True))
        ).exclude(email__isnull=True).exclude(email__exact="")

    def handle(self, *args, **options):
        try:
            now = timezone.localtime()
            days = options.get('days', 7)
            
            if options.get('all_properties'):
                # Send summary for all properties
                properties = Property.objects.all()
                total_sent = 0
                
                for property_obj in properties:
                    stats = self.get_property_job_statistics(property_obj.id, days)
                    users = self.get_property_users(property_obj.id)
                    
                    if users.exists():
                        success = self.send_property_summary_email(stats, users, now)
                        if success:
                            total_sent += 1
                            logger.info(f"Property summary sent for {property_obj.name}")
                
                self.stdout.write(
                    self.style.SUCCESS(f"Property summaries sent for {total_sent}/{properties.count()} properties")
                )
            else:
                # Send summary for specific property
                property_id = options.get('property_id')
                stats = self.get_property_job_statistics(property_id, days)
                
                # Determine recipients
                explicit_to = options.get("to_email")
                if explicit_to:
                    users = [explicit_to]
                else:
                    user_objects = self.get_property_users(property_id)
                    users = list(user_objects.values_list("email", flat=True))
                    
                    if not users:
                        # Fallback to staff users
                        User = get_user_model()
                        staff_users = User.objects.filter(
                            is_active=True, is_staff=True
                        ).exclude(email__isnull=True).exclude(email__exact="")
                        users = list(staff_users.values_list("email", flat=True))
                
                if not users:
                    logger.error("No recipient email addresses found.")
                    self.stdout.write(self.style.ERROR("No recipient email addresses found"))
                    return
                
                success = self.send_property_summary_email(stats, users, now)
                if success:
                    self.stdout.write(
                        self.style.SUCCESS(f"Property summary email sent for {stats['property_name']}")
                    )
                else:
                    self.stdout.write(
                        self.style.ERROR("Failed to send property summary email")
                    )
                    
        except Exception as exc:
            logger.exception("Error while sending property summary email: %s", exc)
            self.stdout.write(self.style.ERROR(f"Error: {exc}"))

    def send_property_summary_email(self, stats, users, now):
        """Send the property summary email."""
        try:
            # Compose email
            subject = f"Jobs Summary - {stats['property_name']} ({now.strftime('%Y-%m-%d')})"
            
            # Plain-text fallback body
            lines = [
                f"Property: {stats['property_name']} (ID: {stats['property_id']})",
                f"Date: {now.strftime('%Y-%m-%d')} (Asia/Bangkok)",
                f"Period: Last {stats['days']} days",
                "",
                f"SUMMARY:",
                f"Total jobs: {stats['total_jobs']}",
                f"Completed jobs: {stats['completed_jobs']}",
                "",
                "Breakdown by status:",
            ]
            
            for key, label in Job.STATUS_CHOICES:
                lines.append(f"- {label}: {stats['status_counts'].get(key, 0)}")
            
            lines.extend([
                "",
                "Recent jobs:",
            ])
            
            for job_data in stats['recent_jobs']:
                job = job_data['job']
                properties = job_data['properties']
                properties_str = f" [Properties: {', '.join(properties)}]" if properties else ""
                lines.append(f"- {job.job_id}: {job.description[:50]}... ({job.status}){properties_str}")
            
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
                "date_str": now.strftime('%Y-%m-%d'),
                "timezone_label": "Asia/Bangkok",
                "property_id": stats['property_id'],
                "property_name": stats['property_name'],
                "total_jobs": stats['total_jobs'],
                "completed_jobs": stats['completed_jobs'],
                "status_list": status_list,
                "recent_jobs": stats['recent_jobs'],
                "room_stats": stats['room_stats'],
                "topic_stats": stats['topic_stats'],
                "brand_name": "PCMS",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://pcms.live"),
            }
            
            html_body = render_to_string("emails/property_jobs_summary.html", context)
            
            # Send to all users
            sent_count = 0
            for user_email in users:
                success = send_email(
                    to_email=user_email, 
                    subject=subject, 
                    body=body, 
                    html_body=html_body
                )
                if success:
                    sent_count += 1
                    logger.info(f"Property summary email sent to {user_email}")
                else:
                    logger.error(f"Failed to send property summary email to {user_email}")
            
            return sent_count > 0
            
        except Exception as e:
            logger.error(f"Error sending property summary email: {e}")
            return False
