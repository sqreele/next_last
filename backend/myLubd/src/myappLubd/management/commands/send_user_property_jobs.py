import logging
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.template.loader import render_to_string
from django.db.models import Count, Q

from django.contrib.auth import get_user_model
from myappLubd.models import Job, Property
from myappLubd.email_utils import normalize_email_addresses, send_email
from myappLubd.timezones import localtime_for
from myappLubd.tenancy import get_accessible_properties, get_property_summary_email_users


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send personalized job emails to users based on their property access and date filtering"

    def _users_with_property_access(self, property_id):
        """Return active users authorized by the canonical access helper."""
        User = get_user_model()
        property_obj = Property.objects.filter(pk=property_id).first()
        if property_obj is None:
            return User.objects.none()
        return get_property_summary_email_users(property_obj)

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
            "--all-properties",
            action="store_true",
            dest="all_properties",
            help="Send user job emails for all properties to their respective users",
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
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Resolve assigned-job and recipient counts without sending email",
        )

    def _primary_user_property(self, user):
        return get_accessible_properties(user).select_related('tenant').first()

    def get_user_property_jobs(self, user, property_id, days, status_filter=None, priority_filter=None, now=None):
        """Get jobs for a specific user and property within date range."""
        if now is None:
            property_obj = Property.objects.filter(id=property_id).select_related('tenant').first() if property_id else self._primary_user_property(user)
            now = localtime_for(property_obj)
        start_date = now - timedelta(days=days)
        
        # Base query for jobs in date range
        jobs_query = Job.objects.filter(
            created_at__gte=start_date,
            user=user,
        )
        
        # Apply property filter
        # Jobs are related to properties through rooms.properties
        if property_id:
            jobs_query = jobs_query.filter(
                property__id=property_id
            )
        else:
            jobs_query = jobs_query.filter(property__in=get_accessible_properties(user))
        
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
                "brand_name": "StayMaint",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://hotelcarepro.com"),
            }
            
            html_body = render_to_string("emails/user_property_jobs.html", context)
            
            # Send email
            recipients = normalize_email_addresses([user.email])
            if not recipients:
                logger.warning(
                    "User job summary skipped invalid recipient user_id=%s",
                    user.id,
                )
                return False

            success = send_email(
                to_email=recipients[0],
                subject=subject,
                body=body,
                html_body=html_body
            )
            
            if success:
                logger.info(
                    "User job summary delivery succeeded user_id=%s property_id=%s",
                    user.id,
                    getattr(property_obj, 'id', None),
                )
                return True
            else:
                logger.error(
                    "User job summary delivery failed user_id=%s property_id=%s",
                    user.id,
                    getattr(property_obj, 'id', None),
                )
                return False
                
        except Exception:
            logger.exception(
                "Error preparing user job summary user_id=%s property_id=%s",
                user.id,
                getattr(property_obj, 'id', None),
            )
            raise

    def handle(self, *args, **options):
        try:
            days = options.get('days', 7)
            property_id = options.get('property_id')
            user_id = options.get('user_id')
            status_filter = options.get('status')
            priority_filter = options.get('priority')
            test_mode = options.get('test_mode', False)
            dry_run = options.get('dry_run', False)
            
            if options.get('all_properties'):
                self._handle_all_properties(
                    options, days, status_filter, priority_filter, test_mode, dry_run
                )
                return
            
            User = get_user_model()
            property_obj = None
            if property_id:
                property_obj = Property.objects.filter(
                    id=property_id
                ).select_related('tenant').first()
                if property_obj is None:
                    raise CommandError(f"Property {property_id} not found")

            if user_id:
                users = User.objects.filter(id=user_id, is_active=True).exclude(email__isnull=True).exclude(email__exact="")
                if property_obj is not None:
                    users = users.filter(
                        pk__in=self._users_with_property_access(property_obj.id)
                    )
            elif property_obj is not None:
                users = self._users_with_property_access(property_id).filter(
                    is_active=True
                ).exclude(email__isnull=True).exclude(email__exact="")
            else:
                users = User.objects.filter(is_active=True).exclude(email__isnull=True).exclude(email__exact="")
            
            users = users.filter(
                Q(userprofile__email_notifications_enabled=True) | Q(userprofile__isnull=True)
            )
            users = self._apply_exclusions(users, options)
            
            if not users.exists():
                if dry_run:
                    self._write_dry_run(property_obj, 0, 0, 0)
                    return
                raise CommandError("No authorized active recipients found")
            
            if test_mode:
                users = users[:1]
                self.stdout.write(self.style.WARNING("Test mode: Sending to first user only"))

            sent_count = 0
            failure_count = 0
            attempted_count = 0
            selected_job_count = 0
            eligible_recipient_count = 0
            total_users = users.count()
            
            for user in users:
                user_property_obj = property_obj or self._primary_user_property(user)
                now = localtime_for(user_property_obj)
                jobs = self.get_user_property_jobs(user, property_id, days, status_filter, priority_filter, now)
                job_count = jobs.count()
                selected_job_count += job_count
                
                if not job_count:
                    logger.info("No assigned jobs found user_id=%s", user.id)
                    continue
                eligible_recipient_count += 1

                if dry_run:
                    continue

                stats = self.get_job_statistics(jobs)
                attempted_count += 1
                try:
                    success = self.send_user_job_email(
                        user, user_property_obj, jobs, stats, days, now
                    )
                except Exception:
                    success = False
                if success:
                    sent_count += 1
                else:
                    failure_count += 1
                
                if test_mode:
                    break

            if dry_run:
                self._write_dry_run(
                    property_obj,
                    selected_job_count,
                    total_users,
                    eligible_recipient_count,
                )
                return

            if sent_count > 0:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"User job summaries completed; success_count={sent_count}; "
                        f"failure_count={failure_count}"
                    )
                )
            elif attempted_count:
                raise CommandError(
                    "Failed to send every attempted user job summary delivery"
                )
            else:
                self.stdout.write(
                    self.style.WARNING("No emails were sent because no assigned jobs were found")
                )
        except CommandError:
            raise
        except Exception as exc:
            logger.exception("Error while sending user property job emails: %s", exc)
            raise CommandError(
                f"Error while sending user property job emails: {exc}"
            ) from exc

    def _handle_all_properties(
        self, options, days, status_filter, priority_filter, test_mode, dry_run
    ):
        """Send user job emails for all properties to their respective users."""
        properties = list(Property.objects.select_related('tenant'))
        successful_properties = 0
        attempted_count = 0
        sent_count = 0
        failure_count = 0
        
        for property_obj in properties:
            property_id = property_obj.id
            users = self._apply_exclusions(
                self._users_with_property_access(property_id), options
            )
            authorized_recipient_count = users.count()

            if test_mode:
                users = users[:1]

            property_sent_count = 0
            selected_job_count = 0
            eligible_recipient_count = 0
            for user in users:
                now = localtime_for(property_obj)
                jobs = self.get_user_property_jobs(user, property_id, days, status_filter, priority_filter, now)
                job_count = jobs.count()
                selected_job_count += job_count
                if not job_count:
                    logger.info(
                        "No assigned jobs user_id=%s property_id=%s",
                        user.id,
                        property_id,
                    )
                    continue
                eligible_recipient_count += 1

                if dry_run:
                    continue

                stats = self.get_job_statistics(jobs)
                attempted_count += 1
                try:
                    success = self.send_user_job_email(
                        user, property_obj, jobs, stats, days, now
                    )
                except Exception:
                    success = False
                if success:
                    property_sent_count += 1
                    sent_count += 1
                else:
                    failure_count += 1

                if test_mode:
                    break

            if dry_run:
                self._write_dry_run(
                    property_obj,
                    selected_job_count,
                    authorized_recipient_count,
                    eligible_recipient_count,
                )
                continue

            if property_sent_count > 0:
                successful_properties += 1
                logger.info(
                    "User job summaries completed property_id=%s success_count=%s",
                    property_id,
                    property_sent_count,
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
                "User job summaries sent for "
                f"{successful_properties}/{len(properties)} properties; "
                f"success_count={sent_count}; failure_count={failure_count}"
            )
        )
        if attempted_count and not sent_count:
            raise CommandError(
                "Failed to send every attempted user job summary delivery"
            )

    def _apply_exclusions(self, users, options):
        exclude_emails = options.get('exclude_emails')
        if exclude_emails:
            email_list = normalize_email_addresses(exclude_emails.split(','))
            if email_list:
                users = users.exclude(email__in=email_list)

        exclude_user_ids = options.get('exclude_user_ids')
        if exclude_user_ids:
            try:
                user_id_list = [
                    int(uid.strip())
                    for uid in exclude_user_ids.split(',')
                    if uid.strip()
                ]
            except ValueError:
                logger.warning("Invalid user IDs supplied to exclusion option")
            else:
                if user_id_list:
                    users = users.exclude(id__in=user_id_list)
        return users.distinct()

    def _write_dry_run(
        self,
        property_obj,
        job_count,
        authorized_recipient_count,
        eligible_recipient_count,
    ):
        self.stdout.write("DRY RUN - no email will be sent")
        self.stdout.write(
            f"Property ID: {property_obj.id if property_obj else 'ALL'}"
        )
        self.stdout.write(
            f"Property name: {property_obj.name if property_obj else 'All accessible properties'}"
        )
        self.stdout.write(f"Assigned jobs selected: {job_count}")
        self.stdout.write(
            f"Authorized recipient count: {authorized_recipient_count}"
        )
        self.stdout.write(f"Eligible recipient count: {eligible_recipient_count}")
        self.stdout.write(
            f"Would send: {'YES' if eligible_recipient_count else 'NO'}"
        )
