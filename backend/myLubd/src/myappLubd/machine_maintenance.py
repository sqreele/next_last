"""Batch planned and recurring PM dates, including legacy maintenance baselines."""
from django.db.models import F, Max, Min, Q
from django.db.models.functions import Coalesce
from django.utils import timezone


def get_next_maintenance_dates(machines):
    from .models import Job, MaintenanceProcedure, PMMasterPlan, PreventiveMaintenance

    machines = list(machines)
    dates = dict.fromkeys(machine.pk for machine in machines)
    if not dates:
        return dates

    def record(machine_id, due):
        previous = dates[machine_id]
        if due is not None and (previous is None or due < previous):
            dates[machine_id] = due

    # Pending PM rows may have only a scheduled_date. Keep overdue work visible.
    scheduled = PreventiveMaintenance.objects.filter(machines__pk__in=dates).exclude(
        status='cancelled',
    ).filter(
        Q(next_due_date__gt=timezone.now()) | ~Q(status__in=['completed', 'verified']),
    ).annotate(due=Coalesce('next_due_date', 'scheduled_date')).values('machines__pk').annotate(
        next_date=Min('due'),
    )
    for row in scheduled:
        record(row['machines__pk'], row['next_date'])

    completions = {}
    completed = Job.objects.filter(
        machine_id__in=dates, status='completed', is_preventivemaintenance=True,
        completed_at__isnull=False, procedure_template__isnull=False,
        procedure_template__machines=F('machine_id'),
    ).values('machine_id', 'procedure_template_id').annotate(last_completed=Max('completed_at'))
    for row in completed:
        completions[(row['machine_id'], row['procedure_template_id'])] = row['last_completed']

    # Master rules are already planned, even before an actual PM is generated.
    plans = PMMasterPlan.objects.filter(active=True, machines__pk__in=dates).annotate(
        due=Coalesce('next_due_date', 'start_date'),
    ).values('machines__pk', 'due')
    for row in plans:
        record(row['machines__pk'], row['due'])

    baselines = {machine.pk: machine.last_maintenance_date for machine in machines}
    templates = MaintenanceProcedure.objects.filter(machines__pk__in=dates).values(
        'id', 'machines__pk', 'frequency',
    )
    for row in templates:
        machine_id = row['machines__pk']
        # Explicit template history wins over the machine-wide legacy date.
        baseline = completions.get((machine_id, row['id']), baselines[machine_id])
        if baseline is None:
            continue
        recurrence = PreventiveMaintenance(completed_date=baseline, frequency=row['frequency'])
        recurrence.calculate_next_due_date()
        record(machine_id, recurrence.next_due_date)
    return dates
