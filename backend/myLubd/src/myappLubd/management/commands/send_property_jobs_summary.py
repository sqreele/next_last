import logging
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.template.loader import render_to_string
from django.db.models import Count, Q

from django.contrib.auth import get_user_model
from myappLubd.models import Job, Property
from myappLubd.email_utils import normalize_email_addresses, send_email
from myappLubd.timezones import localtime_for, object_timezone
from myappLubd.tenancy import get_property_summary_email_users


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send property-specific job summary via email"

    def add_arguments(self, parser):
        parser.add_argument(
            "--property-id",
            dest="property_id",
            default=None,
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
        parser.add_argument(
            "--include-staff",
            action="store_true",
            dest="include_staff",
            help="Include staff users in email recipients (by default, only property-assigned users receive emails)",
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

    def get_property_job_statistics(self, property_id, days=7):
        """Calculate job statistics for a specific property."""
        property_obj = None
        try:
            property_obj = Property.objects.select_related('tenant').get(id=property_id)
        except Property.DoesNotExist:
            pass
        now = localtime_for(property_obj)
        start_date = now - timedelta(days=days)
        
        # Get all jobs for this property within the time range
        # Jobs are related to properties through rooms.properties
        jobs = Job.objects.select_related('property').filter(
            property__id=property_id
        ).filter(
            created_at__gte=start_date
        ).distinct()
        
        # Get property info
        try:
            property_obj = property_obj or Property.objects.select_related('tenant').get(id=property_id)
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
            recent_jobs.append({
                'job': job,
                'properties': [job.property.name],
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
            'timezone_label': object_timezone(property_obj).key,
        }

    def get_property_users(self, property_id, strict_mode=True, exclude_emails=None, exclude_user_ids=None):
        """Get users who have access to this property.
        
        Args:
            property_id: The property ID to filter users by
            strict_mode: If True, only users assigned to this property receive emails.
                        If False, staff users also receive emails (default: True)
            exclude_emails: List of email addresses to exclude
            exclude_user_ids: List of user IDs to exclude
        """
        User = get_user_model()
        if strict_mode:
            # Only users explicitly assigned to this property
            users_qs = get_property_summary_email_users(
                Property.objects.filter(pk=property_id).first()
            )
        else:
            # Platform break-glass may receive this property summary; staff
            # status does not expand application property access.
            users_qs = (
                get_property_summary_email_users(Property.objects.filter(pk=property_id).first())
                | User.objects.filter(is_superuser=True)
            ).filter(is_active=True).exclude(email__isnull=True).exclude(email__exact="").distinct()
        
        # Break-glass users must also honor notification preferences.
        users_qs = users_qs.filter(
            Q(userprofile__email_notifications_enabled=True) | Q(userprofile__isnull=True)
        )
        
        # Exclude specific emails if provided
        if exclude_emails:
            email_list = [e.strip() for e in exclude_emails.split(",") if e.strip()]
            if email_list:
                users_qs = users_qs.exclude(email__in=email_list)
        
        # Exclude specific user IDs if provided
        if exclude_user_ids:
            try:
                user_id_list = [int(uid.strip()) for uid in exclude_user_ids.split(",") if uid.strip()]
                if user_id_list:
                    users_qs = users_qs.exclude(id__in=user_id_list)
            except ValueError:
                logger.warning(f"Invalid user IDs in --exclude-user-ids: {exclude_user_ids}")
        
        return users_qs

    def handle(self, *args, **options):
        try:
            days = options.get('days', 7)
            include_staff = options.get('include_staff', False)
            strict_mode = not include_staff  # strict_mode is True unless --include-staff is specified
            exclude_emails = options.get('exclude_emails')
            exclude_user_ids = options.get('exclude_user_ids')
            dry_run = options.get('dry_run', False)
            
            if options.get('all_properties'):
                properties = list(Property.objects.select_related('tenant'))
                successful_properties = 0
                attempted_deliveries = 0
                successful_deliveries = 0
                failed_deliveries = 0

                for property_obj in properties:
                    stats = self.get_property_job_statistics(property_obj.id, days)
                    property_now = localtime_for(property_obj)
                    user_objects = self.get_property_users(
                        property_obj.id, 
                        strict_mode=strict_mode,
                        exclude_emails=exclude_emails,
                        exclude_user_ids=exclude_user_ids
                    )
                    recipients = normalize_email_addresses(
                        user_objects.values_list('email', flat=True)
                    )

                    if dry_run:
                        self._write_dry_run(
                            property_obj,
                            stats['total_jobs'],
                            len(recipients),
                            bool(recipients),
                        )
                        continue

                    if not recipients:
                        logger.warning(
                            "No property summary recipients property_id=%s",
                            property_obj.id,
                        )
                        continue

                    sent_count, failure_count = self.send_property_summary_email(
                        stats, recipients, property_now
                    )
                    attempted_deliveries += len(recipients)
                    successful_deliveries += sent_count
                    failed_deliveries += failure_count
                    if sent_count:
                        successful_properties += 1
                        logger.info(
                            "Property summary completed property_id=%s success_count=%s failure_count=%s",
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
                        "Property summaries sent for "
                        f"{successful_properties}/{len(properties)} properties; "
                        f"success_count={successful_deliveries}; "
                        f"failure_count={failed_deliveries}"
                    )
                )
                if attempted_deliveries and not successful_deliveries:
                    raise CommandError(
                        "Failed to send every attempted property summary delivery"
                    )
            else:
                property_id = options.get('property_id')
                if not property_id:
                    raise CommandError("Missing --property-id (or use --all-properties)")
                property_obj = Property.objects.filter(
                    id=property_id
                ).select_related('tenant').first()
                if property_obj is None:
                    raise CommandError(f"Property {property_id} not found")
                stats = self.get_property_job_statistics(property_obj.id, days)
                
                # Determine recipients
                explicit_to = options.get("to_email")
                if explicit_to:
                    # Check if explicit email should be excluded
                    if exclude_emails:
                        email_list = [e.strip() for e in exclude_emails.split(",") if e.strip()]
                        if explicit_to in email_list:
                            logger.info("Explicit recipient is excluded")
                            self.stdout.write(self.style.WARNING("Explicit recipient is excluded"))
                            return
                    recipients = normalize_email_addresses([explicit_to])
                else:
                    user_objects = self.get_property_users(
                        property_obj.id,
                        strict_mode=strict_mode,
                        exclude_emails=exclude_emails,
                        exclude_user_ids=exclude_user_ids
                    )
                    recipients = normalize_email_addresses(
                        user_objects.values_list("email", flat=True)
                    )
                    
                    if not recipients:
                        # Only platform break-glass may receive a global fallback.
                        User = get_user_model()
                        staff_users = User.objects.filter(
                            is_active=True, is_superuser=True
                        ).exclude(email__isnull=True).exclude(email__exact="").filter(
                            Q(userprofile__email_notifications_enabled=True)
                            | Q(userprofile__isnull=True)
                        )
                        recipients = normalize_email_addresses(
                            staff_users.values_list("email", flat=True)
                        )
                        
                        if recipients:
                            logger.info(
                                "Using break-glass property summary recipients recipient_count=%s",
                                len(recipients),
                            )

                if dry_run:
                    self._write_dry_run(
                        property_obj,
                        stats['total_jobs'],
                        len(recipients),
                        bool(recipients),
                    )
                    return

                if not recipients:
                    raise CommandError("No valid recipient email addresses found")

                sent_count, failure_count = self.send_property_summary_email(
                    stats, recipients, localtime_for(property_obj)
                )
                if sent_count:
                    self.stdout.write(
                        self.style.SUCCESS(
                            "Property summary completed; "
                            f"success_count={sent_count}; failure_count={failure_count}"
                        )
                    )
                else:
                    raise CommandError(
                        "Failed to send every attempted property summary delivery"
                    )
        except CommandError:
            raise
        except Exception as exc:
            logger.exception("Error while sending property summary email: %s", exc)
            raise CommandError(
                f"Error while sending property summary email: {exc}"
            ) from exc

    def _write_dry_run(self, property_obj, job_count, recipient_count, would_send):
        self.stdout.write("DRY RUN - no email will be sent")
        self.stdout.write(f"Property ID: {property_obj.id}")
        self.stdout.write(f"Property name: {property_obj.name}")
        self.stdout.write(f"Jobs selected: {job_count}")
        self.stdout.write(f"Recipient count: {recipient_count}")
        self.stdout.write(f"Would send: {'YES' if would_send else 'NO'}")

    def send_property_summary_email(self, stats, users, now):
        """Send the property summary email."""
        try:
            # Compose email
            subject = f"Jobs Summary - {stats['property_name']} ({now.strftime('%Y-%m-%d')})"
            
            # Plain-text fallback body
            lines = [
                f"Property: {stats['property_name']} (ID: {stats['property_id']})",
                f"Date: {now.strftime('%Y-%m-%d')} ({stats['timezone_label']})",
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
                "timezone_label": stats['timezone_label'],
                "property_id": stats['property_id'],
                "property_name": stats['property_name'],
                "total_jobs": stats['total_jobs'],
                "completed_jobs": stats['completed_jobs'],
                "status_list": status_list,
                "recent_jobs": stats['recent_jobs'],
                "room_stats": stats['room_stats'],
                "topic_stats": stats['topic_stats'],
                "brand_name": "StayMaint",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://hotelcarepro.com"),
            }
            
            html_body = render_to_string("emails/property_jobs_summary.html", context)
            
            # Send to all users
            sent_count = 0
            failure_count = 0
            for user_email in users:
                try:
                    success = send_email(
                        to_email=user_email,
                        subject=subject,
                        body=body,
                        html_body=html_body
                    )
                except Exception:
                    logger.exception(
                        "Unexpected property summary transport error property_id=%s",
                        stats['property_id'],
                    )
                    success = False
                if success:
                    sent_count += 1
                    logger.info(
                        "Property summary delivery succeeded property_id=%s",
                        stats['property_id'],
                    )
                else:
                    failure_count += 1
                    logger.error(
                        "Property summary delivery failed property_id=%s",
                        stats['property_id'],
                    )
            
            return sent_count, failure_count
            
        except Exception:
            logger.exception(
                "Error preparing property summary property_id=%s",
                stats.get('property_id'),
            )
            raise
