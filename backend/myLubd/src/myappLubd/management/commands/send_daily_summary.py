import logging
from datetime import datetime, timedelta
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from django.template.loader import render_to_string
from django.db.models import Count, Q

from django.contrib.auth import get_user_model
from myappLubd.models import Job, Topic
from myappLubd.email_utils import send_email


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send daily maintenance notification summary via email"

    def get_daily_and_monthly_stats(self, now):
        """Calculate daily status counts and monthly cumulative totals."""
        # Get start of current month
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_of_month = (start_of_month + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        end_of_month = end_of_month.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Get all jobs for the current month
        jobs_this_month = Job.objects.filter(
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
        total_completed_this_month = Job.objects.filter(
            completed_at__range=(start_of_month, end_of_month)
        ).count()
        
        return {
            'daily_stats': daily_stats,
            'monthly_status_list': monthly_status_list,
            'total_created_this_month': total_created_this_month,
            'total_completed_this_month': total_completed_this_month,
            'month_name': now.strftime('%B %Y'),
        }

    def get_topic_statistics(self, now):
        """Calculate topic statistics for today and this month."""
        # Get start of current month
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_of_month = (start_of_month + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        end_of_month = end_of_month.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Get start and end of today
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Get jobs for today and this month
        jobs_today = Job.objects.filter(created_at__range=(start_of_day, end_of_day))
        jobs_this_month = Job.objects.filter(created_at__range=(start_of_month, end_of_month))
        
        # Calculate topic counts for today
        today_topic_counts = {}
        for job in jobs_today:
            for topic in job.topics.all():
                today_topic_counts[topic.title] = today_topic_counts.get(topic.title, 0) + 1
        
        # Calculate topic counts for this month
        monthly_topic_counts = {}
        for job in jobs_this_month:
            for topic in job.topics.all():
                monthly_topic_counts[topic.title] = monthly_topic_counts.get(topic.title, 0) + 1
        
        # Convert to sorted lists
        today_topics = [
            {'title': title, 'count': count}
            for title, count in sorted(today_topic_counts.items(), key=lambda x: x[1], reverse=True)
        ]
        
        monthly_topics = [
            {'title': title, 'count': count}
            for title, count in sorted(monthly_topic_counts.items(), key=lambda x: x[1], reverse=True)
        ]
        
        # Get total unique topics used
        all_topics_today = set()
        for job in jobs_today:
            all_topics_today.update(job.topics.values_list('title', flat=True))
        
        all_topics_month = set()
        for job in jobs_this_month:
            all_topics_month.update(job.topics.values_list('title', flat=True))
        
        return {
            'today_topics': today_topics,
            'monthly_topics': monthly_topics,
            'total_unique_topics_today': len(all_topics_today),
            'total_unique_topics_month': len(all_topics_month),
            'total_topic_assignments_today': sum(today_topic_counts.values()),
            'total_topic_assignments_month': sum(monthly_topic_counts.values()),
        }

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

    def handle(self, *args, **options):
        try:
            # Use Asia/Bangkok timezone as configured
            now = timezone.localtime()

            # Define the 24-hour window for the day that just ended at 23:00
            # but since we run at 23:00, we summarize the current day 00:00 -> 23:00
            start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_window = now.replace(minute=59, second=59, microsecond=999999)

            # Aggregate Job status counts for today
            jobs_today = Job.objects.filter(created_at__range=(start_of_day, end_of_window))
            total_created = jobs_today.count()
            status_counts = {
                status_key: jobs_today.filter(status=status_key).count()
                for status_key, _ in Job.STATUS_CHOICES
            }

            completed_today = Job.objects.filter(
                completed_at__range=(start_of_day, end_of_window)
            ).count()

            # Get daily and monthly statistics
            monthly_stats = self.get_daily_and_monthly_stats(now)
            
            # Get topic statistics
            topic_stats = self.get_topic_statistics(now)

            # Compose email
            subject = f"Daily Maintenance Summary - {now.strftime('%Y-%m-%d')}"

            # Plain-text fallback body
            lines = [
                f"Date: {now.strftime('%Y-%m-%d')} (Asia/Bangkok)",
                "",
                f"TODAY'S SUMMARY:",
                f"Total jobs created today: {total_created}",
                f"Total jobs completed today: {completed_today}",
                "",
                "Breakdown by status (created today):",
            ]
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
                "timezone_label": "Asia/Bangkok",
                "total_created": total_created,
                "completed_today": completed_today,
                "status_list": status_list,
                "brand_name": "PCMS",
                "base_url": getattr(settings, "FRONTEND_BASE_URL", "https://pcms.live"),
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
            elif env_recipients:
                # Support comma/semicolon separated list in env
                if isinstance(env_recipients, str):
                    candidates = [e.strip() for e in env_recipients.replace(";", ",").split(",")]
                else:
                    candidates = list(env_recipients)
                recipients = [e for e in candidates if e]
            else:
                User = get_user_model()
                if options.get("all_users"):
                    users_qs = User.objects.filter(is_active=True).exclude(email__isnull=True).exclude(email__exact="")
                else:
                    users_qs = (
                        User.objects.filter(is_active=True, is_staff=True)
                        .exclude(email__isnull=True)
                        .exclude(email__exact="")
                    )
                recipients = list(users_qs.values_list("email", flat=True))

                if not recipients:
                    fallback = getattr(settings, "SERVER_EMAIL", None) or getattr(settings, "DEFAULT_FROM_EMAIL", None)
                    if fallback:
                        recipients = [fallback]

            if not recipients:
                logger.error("No recipient email addresses found.")
                self.stdout.write(self.style.ERROR("No recipient email addresses found"))
                return

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
        except Exception as exc:
            logger.exception("Error while sending daily summary email: %s", exc)
            self.stdout.write(self.style.ERROR(f"Error: {exc}"))

