import logging
from datetime import timedelta
from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.template.loader import render_to_string
from django.db.models import Q

from django.contrib.auth import get_user_model
from myappLubd.models import Job, Property
from myappLubd.email_utils import send_email
from myappLubd.timezones import local_date_bounds, localtime_for, object_timezone
from myappLubd.tenancy import get_property_summary_recipients


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send daily maintenance notification summary via email"

    def get_daily_and_monthly_stats(self, now, jobs):
        """Calculate daily status counts and monthly cumulative totals."""
        # Get start of current month
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_of_month = (start_of_month + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        end_of_month = end_of_month.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Get all jobs for the current month
        jobs_this_month = jobs.filter(
            created_at__range=(start_of_month, end_of_month)
        )
        
        # Calculate daily breakdown
        daily_stats = []
        monthly_totals = defaultdict(int)
        
        # Get all days in the current month
        current_day = start_of_month
        while current_day <= end_of_month:
            day_start = current_day.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = current_day.replace(hour=23, minute=59, second=59, microsecond=999999)
            
            # Get jobs created on this day
            day_jobs = jobs_this_month.filter(created_at__range=(day_start, day_end))
            
            # Count by status for this day
            day_status_counts = {}
            for status_key, status_label in Job.STATUS_CHOICES:
                count = day_jobs.filter(status=status_key).count()
                day_status_counts[status_key] = count
                monthly_totals[status_key] += count
            
            # Calculate total for the day
            day_total = day_jobs.count()
            
            # Calculate cumulative total up to this day
            cumulative_total = jobs_this_month.filter(
                created_at__lte=day_end
            ).count()
            
            daily_stats.append({
                'date': current_day.strftime('%Y-%m-%d'),
                'day_name': current_day.strftime('%a'),
                'day_number': current_day.day,
                'total': day_total,
                'cumulative_total': cumulative_total,
                'status_counts': day_status_counts,
                'is_today': current_day.date() == now.date(),
            })
            
            current_day += timedelta(days=1)
        
        # Convert monthly totals to list format
        monthly_status_list = [
            {
                'label': label,
                'count': monthly_totals.get(key, 0),
            }
            for key, label in Job.STATUS_CHOICES
        ]
        
        # Calculate monthly totals
        total_created_this_month = sum(monthly_totals.values())
        total_completed_this_month = jobs.filter(
            completed_at__range=(start_of_month, end_of_month)
        ).count()
        
        return {
            'daily_stats': daily_stats,
            'monthly_status_list': monthly_status_list,
            'total_created_this_month': total_created_this_month,
            'total_completed_this_month': total_completed_this_month,
            'month_name': now.strftime('%B %Y'),
        }

    def get_topic_statistics(self, now, jobs):
        """Calculate topic statistics for today and this month."""
        # Get start of current month
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_of_month = (start_of_month + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        end_of_month = end_of_month.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Get start and end of today
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Get jobs for today and this month
        jobs_today = jobs.filter(
            created_at__range=(start_of_day, end_of_day)
        ).prefetch_related('topics')
        jobs_this_month = jobs.filter(
            created_at__range=(start_of_month, end_of_month)
        ).prefetch_related('topics')

        def count_topics(job_queryset):
            counts = {}
            unique_topics = set()
            for job in job_queryset:
                for topic in job.topics.all():
                    counts[topic.title] = counts.get(topic.title, 0) + 1
                    unique_topics.add(topic.title)
            return counts, unique_topics

        today_topic_counts, all_topics_today = count_topics(jobs_today)
        monthly_topic_counts, all_topics_month = count_topics(jobs_this_month)
        
        # Convert to sorted lists
        today_topics = [
            {'title': title, 'count': count}
            for title, count in sorted(today_topic_counts.items(), key=lambda x: x[1], reverse=True)
        ]
        
        monthly_topics = [
            {'title': title, 'count': count}
            for title, count in sorted(monthly_topic_counts.items(), key=lambda x: x[1], reverse=True)
        ]
        
        return {
            'today_topics': today_topics,
            'monthly_topics': monthly_topics,
            'total_unique_topics_today': len(all_topics_today),
            'total_unique_topics_month': len(all_topics_month),
            'total_topic_assignments_today': sum(today_topic_counts.values()),
            'total_topic_assignments_month': sum(monthly_topic_counts.values()),
        }

    def _build_summary(self, now, jobs):
        """Build every operational metric from one pre-scoped Job queryset."""
        start_of_day, end_of_window = local_date_bounds(now)
        jobs_today = jobs.filter(created_at__range=(start_of_day, end_of_window))
        status_counts = {
            status_key: jobs_today.filter(status=status_key).count()
            for status_key, _ in Job.STATUS_CHOICES
        }
        return {
            'total_created': jobs_today.count(),
            'status_counts': status_counts,
            'completed_today': jobs.filter(
                completed_at__range=(start_of_day, end_of_window)
            ).count(),
            'monthly_stats': self.get_daily_and_monthly_stats(now, jobs),
            'topic_stats': self.get_topic_statistics(now, jobs),
        }

    def build_property_summary(self, property_obj, now):
        """Build a summary with a positive boundary on one exact Property."""
        if property_obj is None:
            raise CommandError('A valid Property is required for a Property summary.')
        return self._build_summary(
            now,
            Job.objects.filter(property=property_obj),
        )

    def build_global_summary(self, now):
        """Build the intentionally global platform-administrative summary."""
        return self._build_summary(now, Job.objects.all())

    def resolve_property(self, identifier):
        """Resolve a numeric PK or public Property ID, failing closed."""
        lookup = Q(property_id=str(identifier))
        if str(identifier).isdigit():
            lookup |= Q(pk=int(identifier))
        try:
            return Property.objects.select_related('tenant').get(lookup)
        except Property.DoesNotExist:
            raise CommandError(f'Property {identifier!r} does not exist.') from None
        except Property.MultipleObjectsReturned:
            raise CommandError(f'Property {identifier!r} is ambiguous.') from None

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
            help="Send daily summary for all properties to their respective users",
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

    def handle(self, *args, **options):
        try:
            if options.get('all_properties') and options.get('property_id'):
                raise CommandError(
                    '--property-id and --all-properties cannot be used together.'
                )

            # Handle --all-properties flag
            if options.get('all_properties'):
                self._handle_all_properties(options)
                return

            property_obj = None
            property_id = options.get('property_id')
            if property_id:
                property_obj = self.resolve_property(property_id)

            now = localtime_for(property_obj)
            timezone_label = object_timezone(property_obj).key

            if property_obj:
                summary = self.build_property_summary(property_obj, now)
            else:
                summary = self.build_global_summary(now)
            total_created = summary['total_created']
            status_counts = summary['status_counts']
            completed_today = summary['completed_today']
            monthly_stats = summary['monthly_stats']
            topic_stats = summary['topic_stats']

            # Compose email
            if property_obj:
                subject = f"Daily Maintenance Summary - {property_obj.name} - {now.strftime('%Y-%m-%d')}"
            else:
                subject = f"Daily Maintenance Summary - {now.strftime('%Y-%m-%d')}"

            # Plain-text fallback body
            lines = [
                f"Date: {now.strftime('%Y-%m-%d')} ({timezone_label})",
            ]
            
            if property_obj:
                lines.extend([
                    f"Property: {property_obj.name} (ID: {property_obj.property_id})",
                    "",
                ])
            
            lines.extend([
                f"TODAY'S SUMMARY:",
                f"Total jobs created today: {total_created}",
                f"Total jobs completed today: {completed_today}",
                "",
                "Breakdown by status (created today):",
            ])
            for key, label in Job.STATUS_CHOICES:
                lines.append(f"- {label}: {status_counts.get(key, 0)}")
            
            lines.extend([
                "",
                f"MONTHLY SUMMARY ({monthly_stats['month_name']}):",
                f"Total jobs created this month: {monthly_stats['total_created_this_month']}",
                f"Total jobs completed this month: {monthly_stats['total_completed_this_month']}",
                "",
                "Monthly breakdown by status:",
            ])
            for item in monthly_stats['monthly_status_list']:
                lines.append(f"- {item['label']}: {item['count']}")
            
            lines.extend([
                "",
                "TOPIC STATISTICS:",
                f"Topics used today: {topic_stats['total_unique_topics_today']} unique topics, {topic_stats['total_topic_assignments_today']} total assignments",
                f"Topics used this month: {topic_stats['total_unique_topics_month']} unique topics, {topic_stats['total_topic_assignments_month']} total assignments",
                "",
                "Top topics today:",
            ])
            
            if topic_stats['today_topics']:
                for topic in topic_stats['today_topics'][:5]:  # Show top 5
                    lines.append(f"- {topic['title']}: {topic['count']} jobs")
            else:
                lines.append("- No topics assigned today")
            
            lines.extend([
                "",
                "Top topics this month:",
            ])
            
            if topic_stats['monthly_topics']:
                for topic in topic_stats['monthly_topics'][:10]:  # Show top 10
                    lines.append(f"- {topic['title']}: {topic['count']} jobs")
            else:
                lines.append("- No topics assigned this month")
            
            lines.extend([
                "",
                "DAILY BREAKDOWN:",
                "Date       | Day | Daily | Cumulative | Status Breakdown",
                "-" * 60,
            ])
            
            for day in monthly_stats['daily_stats']:
                status_breakdown = []
                for status_key, count in day['status_counts'].items():
                    if count > 0:
                        status_breakdown.append(f"{status_key}: {count}")
                
                status_str = ", ".join(status_breakdown) if status_breakdown else "None"
                lines.append(f"{day['date']} | {day['day_name']} | {day['total']:5d} | {day['cumulative_total']:10d} | {status_str}")
            
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
                "timezone_label": timezone_label,
                "total_created": total_created,
                "completed_today": completed_today,
                "status_list": status_list,
                "brand_name": "HotelCare Pro",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://hotelcarepro.com"),
                # Monthly statistics
                "monthly_stats": monthly_stats,
                "daily_stats": monthly_stats['daily_stats'],
                "monthly_status_list": monthly_stats['monthly_status_list'],
                "total_created_this_month": monthly_stats['total_created_this_month'],
                "total_completed_this_month": monthly_stats['total_completed_this_month'],
                "month_name": monthly_stats['month_name'],
                # Topic statistics
                "topic_stats": topic_stats,
                "today_topics": topic_stats['today_topics'],
                "monthly_topics": topic_stats['monthly_topics'],
                "total_unique_topics_today": topic_stats['total_unique_topics_today'],
                "total_unique_topics_month": topic_stats['total_unique_topics_month'],
                "total_topic_assignments_today": topic_stats['total_topic_assignments_today'],
                "total_topic_assignments_month": topic_stats['total_topic_assignments_month'],
            }
            html_body = render_to_string("emails/daily_summary.html", context)

            # Determine recipients
            explicit_to = options.get("to_email")
            recipients = []

            # Allow override via environment variable for fixed recipients list
            env_recipients = getattr(settings, "DAILY_SUMMARY_RECIPIENTS", None)

            if explicit_to:
                recipients = [explicit_to]
            elif env_recipients and property_obj is None:
                # The configured list is reserved for the intentionally global
                # platform-administrative report. Property reports derive
                # recipients from Property authorization below.
                # Support comma/semicolon separated list in env
                if isinstance(env_recipients, str):
                    candidates = [e.strip() for e in env_recipients.replace(";", ",").split(",")]
                else:
                    candidates = list(env_recipients)
                recipients = [e for e in candidates if e]
            else:
                User = get_user_model()
                if property_obj:
                    # Filter users by property assignment - only users assigned to this property receive emails
                    users_qs = get_property_summary_recipients(property_obj).filter(
                        is_active=True
                    ).exclude(email__isnull=True).exclude(email__exact="")
                elif options.get("all_users"):
                    users_qs = User.objects.filter(is_active=True).exclude(email__isnull=True).exclude(email__exact="")
                else:
                    users_qs = (
                        User.objects.filter(is_active=True, is_superuser=True)
                        .exclude(email__isnull=True)
                        .exclude(email__exact="")
                    )
                
                # Exclude users with email notifications disabled
                users_qs = users_qs.filter(
                    Q(userprofile__email_notifications_enabled=True) | Q(userprofile__isnull=True)
                )
                
                # Exclude specific emails if provided
                exclude_emails = options.get("exclude_emails")
                if exclude_emails:
                    email_list = [e.strip() for e in exclude_emails.split(",") if e.strip()]
                    if email_list:
                        users_qs = users_qs.exclude(email__in=email_list)
                
                # Exclude specific user IDs if provided
                exclude_user_ids = options.get("exclude_user_ids")
                if exclude_user_ids:
                    try:
                        user_id_list = [int(uid.strip()) for uid in exclude_user_ids.split(",") if uid.strip()]
                        if user_id_list:
                            users_qs = users_qs.exclude(id__in=user_id_list)
                    except ValueError:
                        logger.warning(f"Invalid user IDs in --exclude-user-ids: {exclude_user_ids}")
                
                recipients = list(users_qs.values_list("email", flat=True))

                if not recipients and property_obj is None:
                    fallback = getattr(settings, "SERVER_EMAIL", None) or getattr(settings, "DEFAULT_FROM_EMAIL", None)
                    if fallback:
                        recipients = [fallback]

            if not recipients:
                logger.error("No recipient email addresses found.")
                self.stdout.write(self.style.ERROR("No recipient email addresses found"))
                return
            
            # Log recipient info for debugging
            logger.info(
                "Sending daily summary to %s recipients%s",
                len(recipients),
                f" for property {property_obj.property_id}" if property_obj else "",
            )

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
        except CommandError:
            raise
        except Exception as exc:
            logger.exception("Error while sending daily summary email: %s", exc)
            self.stdout.write(self.style.ERROR(f"Error: {exc}"))

    def _handle_all_properties(self, options):
        """Send daily summary for all properties to their respective users."""
        properties = Property.objects.select_related('tenant')
        total_sent = 0
        total_properties = properties.count()
        
        User = get_user_model()
        exclude_emails = options.get('exclude_emails')
        exclude_user_ids = options.get('exclude_user_ids')
        
        for property_obj in properties:
            property_id = property_obj.id
            now = localtime_for(property_obj)
            timezone_label = object_timezone(property_obj).key
            
            # Get users assigned to this property
            users_qs = get_property_summary_recipients(property_obj).filter(
                is_active=True
            ).exclude(email__isnull=True).exclude(email__exact="")
            
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
                    pass
            
            recipients = list(users_qs.values_list("email", flat=True).distinct())
            
            if not recipients:
                logger.info(f"No users assigned to property {property_obj.name}, skipping")
                continue
            
            # Every metric is independently rebuilt from this exact Property.
            summary = self.build_property_summary(property_obj, now)
            total_created = summary['total_created']
            
            if total_created == 0:
                logger.info(f"No jobs today for property {property_obj.name}, skipping")
                continue

            status_counts = summary['status_counts']
            completed_today = summary['completed_today']
            monthly_stats = summary['monthly_stats']
            topic_stats = summary['topic_stats']
            
            # Build email
            subject = f"Daily Maintenance Summary - {property_obj.name} - {now.strftime('%Y-%m-%d')}"
            
            # Plain-text body
            lines = [
                f"Date: {now.strftime('%Y-%m-%d')} ({timezone_label})",
                f"Property: {property_obj.name} (ID: {property_obj.property_id})",
                "",
                f"TODAY'S SUMMARY:",
                f"Total jobs created today: {total_created}",
                f"Total jobs completed today: {completed_today}",
                "",
                "Breakdown by status:",
            ]
            for key, label in Job.STATUS_CHOICES:
                lines.append(f"- {label}: {status_counts.get(key, 0)}")
            
            body = "\n".join(lines)
            
            # HTML body
            status_list = [
                {"label": label, "count": status_counts.get(key, 0)}
                for key, label in Job.STATUS_CHOICES
            ]
            context = {
                "date_str": now.strftime('%Y-%m-%d'),
                "timezone_label": timezone_label,
                "total_created": total_created,
                "completed_today": completed_today,
                "status_list": status_list,
                "brand_name": "HotelCare Pro",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://hotelcarepro.com"),
                "monthly_stats": monthly_stats,
                "daily_stats": monthly_stats['daily_stats'],
                "monthly_status_list": monthly_stats['monthly_status_list'],
                "total_created_this_month": monthly_stats['total_created_this_month'],
                "total_completed_this_month": monthly_stats['total_completed_this_month'],
                "month_name": monthly_stats['month_name'],
                "topic_stats": topic_stats,
                "today_topics": topic_stats['today_topics'],
                "monthly_topics": topic_stats['monthly_topics'],
                "total_unique_topics_today": topic_stats['total_unique_topics_today'],
                "total_unique_topics_month": topic_stats['total_unique_topics_month'],
                "total_topic_assignments_today": topic_stats['total_topic_assignments_today'],
                "total_topic_assignments_month": topic_stats['total_topic_assignments_month'],
            }
            html_body = render_to_string("emails/daily_summary.html", context)
            
            # Send to all property users
            sent_count = 0
            for to_email in recipients:
                success = send_email(to_email=to_email, subject=subject, body=body, html_body=html_body)
                if success:
                    sent_count += 1
                    logger.info(f"Daily summary sent to {to_email} for property {property_obj.name}")
                else:
                    logger.error(f"Failed to send daily summary to {to_email}")
            
            if sent_count > 0:
                total_sent += 1
                logger.info(f"Daily summary sent for property {property_obj.name} to {sent_count} users")
        
        self.stdout.write(
            self.style.SUCCESS(f"Daily summaries sent for {total_sent}/{total_properties} properties")
        )
