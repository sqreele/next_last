"""Batch machine maintenance dates using the canonical PM recurrence rules."""
from django.db.models import F, Max, Min
from django.utils import timezone


def get_next_maintenance_dates(machines):
    from .models import Job, PreventiveMaintenance

    machine_ids = [machine.pk for machine in machines]
    dates = dict.fromkeys(machine_ids)
    if not machine_ids:
        return dates
    scheduled = PreventiveMaintenance.objects.filter(
        machines__pk__in=machine_ids, next_due_date__gt=timezone.now(),
    ).values('machines__pk').annotate(next_date=Min('next_due_date'))
    for row in scheduled:
        dates[row['machines__pk']] = row['next_date']
    completed = Job.objects.filter(
        machine_id__in=machine_ids, status='completed', is_preventivemaintenance=True,
        completed_at__isnull=False, procedure_template__isnull=False,
        procedure_template__machines=F('machine_id'),
    ).values('machine_id', 'procedure_template_id', 'procedure_template__frequency').annotate(
        last_completed=Max('completed_at'),
    )
    for row in completed:
        recurrence = PreventiveMaintenance(
            completed_date=row['last_completed'], frequency=row['procedure_template__frequency'],
        )
        recurrence.calculate_next_due_date()
        due = recurrence.next_due_date
        previous = dates[row['machine_id']]
        if due and (previous is None or due < previous):
            dates[row['machine_id']] = due
    return dates
