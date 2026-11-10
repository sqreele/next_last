"""PreventiveMaintenanceService domain operations."""
from typing import Dict, List, Optional, Any
from datetime import datetime
from calendar import monthrange
import csv
from io import StringIO
from django.db import transaction, connection
from django.db.utils import IntegrityError
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Count
from django.contrib.auth import get_user_model
import logging
from ..models import Topic, PreventiveMaintenance, Machine, MaintenanceProcedure, PMMasterPlan
from ..timezones import object_timezone
from ..tenancy import get_operable_properties

logger = logging.getLogger(__name__)

User = get_user_model()


class PreventiveMaintenanceService:
    """
    Service for preventive maintenance import, status changes, and scheduling.
    """

    STATUS_MAP = {
        'scheduled': 'pending',
        'pending': 'pending',
        'in_progress': 'in_progress',
        'in progress': 'in_progress',
        'completed': 'completed',
        'cancelled': 'cancelled',
        'canceled': 'cancelled',
        'overdue': 'overdue',
    }

    FREQUENCY_MAP = {
        'daily': 'daily',
        'weekly': 'weekly',
        'monthly': 'monthly',
        'quarterly': 'quarterly',
        'semiannual': 'semi_annual',
        'semi-annual': 'semi_annual',
        'semi_annual': 'semi_annual',
        'annual': 'annual',
        'yearly': 'annual',
        'custom': 'custom',
    }

    STATUS_TRANSITIONS = {
        'pending': {'in_progress', 'completed', 'cancelled', 'overdue'},
        'in_progress': {'completed', 'cancelled', 'overdue'},
        'overdue': {'in_progress', 'completed', 'cancelled'},
        'completed': set(),
        'cancelled': set(),
    }

    @staticmethod
    def normalize_status(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip().lower()
        return PreventiveMaintenanceService.STATUS_MAP.get(normalized)

    @staticmethod
    def normalize_frequency(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip().lower()
        return PreventiveMaintenanceService.FREQUENCY_MAP.get(normalized)

    @staticmethod
    def parse_datetime_value(value: Any, field_name: str, tzinfo=None) -> datetime:
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValidationError(f"{field_name} is required")

        if isinstance(value, datetime):
            parsed = value
        else:
            from django.utils.dateparse import parse_datetime

            parsed = parse_datetime(str(value).strip())

        if not parsed:
            raise ValidationError(f"{field_name} must be a valid datetime")

        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, tzinfo or timezone.get_default_timezone())

        return parsed

    @staticmethod
    def calculate_next_due_date(
        frequency: str,
        custom_days: Optional[int],
        base_date: datetime,
        tzinfo=None,
    ) -> datetime:
        if not base_date:
            raise ValidationError("Base date is required to calculate next due date")

        if timezone.is_naive(base_date):
            base_date = timezone.make_aware(base_date, tzinfo or timezone.get_default_timezone())

        if frequency == 'daily':
            return base_date + timezone.timedelta(days=1)
        if frequency == 'weekly':
            return base_date + timezone.timedelta(weeks=1)
        if frequency == 'monthly':
            month = base_date.month + 1
            year = base_date.year
            if month > 12:
                month = 1
                year += 1
            day = min(base_date.day, monthrange(year, month)[1])
            return base_date.replace(year=year, month=month, day=day)
        if frequency == 'quarterly':
            month = base_date.month + 3
            year = base_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(base_date.day, monthrange(year, month)[1])
            return base_date.replace(year=year, month=month, day=day)
        if frequency == 'semi_annual':
            month = base_date.month + 6
            year = base_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(base_date.day, monthrange(year, month)[1])
            return base_date.replace(year=year, month=month, day=day)
        if frequency == 'annual':
            year = base_date.year + 1
            day = min(base_date.day, monthrange(year, base_date.month)[1])
            return base_date.replace(year=year, day=day)
        if frequency == 'custom':
            if not custom_days or custom_days <= 0:
                raise ValidationError("Custom days must be greater than zero for custom frequency")
            return base_date + timezone.timedelta(days=custom_days)

        raise ValidationError(f"Unsupported frequency: {frequency}")


    @staticmethod
    def iter_due_dates(frequency: str, custom_days: Optional[int], start_date: datetime, end_date: datetime, tzinfo=None):
        """Yield completion-based projected due dates from start_date through end_date."""
        if timezone.is_naive(start_date):
            start_date = timezone.make_aware(start_date, tzinfo or timezone.get_default_timezone())
        cursor = start_date
        guard = 0
        while cursor < end_date and guard < 400:
            yield cursor
            cursor = PreventiveMaintenanceService.calculate_next_due_date(frequency, custom_days, cursor, tzinfo)
            guard += 1

    @staticmethod
    def project_master_plan(plan: PMMasterPlan, start_dt: datetime, end_dt: datetime) -> List[Dict[str, Any]]:
        """Project virtual occurrences for a master plan without creating PM records."""
        tzinfo = object_timezone(plan)
        base = plan.last_completed_date or plan.next_due_date or plan.start_date
        if timezone.is_naive(base):
            base = timezone.make_aware(base, tzinfo)
        # If the base is before the window, walk forward until it reaches or passes start_dt.
        cursor = base
        guard = 0
        while cursor < start_dt and guard < 400:
            cursor = PreventiveMaintenanceService.calculate_next_due_date(plan.frequency, plan.custom_days, cursor, tzinfo)
            guard += 1

        existing = {
            timezone.localtime(pm.occurrence_due_date or pm.scheduled_date, tzinfo).date().isoformat(): pm
            for pm in plan.generated_maintenances.all()
            if pm.occurrence_due_date or pm.scheduled_date
        }
        out = []
        for due in PreventiveMaintenanceService.iter_due_dates(plan.frequency, plan.custom_days, cursor, end_dt, tzinfo):
            if due < start_dt:
                continue
            key = timezone.localtime(due, tzinfo).date().isoformat()
            generated = existing.get(key)
            out.append({
                'plan_id': plan.plan_id,
                'title': plan.title,
                'due_date': due,
                'occurrence_date': due,
                'lead_time_days': plan.lead_time_days,
                'frequency': plan.frequency,
                'custom_days': plan.custom_days,
                'calendar_status': 'generated' if generated else 'projected',
                'occurrence_type': 'generated' if generated else 'projected',
                'generated_pm_id': generated.pm_id if generated else None,
                'assigned_to_id': plan.assigned_to_id,
                'machine_ids': [machine.machine_id for machine in plan.machines.all()],
            })
        return out

    @staticmethod
    @transaction.atomic
    def materialize_master_plan_occurrences(
        cutoff: datetime,
        user=None,
        dry_run: bool = False,
        limit: int = 500,
        property_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create actual PM records for active master-plan occurrences due by cutoff + lead window."""
        now = timezone.now()
        created = []
        skipped = 0
        plans = (
            PMMasterPlan.objects.filter(active=True)
            .select_related('created_by', 'assigned_to', 'procedure_template')
            .prefetch_related('topics', 'machines', 'generated_maintenances')
            .annotate(machine_property_count=Count('machines__property_id', distinct=True))
            .filter(machine_property_count=1)
            .order_by('next_due_date', 'start_date')
        )
        if user is not None and not user.is_superuser:
            operable_properties = get_operable_properties(user)
            plans = plans.filter(machines__property__in=operable_properties).distinct()
            if property_id:
                plans = plans.filter(machines__property__property_id=property_id)
        elif property_id:
            plans = plans.filter(machines__property__property_id=property_id)
        for plan in plans:
            if len(created) >= limit:
                break
            lead_cutoff = cutoff + timezone.timedelta(days=plan.lead_time_days)
            projections = PreventiveMaintenanceService.project_master_plan(plan, now - timezone.timedelta(days=365), lead_cutoff)
            for occurrence in projections:
                if len(created) >= limit:
                    break
                due = occurrence['due_date']
                if due > lead_cutoff or occurrence.get('generated_pm_id'):
                    skipped += 1
                    continue
                if dry_run:
                    created.append({'plan_id': plan.plan_id, 'due_date': due.isoformat(), 'pm_id': None})
                    continue
                with transaction.atomic():
                    locked = PMMasterPlan.objects.select_for_update().get(pk=plan.pk)
                    existing = PreventiveMaintenance.objects.filter(master_plan=locked, occurrence_due_date=due).first()
                    if existing:
                        skipped += 1
                        continue
                    pm = PreventiveMaintenance.objects.create(
                        master_plan=locked,
                        occurrence_due_date=due,
                        generated_at=timezone.now(),
                        pmtitle=locked.title,
                        scheduled_date=due,
                        frequency=locked.frequency,
                        custom_days=locked.custom_days,
                        next_due_date=None,
                        status='pending',
                        notes=locked.notes,
                        procedure=locked.procedure,
                        procedure_template=locked.procedure_template,
                        assigned_to=locked.assigned_to,
                        created_by=locked.created_by,
                        remarks=locked.remarks,
                    )
                    pm.topics.set(locked.topics.all())
                    pm.machines.set(locked.machines.all())
                    created.append({'plan_id': locked.plan_id, 'due_date': due.isoformat(), 'pm_id': pm.pm_id})
        return {
            'created': created,
            'created_count': len(created),
            'skipped': skipped,
            'dry_run': dry_run,
            'property_id': property_id,
        }

    @staticmethod
    def update_status(
        maintenance: PreventiveMaintenance,
        new_status: str,
        user,
        completed_date: Optional[datetime] = None,
    ) -> Dict[str, Optional[PreventiveMaintenance]]:
        normalized_status = PreventiveMaintenanceService.normalize_status(new_status)
        if not normalized_status:
            raise ValidationError("Invalid status value")

        current_status = maintenance.status
        allowed = PreventiveMaintenanceService.STATUS_TRANSITIONS.get(current_status, set())
        if normalized_status not in allowed and normalized_status != current_status:
            raise ValidationError(f"Invalid status transition from {current_status} to {normalized_status}")

        next_schedule = None
        tzinfo = object_timezone(maintenance)

        if normalized_status == 'completed':
            if completed_date is None:
                completed_date = timezone.now()
            if timezone.is_naive(completed_date):
                completed_date = timezone.make_aware(completed_date, tzinfo)
            else:
                completed_date = timezone.localtime(completed_date, tzinfo)

            base_date = completed_date or maintenance.scheduled_date
            next_due_date = PreventiveMaintenanceService.calculate_next_due_date(
                maintenance.frequency,
                maintenance.custom_days,
                base_date,
                tzinfo,
            )

            maintenance.status = normalized_status
            maintenance.completed_date = completed_date
            maintenance.next_due_date = next_due_date
            maintenance.save(update_fields=['status', 'completed_date', 'next_due_date', 'updated_at'])

            if maintenance.master_plan_id:
                plan = maintenance.master_plan
                plan.last_completed_date = completed_date
                plan.next_due_date = next_due_date
                plan.save(update_fields=['last_completed_date', 'next_due_date', 'updated_at'])
            else:
                next_schedule = PreventiveMaintenanceService.create_next_occurrence(
                    maintenance,
                    next_due_date,
                    user,
                )
        else:
            maintenance.status = normalized_status
            maintenance.save(update_fields=['status', 'updated_at'])

        return {
            'current': maintenance,
            'next_schedule': next_schedule,
        }

    @staticmethod
    def _reset_preventive_maintenance_sequence():
        """Reset the id sequence to max(id)+1 to fix duplicate key after restore or manual inserts."""
        table = PreventiveMaintenance._meta.db_table
        quoted = connection.ops.quote_name(table)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT setval(pg_get_serial_sequence(%s, 'id'), "
                "COALESCE((SELECT MAX(id) FROM {}), 1))".format(quoted),
                [table],
            )

    @staticmethod
    def create_next_occurrence(
        maintenance: PreventiveMaintenance,
        scheduled_date: datetime,
        user,
    ) -> PreventiveMaintenance:
        tzinfo = object_timezone(maintenance)
        next_due_date = PreventiveMaintenanceService.calculate_next_due_date(
            maintenance.frequency,
            maintenance.custom_days,
            scheduled_date,
            tzinfo,
        )

        create_kwargs = dict(
            pmtitle=maintenance.pmtitle,
            scheduled_date=scheduled_date,
            frequency=maintenance.frequency,
            custom_days=maintenance.custom_days,
            next_due_date=next_due_date,
            status='pending',
            notes=maintenance.notes,
            procedure=maintenance.procedure,
            procedure_template=maintenance.procedure_template,
            assigned_to=maintenance.assigned_to,
            created_by=maintenance.created_by,
            job=maintenance.job,
            remarks=maintenance.remarks,
        )

        try:
            next_task = PreventiveMaintenance.objects.create(**create_kwargs)
        except IntegrityError as e:
            if 'duplicate key' in str(e).lower() and 'id' in str(e).lower():
                logger.warning(
                    "PreventiveMaintenance id sequence out of sync (%s), resetting and retrying",
                    e,
                )
                PreventiveMaintenanceService._reset_preventive_maintenance_sequence()
                next_task = PreventiveMaintenance.objects.create(**create_kwargs)
            else:
                raise

        next_task.topics.set(maintenance.topics.all())
        next_task.machines.set(maintenance.machines.all())

        logger.info(
            "Created next preventive maintenance occurrence %s from %s",
            next_task.pm_id,
            maintenance.pm_id,
        )

        return next_task

    @staticmethod
    def import_from_csv_content(
        csv_content: str,
        default_user,
    ) -> Dict[str, Any]:
        reader = csv.DictReader(StringIO(csv_content))
        results = {
            'created': 0,
            'updated': 0,
            'errors': [],
        }

        for row_index, row in enumerate(reader, start=2):
            try:
                with transaction.atomic():
                    created = PreventiveMaintenanceService.upsert_from_row(row, default_user)
                if created:
                    results['created'] += 1
                else:
                    results['updated'] += 1
            except ValidationError as exc:
                results['errors'].append({
                    'row': row_index,
                    'error': str(exc),
                })
            except Exception as exc:  # noqa: BLE001 - capture unexpected import errors
                results['errors'].append({
                    'row': row_index,
                    'error': f"Unexpected error: {exc}",
                })

        return results

    @staticmethod
    def upsert_from_row(row: Dict[str, Any], default_user) -> bool:
        pm_id = str(row.get('PM ID', '')).strip()
        if not pm_id:
            raise ValidationError("PM ID is required for import")

        scheduled_date = PreventiveMaintenanceService.parse_datetime_value(
            row.get('Scheduled Date'),
            "Scheduled Date",
        )

        completed_date_raw = row.get('Completed Date')
        completed_date = None
        if completed_date_raw:
            completed_date = PreventiveMaintenanceService.parse_datetime_value(
                completed_date_raw,
                "Completed Date",
            )

        status_raw = row.get('Status')
        status_value = PreventiveMaintenanceService.normalize_status(status_raw) or 'pending'

        frequency_raw = row.get('Frequency') or 'monthly'
        frequency = PreventiveMaintenanceService.normalize_frequency(frequency_raw)
        if not frequency:
            raise ValidationError(f"Invalid frequency: {frequency_raw}")

        custom_days = None
        if row.get('Custom Days') not in (None, ''):
            try:
                custom_days = int(row.get('Custom Days'))
            except (TypeError, ValueError) as exc:
                raise ValidationError("Custom Days must be a number") from exc

        if frequency == 'custom' and (not custom_days or custom_days <= 0):
            raise ValidationError("Custom Days must be greater than zero for custom frequency")

        if status_value == 'completed' and not completed_date:
            raise ValidationError("Completed Date is required when Status is Completed")

        base_date = completed_date or scheduled_date
        next_due_date = PreventiveMaintenanceService.calculate_next_due_date(
            frequency,
            custom_days,
            base_date,
        )

        assigned_to = PreventiveMaintenanceService._find_user(
            row.get('Assigned Email'),
            row.get('Assigned To'),
        )

        created_by = PreventiveMaintenanceService._find_user(
            row.get('Creator Email'),
            row.get('Created By'),
        ) or default_user

        procedure_template = PreventiveMaintenanceService._find_procedure_template(
            row.get('Task Template'),
        )

        existing = PreventiveMaintenance.objects.filter(pm_id__iexact=pm_id).first()

        defaults = {
            'pmtitle': row.get('Title') or 'No title',
            'scheduled_date': scheduled_date,
            'completed_date': completed_date if status_value == 'completed' else None,
            'status': status_value,
            'frequency': frequency,
            'custom_days': custom_days,
            'next_due_date': next_due_date,
            'notes': row.get('Notes') or None,
            'procedure': row.get('Procedure') or None,
            'procedure_template': procedure_template,
            'assigned_to': assigned_to,
            'created_by': created_by,
        }

        if existing:
            for field_name, value in defaults.items():
                setattr(existing, field_name, value)
            existing.save()
            maintenance = existing
            created = False
        else:
            maintenance = PreventiveMaintenance.objects.create(pm_id=pm_id, **defaults)
            created = True

        topics = PreventiveMaintenanceService._parse_list_values(row.get('Topics'))
        machines = PreventiveMaintenanceService._parse_list_values(row.get('Machines'))

        if topics is not None:
            topic_ids = []
            for topic_name in topics:
                topic_obj, _ = Topic.objects.get_or_create(title=topic_name)
                topic_ids.append(topic_obj.id)
            maintenance.topics.set(topic_ids)

        if machines is not None:
            maintenance.machines.set(Machine.objects.filter(machine_id__in=machines))

        return created

    @staticmethod
    def _parse_list_values(value: Any) -> Optional[List[str]]:
        if value is None:
            return None
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]

        raw = str(value).strip()
        if not raw:
            return []
        separators = [',', ';', '|']
        for sep in separators:
            if sep in raw:
                return [item.strip() for item in raw.split(sep) if item.strip()]
        return [raw]

    @staticmethod
    def _find_user(email_value: Any, username_value: Any):
        if email_value:
            user = User.objects.filter(email__iexact=str(email_value).strip()).first()
            if user:
                return user

        if username_value:
            user = User.objects.filter(username__iexact=str(username_value).strip()).first()
            if user:
                return user

        return None

    @staticmethod
    def _find_procedure_template(value: Any):
        if not value:
            return None

        raw = str(value).strip()
        if raw.isdigit():
            return MaintenanceProcedure.objects.filter(id=int(raw)).first()

        return MaintenanceProcedure.objects.filter(name__iexact=raw).first()
