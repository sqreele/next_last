import logging
import base64
import os
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from django.template.loader import render_to_string
from django.db.models import Q, Prefetch

from django.contrib.auth import get_user_model
from myappLubd.models import Job, JobImage, Property
from myappLubd.email_utils import send_email


logger = logging.getLogger(__name__)


# Target statuses for this summary email
TARGET_STATUSES = ['pending', 'in_progress', 'waiting_sparepart']


class Command(BaseCommand):
    help = "Send summary email for jobs with status: pending, in_progress, or waiting_sparepart (includes job details and images)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--to",
            dest="to_email",
            default=None,
            help="Recipient email address. Defaults to staff users or property users.",
        )
        parser.add_argument(
            "--all-users",
            action="store_true",
            dest="all_users",
            help="Send to all active users with an email (default sends to active staff only)",
        )
        parser.add_argument(
            "--property-id",
            dest="property_id",
            default=None,
            help="Filter jobs by specific property ID",
        )
        parser.add_argument(
            "--all-properties",
            action="store_true",
            dest="all_properties",
            help="Send summary for all properties to their respective users",
        )
        parser.add_argument(
            "--days",
            dest="days",
            type=int,
            default=30,
            help="Number of days to look back for jobs (default: 30)",
        )
        parser.add_argument(
            "--include-images",
            action="store_true",
            dest="include_images",
            default=True,
            help="Include job images in the email (default: True)",
        )
        parser.add_argument(
            "--max-images",
            dest="max_images",
            type=int,
            default=3,
            help="Maximum number of images to include per job (default: 3)",
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

    def get_pending_jobs(self, property_id=None, days=30):
        """Get jobs with status: pending, in_progress, or waiting_sparepart."""
        now = timezone.localtime()
        start_date = now - timedelta(days=days)
        
        # Build base query for target statuses
        jobs_query = Job.objects.filter(
            status__in=TARGET_STATUSES,
            created_at__gte=start_date
        ).select_related('user').prefetch_related(
            'rooms',
            'topics',
            Prefetch(
                'job_images',
                queryset=JobImage.objects.order_by('-uploaded_at')
            )
        ).order_by('-created_at')
        
        # Apply property filter if specified
        if property_id:
            jobs_query = jobs_query.filter(
                Q(rooms__properties__id=property_id) |
                Q(rooms__properties__property_id=property_id)
            ).distinct()
        
        return jobs_query

    def get_job_details_with_images(self, jobs, max_images=3, include_images=True):
        """Prepare job details with images for email template."""
        job_details = []
        
        for job in jobs:
            # Get room names
            rooms = list(job.rooms.values_list('name', flat=True))
            
            # Get topic names
            topics = list(job.topics.values_list('title', flat=True))
            
            # Get property names through rooms
            properties = Property.objects.filter(
                rooms__jobs=job
            ).distinct().values_list('name', flat=True)
            
            # Get images
            images = []
            if include_images:
                job_images = job.job_images.all()[:max_images]
                for img in job_images:
                    image_url = None
                    if img.image:
                        try:
                            # Build full URL for the image
                            media_url = getattr(settings, 'MEDIA_URL', '/media/')
                            base_url = getattr(settings, 'FRONTEND_BASE_URL', 'https://pcms.live')
                            # Remove trailing slash from base_url if present
                            base_url = base_url.rstrip('/')
                            
                            # Build image URL
                            if media_url.startswith('http'):
                                image_url = f"{media_url}{img.image.name}"
                            else:
                                # Replace frontend URL with backend API URL for media
                                backend_url = os.getenv('BACKEND_URL', base_url.replace(':3000', ':8000'))
                                image_url = f"{backend_url}{media_url}{img.image.name}"
                            
                            images.append({
                                'url': image_url,
                                'uploaded_at': img.uploaded_at,
                            })
                        except Exception as e:
                            logger.warning(f"Could not process image for job {job.job_id}: {e}")
            
            # Get status display with color info
            status_colors = {
                'pending': {'bg': '#e3f2fd', 'color': '#1976d2', 'label': 'Pending'},
                'in_progress': {'bg': '#fff3e0', 'color': '#f57c00', 'label': 'In Progress'},
                'waiting_sparepart': {'bg': '#fce4ec', 'color': '#c2185b', 'label': 'Waiting Sparepart'},
            }
            status_info = status_colors.get(job.status, {'bg': '#f5f5f5', 'color': '#666', 'label': job.status})
            
            # Get priority display
            priority_colors = {
                'low': {'bg': '#e8f5e9', 'color': '#2e7d32'},
                'medium': {'bg': '#fff3e0', 'color': '#f57c00'},
                'high': {'bg': '#ffebee', 'color': '#c62828'},
            }
            priority_info = priority_colors.get(job.priority, {'bg': '#f5f5f5', 'color': '#666'})
            
            # Get user info
            user_name = "Unknown"
            if job.user:
                user_name = job.user.get_full_name() or job.user.username
            
            job_details.append({
                'job': job,
                'job_id': job.job_id,
                'description': job.description,
                'remarks': job.remarks or '',
                'status': job.status,
                'status_info': status_info,
                'priority': job.priority,
                'priority_info': priority_info,
                'created_at': job.created_at,
                'updated_at': job.updated_at,
                'user_name': user_name,
                'rooms': rooms,
                'topics': topics,
                'properties': list(properties),
                'images': images,
                'has_images': len(images) > 0,
                'image_count': job.job_images.count(),
                'is_defective': job.is_defective,
            })
        
        return job_details

    def get_summary_stats(self, jobs):
        """Calculate summary statistics for the jobs."""
        stats = {
            'total': jobs.count(),
            'pending': jobs.filter(status='pending').count(),
            'in_progress': jobs.filter(status='in_progress').count(),
            'waiting_sparepart': jobs.filter(status='waiting_sparepart').count(),
            'high_priority': jobs.filter(priority='high').count(),
            'medium_priority': jobs.filter(priority='medium').count(),
            'low_priority': jobs.filter(priority='low').count(),
            'defective': jobs.filter(is_defective=True).count(),
        }
        return stats

    def get_recipients(self, options, property_id=None):
        """Determine email recipients based on options."""
        User = get_user_model()
        explicit_to = options.get("to_email")
        recipients = []
        
        exclude_emails = options.get('exclude_emails')
        exclude_user_ids = options.get('exclude_user_ids')
        
        if explicit_to:
            # Check if explicit email should be excluded
            if exclude_emails:
                email_list = [e.strip() for e in exclude_emails.split(",") if e.strip()]
                if explicit_to in email_list:
                    logger.info(f"Explicit email {explicit_to} is in exclude list, skipping")
                    return []
            recipients = [explicit_to]
        else:
            # Build user queryset
            if property_id:
                # Get users assigned to this property
                users_qs = User.objects.filter(
                    is_active=True,
                    userprofile__properties__id=property_id
                ).exclude(email__isnull=True).exclude(email__exact="")
                
                # If no property users found, fallback to staff
                if not users_qs.exists():
                    users_qs = User.objects.filter(
                        is_active=True, is_staff=True
                    ).exclude(email__isnull=True).exclude(email__exact="")
            elif options.get("all_users"):
                users_qs = User.objects.filter(is_active=True).exclude(email__isnull=True).exclude(email__exact="")
            else:
                users_qs = (
                    User.objects.filter(is_active=True, is_staff=True)
                    .exclude(email__isnull=True)
                    .exclude(email__exact="")
                )
            
            # Exclude users with email notifications disabled
            users_qs = users_qs.filter(
                Q(userprofile__email_notifications_enabled=True) | Q(userprofile__isnull=True)
            )
            
            # Apply exclusions
            if exclude_emails:
                email_list = [e.strip() for e in exclude_emails.split(",") if e.strip()]
                if email_list:
                    users_qs = users_qs.exclude(email__in=email_list)
            
            if exclude_user_ids:
                try:
                    user_id_list = [int(uid.strip()) for uid in exclude_user_ids.split(",") if uid.strip()]
                    if user_id_list:
                        users_qs = users_qs.exclude(id__in=user_id_list)
                except ValueError:
                    logger.warning(f"Invalid user IDs in --exclude-user-ids: {exclude_user_ids}")
            
            recipients = list(users_qs.values_list("email", flat=True).distinct())
            
            if not recipients:
                # Final fallback
                fallback = getattr(settings, "SERVER_EMAIL", None) or getattr(settings, "DEFAULT_FROM_EMAIL", None)
                if fallback:
                    recipients = [fallback]
        
        return recipients

    def send_pending_jobs_email(self, jobs, job_details, stats, recipients, now, property_name=None, property_id=None):
        """Send the pending jobs summary email."""
        try:
            # Prepare subject
            if property_name:
                subject = f"Action Required: {stats['total']} Jobs Need Attention - {property_name} ({now.strftime('%Y-%m-%d')})"
            else:
                subject = f"Action Required: {stats['total']} Jobs Need Attention ({now.strftime('%Y-%m-%d')})"
            
            # Plain-text fallback body
            lines = [
                f"Date: {now.strftime('%Y-%m-%d %H:%M')} (Asia/Bangkok)",
                "",
            ]
            
            if property_name:
                lines.extend([
                    f"Property: {property_name} (ID: {property_id})",
                    "",
                ])
            
            lines.extend([
                "=" * 50,
                "JOBS REQUIRING ATTENTION",
                "=" * 50,
                "",
                f"Total Jobs: {stats['total']}",
                f"  - Pending: {stats['pending']}",
                f"  - In Progress: {stats['in_progress']}",
                f"  - Waiting Sparepart: {stats['waiting_sparepart']}",
                "",
                f"High Priority: {stats['high_priority']}",
                f"Defective Items: {stats['defective']}",
                "",
                "-" * 50,
                "JOB DETAILS",
                "-" * 50,
            ])
            
            for job_data in job_details:
                lines.extend([
                    "",
                    f"Job ID: {job_data['job_id']}",
                    f"Status: {job_data['status_info']['label']}",
                    f"Priority: {job_data['priority'].title()}",
                    f"Created: {job_data['created_at'].strftime('%Y-%m-%d %H:%M')}",
                    f"Description: {job_data['description'][:100]}..." if len(job_data['description']) > 100 else f"Description: {job_data['description']}",
                ])
                
                if job_data['remarks']:
                    remarks_preview = job_data['remarks'][:100] + "..." if len(job_data['remarks']) > 100 else job_data['remarks']
                    lines.append(f"Remarks: {remarks_preview}")
                
                if job_data['rooms']:
                    lines.append(f"Rooms: {', '.join(job_data['rooms'])}")
                
                if job_data['topics']:
                    lines.append(f"Topics: {', '.join(job_data['topics'])}")
                
                if job_data['has_images']:
                    lines.append(f"Images: {job_data['image_count']} attached")
                
                if job_data['is_defective']:
                    lines.append("⚠️ DEFECTIVE ITEM")
                
                lines.append("-" * 30)
            
            body = "\n".join(lines)
            
            # HTML body using template
            context = {
                "date_str": now.strftime('%Y-%m-%d'),
                "time_str": now.strftime('%H:%M'),
                "timezone_label": "Asia/Bangkok",
                "property_id": property_id,
                "property_name": property_name,
                "stats": stats,
                "job_details": job_details,
                "brand_name": "PCMS",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://pcms.live"),
            }
            
            html_body = render_to_string("emails/pending_jobs_summary.html", context)
            
            # Send to all recipients
            sent_count = 0
            for to_email in recipients:
                success = send_email(
                    to_email=to_email,
                    subject=subject,
                    body=body,
                    html_body=html_body
                )
                if success:
                    sent_count += 1
                    logger.info(f"Pending jobs summary email sent to {to_email}")
                else:
                    logger.error(f"Failed to send pending jobs summary email to {to_email}")
            
            return sent_count > 0
            
        except Exception as e:
            logger.error(f"Error sending pending jobs summary email: {e}")
            return False

    def handle(self, *args, **options):
        try:
            now = timezone.localtime()
            days = options.get('days', 30)
            include_images = options.get('include_images', True)
            max_images = options.get('max_images', 3)
            
            if options.get('all_properties'):
                # Send summary for all properties
                properties = Property.objects.all()
                total_sent = 0
                
                for property_obj in properties:
                    jobs = self.get_pending_jobs(property_id=property_obj.id, days=days)
                    
                    if not jobs.exists():
                        logger.info(f"No pending jobs for property {property_obj.name}, skipping")
                        continue
                    
                    job_details = self.get_job_details_with_images(jobs, max_images, include_images)
                    stats = self.get_summary_stats(jobs)
                    recipients = self.get_recipients(options, property_id=property_obj.id)
                    
                    if recipients:
                        success = self.send_pending_jobs_email(
                            jobs, job_details, stats, recipients, now,
                            property_name=property_obj.name,
                            property_id=property_obj.id
                        )
                        if success:
                            total_sent += 1
                            logger.info(f"Pending jobs summary sent for {property_obj.name}")
                
                self.stdout.write(
                    self.style.SUCCESS(f"Pending jobs summaries sent for {total_sent}/{properties.count()} properties")
                )
            else:
                # Send summary for specific property or all jobs
                property_id = options.get('property_id')
                property_name = None
                
                if property_id:
                    try:
                        property_obj = Property.objects.get(id=property_id)
                        property_name = property_obj.name
                    except Property.DoesNotExist:
                        try:
                            property_obj = Property.objects.get(property_id=property_id)
                            property_id = property_obj.id
                            property_name = property_obj.name
                        except Property.DoesNotExist:
                            property_name = f"Property {property_id}"
                
                jobs = self.get_pending_jobs(property_id=property_id, days=days)
                
                if not jobs.exists():
                    self.stdout.write(self.style.WARNING("No jobs with pending/in_progress/waiting_sparepart status found"))
                    return
                
                job_details = self.get_job_details_with_images(jobs, max_images, include_images)
                stats = self.get_summary_stats(jobs)
                recipients = self.get_recipients(options, property_id=property_id)
                
                if not recipients:
                    logger.error("No recipient email addresses found.")
                    self.stdout.write(self.style.ERROR("No recipient email addresses found"))
                    return
                
                success = self.send_pending_jobs_email(
                    jobs, job_details, stats, recipients, now,
                    property_name=property_name,
                    property_id=property_id
                )
                
                if success:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Pending jobs summary email sent for {stats['total']} jobs to {len(recipients)} recipients"
                        )
                    )
                else:
                    self.stdout.write(
                        self.style.ERROR("Failed to send pending jobs summary email")
                    )
                    
        except Exception as exc:
            logger.exception("Error while sending pending jobs summary email: %s", exc)
            self.stdout.write(self.style.ERROR(f"Error: {exc}"))
