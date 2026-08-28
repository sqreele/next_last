import logging
import os
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.conf import settings
from django.template.loader import render_to_string
from django.db.models import Q, Prefetch

from django.contrib.auth import get_user_model
from myappLubd.models import Job, JobImage, Property
from myappLubd.email_utils import normalize_email_addresses, send_email
from myappLubd.timezones import localtime_for, object_timezone
from myappLubd.tenancy import get_property_summary_email_users


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
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Resolve summary counts and recipients without sending email",
        )

    def get_pending_jobs(self, property_id=None, days=30):
        """Get jobs with status: pending, in_progress, or waiting_sparepart."""
        property_obj = Property.objects.filter(id=property_id).select_related('tenant').first() if property_id else None
        now = localtime_for(property_obj)
        start_date = now - timedelta(days=days)
        
        # Build base query for target statuses
        jobs_query = Job.objects.filter(
            status__in=TARGET_STATUSES,
            created_at__gte=start_date
        ).select_related('user', 'property').prefetch_related(
            'rooms',
            'topics',
            Prefetch(
                'job_images',
                queryset=JobImage.objects.order_by('-uploaded_at')
            )
        ).order_by('-created_at')
        
        # Apply property filter if specified
        if property_id:
            jobs_query = jobs_query.filter(property_id=property_id).distinct()
        
        return jobs_query

    def get_job_details_with_images(self, jobs, max_images=3, include_images=True, tzinfo=None):
        """Prepare job details with images for email template."""
        job_details = []
        
        for job in jobs:
            # Get room names
            rooms = list(job.rooms.values_list('name', flat=True))
            
            # Get topic names
            topics = list(job.topics.values_list('title', flat=True))
            
            properties = [job.property.name]
            
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
                            base_url = getattr(settings, 'FRONTEND_BASE_URL', 'https://hotelcarepro.com')
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
                'created_at': timezone.localtime(job.created_at, tzinfo) if tzinfo and job.created_at else job.created_at,
                'updated_at': timezone.localtime(job.updated_at, tzinfo) if tzinfo and job.updated_at else job.updated_at,
                'user_name': user_name,
                'rooms': rooms,
                'topics': topics,
                'properties': properties,
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
                    logger.info("Explicit recipient is excluded")
                    return []
            recipients = normalize_email_addresses([explicit_to])
        else:
            # Build user queryset
            if property_id:
                # Get users assigned to this property
                users_qs = get_property_summary_email_users(
                    Property.objects.filter(pk=property_id).first()
                )
                
                # No property recipient fallback may widen tenant scope. Only
                # the platform break-glass account can receive a global summary.
                if not users_qs.exists():
                    users_qs = User.objects.filter(
                        is_active=True, is_superuser=True
                    ).exclude(email__isnull=True).exclude(email__exact="")
            elif options.get("all_users"):
                users_qs = User.objects.filter(is_active=True).exclude(email__isnull=True).exclude(email__exact="")
            else:
                users_qs = (
                    User.objects.filter(is_active=True, is_superuser=True)
                    .exclude(email__isnull=True)
                    .exclude(email__exact="")
                )
            
            # All fallback/global users must also honor notification preferences.
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
            
            recipients = normalize_email_addresses(
                users_qs.values_list("email", flat=True).distinct()
            )
            
            if not recipients:
                # Final fallback
                fallback = getattr(settings, "SERVER_EMAIL", None) or getattr(settings, "DEFAULT_FROM_EMAIL", None)
                if fallback:
                    recipients = normalize_email_addresses([fallback])
        
        return recipients

    def send_pending_jobs_email(self, jobs, job_details, stats, recipients, now, property_name=None, property_id=None, timezone_label=None):
        """Send the pending jobs summary email."""
        try:
            timezone_label = timezone_label or object_timezone().key
            # Prepare subject
            if property_name:
                subject = f"Action Required: {stats['total']} Jobs Need Attention - {property_name} ({now.strftime('%Y-%m-%d')})"
            else:
                subject = f"Action Required: {stats['total']} Jobs Need Attention ({now.strftime('%Y-%m-%d')})"
            
            # Plain-text fallback body
            lines = [
                f"Date: {now.strftime('%Y-%m-%d %H:%M')} ({timezone_label})",
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
                "timezone_label": timezone_label,
                "property_id": property_id,
                "property_name": property_name,
                "stats": stats,
                "job_details": job_details,
                "brand_name": "StayMaint",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://hotelcarepro.com"),
            }
            
            html_body = render_to_string("emails/pending_jobs_summary.html", context)
            
            # Send to all recipients
            sent_count = 0
            failure_count = 0
            for to_email in recipients:
                try:
                    success = send_email(
                        to_email=to_email,
                        subject=subject,
                        body=body,
                        html_body=html_body
                    )
                except Exception:
                    logger.exception(
                        "Unexpected pending summary transport error property_id=%s",
                        property_id,
                    )
                    success = False
                if success:
                    sent_count += 1
                    logger.info(
                        "Pending summary delivery succeeded property_id=%s",
                        property_id,
                    )
                else:
                    failure_count += 1
                    logger.error(
                        "Pending summary delivery failed property_id=%s",
                        property_id,
                    )
            
            return sent_count, failure_count
            
        except Exception:
            logger.exception(
                "Error preparing pending jobs summary property_id=%s",
                property_id,
            )
            raise

    def handle(self, *args, **options):
        try:
            days = options.get('days', 30)
            include_images = options.get('include_images', True)
            max_images = options.get('max_images', 3)
            dry_run = options.get('dry_run', False)
            
            if options.get('all_properties'):
                properties = list(Property.objects.select_related('tenant'))
                successful_properties = 0
                attempted_deliveries = 0
                successful_deliveries = 0
                failed_deliveries = 0
                
                for property_obj in properties:
                    property_now = localtime_for(property_obj)
                    property_tz = object_timezone(property_obj)
                    jobs = self.get_pending_jobs(property_id=property_obj.id, days=days)
                    recipients = self.get_recipients(options, property_id=property_obj.id)

                    if dry_run:
                        self._write_dry_run(
                            property_obj,
                            jobs.count(),
                            len(recipients),
                            jobs.exists() and bool(recipients),
                        )
                        continue

                    if not jobs.exists():
                        logger.info(
                            "No pending jobs; skipping property_id=%s",
                            property_obj.id,
                        )
                        continue
                    if not recipients:
                        logger.warning(
                            "No pending summary recipients property_id=%s",
                            property_obj.id,
                        )
                        continue

                    job_details = self.get_job_details_with_images(
                        jobs, max_images, include_images, property_tz
                    )
                    stats = self.get_summary_stats(jobs)
                    sent_count, failure_count = self.send_pending_jobs_email(
                        jobs, job_details, stats, recipients, property_now,
                        property_name=property_obj.name,
                        property_id=property_obj.id,
                        timezone_label=property_tz.key,
                    )
                    attempted_deliveries += len(recipients)
                    successful_deliveries += sent_count
                    failed_deliveries += failure_count
                    if sent_count:
                        successful_properties += 1
                        logger.info(
                            "Pending summary completed property_id=%s success_count=%s failure_count=%s",
                            property_obj.id,
                            sent_count,
                            failure_count,
                        )

                if dry_run:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Dry run completed for {len(properties)} properties"
                        )
                    )
                    return
                
                self.stdout.write(
                    self.style.SUCCESS(
                        "Pending jobs summaries sent for "
                        f"{successful_properties}/{len(properties)} properties; "
                        f"success_count={successful_deliveries}; "
                        f"failure_count={failed_deliveries}"
                    )
                )
                if attempted_deliveries and not successful_deliveries:
                    raise CommandError(
                        "Failed to send every attempted pending summary delivery"
                    )
            else:
                property_id = options.get('property_id')
                property_name = None
                property_obj = None
                
                if property_id:
                    try:
                        property_obj = Property.objects.select_related('tenant').get(id=property_id)
                        property_name = property_obj.name
                    except Property.DoesNotExist:
                        try:
                            property_obj = Property.objects.select_related('tenant').get(property_id=property_id)
                            property_id = property_obj.id
                            property_name = property_obj.name
                        except Property.DoesNotExist:
                            raise CommandError(f"Property {property_id} not found")
                now = localtime_for(property_obj)
                tzinfo = object_timezone(property_obj)
                
                jobs = self.get_pending_jobs(property_id=property_id, days=days)
                recipients = self.get_recipients(options, property_id=property_id)

                if dry_run:
                    self._write_dry_run(
                        property_obj,
                        jobs.count(),
                        len(recipients),
                        jobs.exists() and bool(recipients),
                    )
                    return
                
                if not jobs.exists():
                    self.stdout.write(self.style.WARNING("No jobs with pending/in_progress/waiting_sparepart status found"))
                    return
                
                job_details = self.get_job_details_with_images(jobs, max_images, include_images, tzinfo)
                stats = self.get_summary_stats(jobs)
                
                if not recipients:
                    raise CommandError("No valid recipient email addresses found")
                
                sent_count, failure_count = self.send_pending_jobs_email(
                    jobs, job_details, stats, recipients, now,
                    property_name=property_name,
                    property_id=property_id,
                    timezone_label=tzinfo.key,
                )
                
                if sent_count:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Pending jobs summary sent for {stats['total']} jobs; "
                            f"success_count={sent_count}; failure_count={failure_count}"
                        )
                    )
                else:
                    raise CommandError(
                        "Failed to send every attempted pending summary delivery"
                    )
        except CommandError:
            raise
        except Exception as exc:
            logger.exception("Error while sending pending jobs summary email: %s", exc)
            raise CommandError(
                f"Error while sending pending jobs summary email: {exc}"
            ) from exc

    def _write_dry_run(self, property_obj, job_count, recipient_count, would_send):
        self.stdout.write("DRY RUN - no email will be sent")
        self.stdout.write(
            f"Property ID: {property_obj.id if property_obj else 'ALL'}"
        )
        self.stdout.write(
            f"Property name: {property_obj.name if property_obj else 'All properties'}"
        )
        self.stdout.write(f"Jobs selected: {job_count}")
        self.stdout.write(f"Recipient count: {recipient_count}")
        self.stdout.write(f"Would send: {'YES' if would_send else 'NO'}")
