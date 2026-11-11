"""Canonical property scope for PM records across API and admin."""
from django.db.models import Count, Q, Exists, OuterRef
from .models import PreventiveMaintenance, Machine
from .tenancy import accessible_property_ids, restrict_pm_for_company_technicians


def canonical_pm_queryset(user, property_filter=None):
    """Return PM rows with one canonical property and TenantMembership scope."""
    job_machine_conflict = Machine.objects.filter(
        preventive_maintenances=OuterRef('pk')
    ).exclude(property_id=OuterRef('job__property_id'))

    queryset = PreventiveMaintenance.objects.select_related(
        'job__property',
        'created_by',
        'completed_by',
        'verified_by',
        'assigned_to',
        'procedure_template',
    ).prefetch_related(
        'topics',
        'machines',
        'machines__property',
        'job__rooms',
        'images__uploaded_by',
    ).annotate(
        machine_property_count=Count('machines__property_id', distinct=True),
        has_job_machine_conflict=Exists(job_machine_conflict),
    ).filter(
        machine_property_count__lte=1,
    ).filter(
        Q(job__isnull=True) | Q(has_job_machine_conflict=False),
    ).filter(
        Q(job__property__isnull=False) | Q(machine_property_count=1),
    )

    if not user.is_superuser:
        property_ids = accessible_property_ids(user)
        inaccessible_machines = Machine.objects.filter(
            preventive_maintenances=OuterRef('pk')
        ).exclude(property_id__in=property_ids)
        queryset = queryset.annotate(
            has_inaccessible_machine=Exists(inaccessible_machines)
        ).filter(
            has_inaccessible_machine=False,
        ).filter(
            Q(job__isnull=True) | Q(job__property_id__in=property_ids)
        ).filter(
            Q(job__property_id__in=property_ids) | Q(machines__property_id__in=property_ids)
        )

    if property_filter:
        machines_outside_property = Machine.objects.filter(
            preventive_maintenances=OuterRef('pk')
        ).exclude(property__property_id=property_filter)
        queryset = queryset.annotate(
            has_machine_outside_property=Exists(machines_outside_property)
        ).filter(
            has_machine_outside_property=False,
        ).filter(
            Q(job__isnull=True) | Q(job__property__property_id=property_filter)
        ).filter(
            Q(job__property__property_id=property_filter)
            | Q(machines__property__property_id=property_filter)
        )

    return restrict_pm_for_company_technicians(queryset, user)
