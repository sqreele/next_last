from django.core.management.base import BaseCommand
from django.utils import timezone

from myappLubd.models import PreventiveMaintenance


class Command(BaseCommand):
    help = "Mark preventive maintenance tasks as overdue when scheduled date has passed."

    def handle(self, *args, **options):
        now = timezone.now()
        updated = PreventiveMaintenance.objects.filter(
            scheduled_date__lt=now,
            status__in=['pending', 'in_progress'],
        ).update(status='overdue', updated_at=now)

        self.stdout.write(
            self.style.SUCCESS(f"Marked {updated} preventive maintenance tasks as overdue.")
        )
