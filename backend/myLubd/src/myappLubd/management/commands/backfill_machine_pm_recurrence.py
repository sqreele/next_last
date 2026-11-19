"""Add missing PM appointments for the latest completed machine/template jobs."""
from django.core.management.base import BaseCommand

from myappLubd.machine_pm_recurrence import schedule_next_machine_pm
from myappLubd.models import Job


class Command(BaseCommand):
    help = 'Preview missing machine PM appointments; pass --apply to create them.'

    def add_arguments(self, parser):
        parser.add_argument('--machine-id')
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        jobs = Job.objects.filter(
            status='completed', completed_at__isnull=False,
            is_preventivemaintenance=True, machine__isnull=False,
            procedure_template__isnull=False,
        ).select_related('machine', 'procedure_template', 'created_by', 'user')
        if options['machine_id']:
            jobs = jobs.filter(machine__machine_id=options['machine_id'])
        seen = set()
        for job in jobs.order_by('-completed_at', '-pk'):
            key = (job.machine_id, job.procedure_template_id)
            if key in seen:
                continue
            seen.add(key)
            if options['apply']:
                pm = schedule_next_machine_pm(job)
                self.stdout.write(f'{job.job_id}: {pm.pm_id if pm else "skipped"}')
            else:
                self.stdout.write(f'PREVIEW {job.job_id}: {job.machine.machine_id} / {job.procedure_template.name}')
