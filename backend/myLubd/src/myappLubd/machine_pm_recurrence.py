"""Schedule actual, notification-eligible PM work after machine job completion."""
from django.db import transaction
from django.utils import timezone

from .models import Job, Machine, PMMasterPlan, PreventiveMaintenance


@transaction.atomic
def schedule_next_machine_pm(job):
    if not (job.machine_id and job.procedure_template_id
            and job.is_preventivemaintenance and job.status == 'completed'
            and job.completed_at):
        return None

    # Serialize completions for this machine, including retries and backfills.
    machine = Machine.objects.select_for_update().get(pk=job.machine_id)
    template = job.procedure_template
    if (machine.property_id != job.property_id or template.property_id != job.property_id
            or not template.machines.filter(pk=machine.pk).exists()):
        return None
    latest = Job.objects.filter(
        machine=machine, procedure_template=template, is_preventivemaintenance=True,
        status='completed', completed_at__isnull=False,
    ).order_by('-completed_at', '-pk').first()
    if latest is None or latest.pk != job.pk:
        return None

    existing = PreventiveMaintenance.objects.filter(recurrence_source_job=job).first()
    if existing:
        return existing

    # An explicit master plan retains ownership of its recurrence.
    if PMMasterPlan.objects.filter(active=True, machines=machine, procedure_template=template).exists():
        return None

    recurrence = PreventiveMaintenance(completed_date=job.completed_at, frequency=template.frequency)
    recurrence.calculate_next_due_date()
    due = recurrence.next_due_date
    if due is None:
        return None

    # Completing another work order for the same task fulfils the previous
    # automatically scheduled occurrence, including work done ahead of its due date.
    previous = PreventiveMaintenance.objects.filter(
        machines=machine, procedure_template=template,
        recurrence_source_job__isnull=False, completed_date__isnull=True,
    ).exclude(status='cancelled')
    previous.update(status='completed', completed_date=job.completed_at, next_due_date=None,
                    updated_at=timezone.now())

    # Preserve an existing manually scheduled occurrence rather than duplicating it.
    pending = PreventiveMaintenance.objects.filter(
        machines=machine, procedure_template=template, completed_date__isnull=True,
    ).exclude(status__in=['cancelled', 'completed', 'verified']).first()
    if pending:
        return pending

    pm = PreventiveMaintenance.objects.create(
        recurrence_source_job=job, pmtitle=template.name,
        scheduled_date=due, frequency=template.frequency,
        procedure_template=template, status='pending',
        created_by=job.created_by or job.user, assigned_to=job.assigned_to,
        generated_at=timezone.now(),
    )
    pm.machines.add(machine)
    pm.topics.set(job.topics.all())
    return pm
