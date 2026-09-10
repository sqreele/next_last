"""Send grouped LINE reminders for due preventive-maintenance work."""

from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from myappLubd.models import PMLineReminderDelivery
from myappLubd.notifications.pm_reminders import send_due_pm_reminders


class Command(BaseCommand):
    help = 'Send Property-grouped PM LINE reminders due at 09:00 Asia/Bangkok.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show safe reminder counts without sending or recording delivery.',
        )
        parser.add_argument(
            '--date',
            dest='run_date',
            help='Use this Bangkok run date (YYYY-MM-DD) for deterministic checks.',
        )
        parser.add_argument(
            '--reminder-type',
            choices=[
                PMLineReminderDelivery.DAY_BEFORE,
                PMLineReminderDelivery.SAME_DAY,
            ],
            help='Process only one reminder type.',
        )

    def handle(self, *args, **options):
        run_date = None
        if options['run_date']:
            try:
                run_date = date.fromisoformat(options['run_date'])
            except ValueError as exc:
                raise CommandError('--date must use YYYY-MM-DD.') from exc
            if not options['dry_run']:
                raise CommandError('--date is restricted to --dry-run to prevent historical sends.')

        results = send_due_pm_reminders(
            now=timezone.now(),
            run_date=run_date,
            reminder_type=options['reminder_type'],
            dry_run=options['dry_run'],
        )
        if not results:
            self.stdout.write('No PM LINE reminders are due.')
            if options['dry_run']:
                self.stdout.write('actual send: NO')
            return

        for result in results:
            self.stdout.write(f"Property: {result['property_name']}")
            self.stdout.write(f"date: {result['scheduled_date'].isoformat()}")
            day_before_count = result['pm_count'] if result['reminder_type'] == 'day_before' else 0
            same_day_count = result['pm_count'] if result['reminder_type'] == 'same_day' else 0
            self.stdout.write(f'day-before PM count: {day_before_count}')
            self.stdout.write(f'same-day PM count: {same_day_count}')
            self.stdout.write(f"would send: {'YES' if result['would_send'] else 'NO'}")
            self.stdout.write(f"actual send: {'YES' if result['sent'] else 'NO'}")
            self.stdout.write(f"result: {result['status']}")

        failure_statuses = {'failed', 'routing_changed', 'retry_expired'}
        if any(result['status'] in failure_statuses for result in results):
            raise CommandError(
                'One or more PM LINE reminder deliveries require retry or operator review.'
            )
