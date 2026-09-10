"""Grouped, Property-routed LINE reminders for actual PM work records."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from ..models import (
    PMLineReminderBatch,
    PMLineReminderBatchItem,
    PMLineReminderDelivery,
    PreventiveMaintenance,
    Property,
)
from .line import _masked_destination, send_text_message


logger = logging.getLogger(__name__)

BANGKOK = ZoneInfo('Asia/Bangkok')
REMINDER_HOUR = 9
RETRY_KEY_VALIDITY = timedelta(hours=24)
ELIGIBLE_STATUSES = ('pending', 'in_progress', 'overdue')
REMINDER_TYPES = (
    PMLineReminderDelivery.DAY_BEFORE,
    PMLineReminderDelivery.SAME_DAY,
)


def _clean_text(value, fallback='') -> str:
    if value is None:
        return fallback
    text = ' '.join(str(value).split()).strip()
    if not text or text.casefold() in {'none', 'null'}:
        return fallback
    return text


def _short_text(value, fallback: str, limit: int = 120) -> str:
    text = _clean_text(value, fallback)
    return text if len(text) <= limit else f'{text[:limit - 1].rstrip()}…'


def _canonical_property(pm: PreventiveMaintenance) -> Property | None:
    """Apply the same Job-first/sole-Machine canonical PM authority as the API."""
    machines = list(pm.machines.all())
    machine_property_ids = {machine.property_id for machine in machines if machine.property_id}
    if pm.job_id and pm.job.property_id:
        if machine_property_ids and machine_property_ids != {pm.job.property_id}:
            return None
        return pm.job.property
    if len(machine_property_ids) != 1:
        return None
    for machine in machines:
        if machine.property_id in machine_property_ids:
            return machine.property
    return None


def _location(pm: PreventiveMaintenance) -> str:
    if pm.job_id:
        rooms = [
            _clean_text(name)
            for name in pm.job.rooms.order_by('name').values_list('name', flat=True)
        ]
        rooms = [name for name in rooms if name]
        if rooms:
            if len(rooms) == 1:
                room = rooms[0]
                return room if room.casefold().startswith('room ') else f'Room {room}'
            return f"Rooms {', '.join(rooms[:3])}" + (
                f' +{len(rooms) - 3} more' if len(rooms) > 3 else ''
            )
        if pm.job.area_id:
            area = _clean_text(pm.job.area.name)
            if area:
                return area

    machines = list(pm.machines.all())
    locations = list(dict.fromkeys(
        location for location in (_clean_text(machine.location) for machine in machines) if location
    ))
    if locations:
        return ', '.join(locations[:3]) + (
            f' +{len(locations) - 3} more' if len(locations) > 3 else ''
        )
    names = list(dict.fromkeys(
        name for name in (_clean_text(machine.name) for machine in machines) if name
    ))
    if names:
        return ', '.join(names[:3]) + (f' +{len(names) - 3} more' if len(names) > 3 else '')
    return 'Location not specified'


def _eligible_queryset():
    return (
        PreventiveMaintenance.objects.filter(
            completed_date__isnull=True,
            status__in=ELIGIBLE_STATUSES,
        )
        .filter(Q(schedule__isnull=True) | Q(schedule__is_active=True))
        .select_related('job__property', 'job__area')
        .prefetch_related('job__rooms', 'machines__property')
        .distinct()
    )


def _date_bounds(target_date: date):
    start = timezone.make_aware(datetime.combine(target_date, time.min), BANGKOK)
    return start, start + timedelta(days=1)


def _scheduled_local_date(pm: PreventiveMaintenance) -> date:
    return timezone.localtime(pm.scheduled_date, BANGKOK).date()


def get_due_groups(*, now=None, run_date: date | None = None, reminder_type: str | None = None):
    """Return due actual PMs grouped by canonical Property, type, and local date."""
    now = now or timezone.now()
    local_now = timezone.localtime(now, BANGKOK)
    effective_date = run_date or local_now.date()
    if run_date is None and local_now.time() < time(REMINDER_HOUR):
        return []

    types = (reminder_type,) if reminder_type else REMINDER_TYPES
    scheduled_dates = {
        PMLineReminderDelivery.SAME_DAY: effective_date,
        PMLineReminderDelivery.DAY_BEFORE: effective_date + timedelta(days=1),
    }
    wanted_dates = [scheduled_dates[value] for value in types]
    first_start, _ = _date_bounds(min(wanted_dates))
    _, last_end = _date_bounds(max(wanted_dates))

    grouped = defaultdict(list)
    for pm in _eligible_queryset().filter(
        scheduled_date__gte=first_start,
        scheduled_date__lt=last_end,
    ).order_by('scheduled_date', 'pm_id'):
        scheduled_date = _scheduled_local_date(pm)
        property_obj = _canonical_property(pm)
        if property_obj is None:
            continue
        for current_type in types:
            if scheduled_date == scheduled_dates[current_type]:
                grouped[(property_obj.pk, current_type, scheduled_date)].append(pm)

    groups = []
    for (property_id, current_type, scheduled_date), tasks in grouped.items():
        property_obj = _canonical_property(tasks[0])
        if property_obj and property_obj.pk == property_id:
            groups.append({
                'property': property_obj,
                'reminder_type': current_type,
                'scheduled_date': scheduled_date,
                'tasks': tasks,
            })
    return sorted(
        groups,
        key=lambda group: (
            group['property'].name.casefold(),
            group['scheduled_date'],
            group['reminder_type'],
        ),
    )


def compose_reminder_message(*, property_obj, reminder_type, scheduled_date, tasks) -> str:
    property_name = _short_text(property_obj.name, 'Property', 100)
    formatted_date = scheduled_date.strftime('%d %b %Y')
    if reminder_type == PMLineReminderDelivery.DAY_BEFORE:
        lines = [
            '🛠 Preventive Maintenance Reminder',
            '',
            f'🏨 Property: {property_name}',
            f'📅 Tomorrow: {formatted_date}',
            f'📋 Scheduled PM: {len(tasks)} task{"s" if len(tasks) != 1 else ""}',
            '',
        ]
        closing = [
            '',
            'Please prepare access, tools, spare parts, and required room closure.',
            '',
            'StayMaint',
        ]
    else:
        lines = [
            '🔔 Preventive Maintenance Today',
            '',
            f'🏨 Property: {property_name}',
            f'📅 {formatted_date}',
            f'📋 PM Today: {len(tasks)} task{"s" if len(tasks) != 1 else ""}',
            '',
        ]
        closing = [
            '',
            '⏰ Reminder: 09:00',
            'Please proceed according to the PM schedule.',
            '',
            'StayMaint',
        ]

    task_lines = [
        f'{index}. {_short_text(_location(pm), "Location not specified", 100)} — '
        f'{_short_text(pm.pmtitle, "Preventive maintenance", 140)}'
        for index, pm in enumerate(tasks, start=1)
    ]
    limit = 4900
    visible = []
    for line in task_lines:
        candidate_visible = [*visible, line]
        hidden = len(task_lines) - len(candidate_visible)
        suffix = [f'… and {hidden} more task{"s" if hidden != 1 else ""}'] if hidden else []
        candidate = '\n'.join([*lines, *candidate_visible, *suffix, *closing])
        if len(candidate) > limit:
            break
        visible = candidate_visible
    hidden = len(task_lines) - len(visible)
    if hidden:
        visible.append(f'… and {hidden} more task{"s" if hidden != 1 else ""}')
    return '\n'.join([*lines, *visible, *closing])


def _safe_result(batch, *, status, sent=False):
    return {
        'property_name': _clean_text(batch.property.name, 'Property'),
        'property_public_id': _clean_text(batch.property.property_id, 'Unavailable'),
        'reminder_type': batch.reminder_type,
        'scheduled_date': batch.scheduled_date,
        'pm_count': batch.items.count(),
        'would_send': status not in {'skipped', 'routing_changed'},
        'sent': sent,
        'status': status,
    }


def _mark_batch_delivered(batch_id: int, delivered_at) -> None:
    """Persist provider acceptance separately from the durable reservation."""
    with transaction.atomic():
        batch = PMLineReminderBatch.objects.select_for_update().get(pk=batch_id)
        if batch.accepted_at is not None:
            return
        batch.accepted_at = delivered_at
        batch.save(update_fields=['accepted_at'])
        PMLineReminderDelivery.objects.bulk_create([
            PMLineReminderDelivery(
                batch=batch,
                property=item.property,
                preventive_maintenance=item.preventive_maintenance,
                reminder_type=item.reminder_type,
                scheduled_date=item.scheduled_date,
                delivered_at=delivered_at,
            )
            for item in batch.items.select_related('property', 'preventive_maintenance')
        ])


def _deliver_batch(batch: PMLineReminderBatch):
    """Replay one immutable provider request and record its accepted outcome."""
    current_property = Property.objects.get(pk=batch.property_id)
    current_destination = str(current_property.line_destination_id or '').strip()
    if not current_property.line_notifications_enabled or not current_destination:
        return _safe_result(batch, status='skipped')
    if current_destination != batch.destination_id:
        logger.warning(
            'PM LINE reminder pending route changed type=%s property=%s count=%s',
            batch.reminder_type,
            current_property.property_id,
            batch.items.count(),
        )
        return _safe_result(batch, status='routing_changed')

    if not send_text_message(
        destination_id=batch.destination_id,
        text=batch.message_text,
        retry_key=str(batch.retry_key),
    ):
        logger.warning(
            'PM LINE reminder failed type=%s property=%s count=%s destination=%s',
            batch.reminder_type,
            current_property.property_id,
            batch.items.count(),
            _masked_destination(batch.destination_id),
        )
        return _safe_result(batch, status='failed')

    delivered_at = timezone.now()
    _mark_batch_delivered(batch.pk, delivered_at)
    logger.info(
        'PM LINE reminder sent type=%s property=%s count=%s destination=%s',
        batch.reminder_type,
        current_property.property_id,
        batch.items.count(),
        _masked_destination(batch.destination_id),
    )
    return _safe_result(batch, status='sent', sent=True)


def send_due_pm_reminders(*, now=None, run_date=None, reminder_type=None, dry_run=False):
    """Send due groups and return safe per-group results for command output."""
    now = now or timezone.now()
    if run_date is None and timezone.localtime(now, BANGKOK).time() < time(REMINDER_HOUR):
        return []
    groups = get_due_groups(now=now, run_date=run_date, reminder_type=reminder_type)
    results = []

    attempted_batch_ids = set()
    if not dry_run:
        pending_batches = PMLineReminderBatch.objects.filter(accepted_at__isnull=True)
        if reminder_type:
            pending_batches = pending_batches.filter(reminder_type=reminder_type)
        for batch in pending_batches.select_related('property').prefetch_related('items').order_by(
            'created_at', 'pk'
        ):
            attempted_batch_ids.add(batch.pk)
            # LINE retry keys are valid for only 24 hours. created_at predates
            # the first attempt, so this is a conservative no-duplicate bound.
            if timezone.now() - batch.created_at >= RETRY_KEY_VALIDITY:
                logger.error(
                    'PM LINE reminder retry window expired type=%s property=%s count=%s',
                    batch.reminder_type,
                    batch.property.property_id,
                    batch.items.count(),
                )
                results.append(_safe_result(batch, status='retry_expired'))
                continue
            results.append(_deliver_batch(batch))

    for group in groups:
        property_obj = group['property']
        base_result = {
            'property_name': _clean_text(property_obj.name, 'Property'),
            'property_public_id': _clean_text(property_obj.property_id, 'Unavailable'),
            'reminder_type': group['reminder_type'],
            'scheduled_date': group['scheduled_date'],
            'pm_count': len(group['tasks']),
            'would_send': bool(
                property_obj.line_notifications_enabled
                and str(property_obj.line_destination_id or '').strip()
            ),
            'sent': False,
            'status': 'dry_run' if dry_run else 'skipped',
        }
        if dry_run:
            reserved_ids = set(PMLineReminderBatchItem.objects.filter(
                property=property_obj,
                preventive_maintenance_id__in=[pm.pk for pm in group['tasks']],
                reminder_type=group['reminder_type'],
                scheduled_date=group['scheduled_date'],
            ).values_list('preventive_maintenance_id', flat=True))
            fresh_count = sum(pm.pk not in reserved_ids for pm in group['tasks'])
            pending_count = PMLineReminderBatchItem.objects.filter(
                property=property_obj,
                reminder_type=group['reminder_type'],
                scheduled_date=group['scheduled_date'],
                batch__accepted_at__isnull=True,
            ).count()
            due_count = fresh_count + pending_count
            base_result.update(
                pm_count=due_count,
                would_send=base_result['would_send'] and due_count > 0,
                status='dry_run' if due_count else 'already_delivered',
            )
            results.append(base_result)
            continue

        with transaction.atomic():
            locked_property = Property.objects.select_for_update().get(pk=property_obj.pk)
            destination_id = str(locked_property.line_destination_id or '').strip()
            if not locked_property.line_notifications_enabled or not destination_id:
                results.append(base_result)
                continue

            task_ids = [task.pk for task in group['tasks']]
            pending = []
            for pm in _eligible_queryset().filter(pk__in=task_ids).order_by('scheduled_date', 'pm_id'):
                if _scheduled_local_date(pm) != group['scheduled_date']:
                    continue
                canonical_property = _canonical_property(pm)
                if canonical_property is None or canonical_property.pk != locked_property.pk:
                    continue
                pending.append(pm)
            reserved_ids = set(PMLineReminderBatchItem.objects.filter(
                property=locked_property,
                preventive_maintenance_id__in=[pm.pk for pm in pending],
                reminder_type=group['reminder_type'],
                scheduled_date=group['scheduled_date'],
            ).values_list('preventive_maintenance_id', flat=True))
            fresh = [pm for pm in pending if pm.pk not in reserved_ids]
            batches = list(
                PMLineReminderBatch.objects.filter(
                    property=locked_property,
                    reminder_type=group['reminder_type'],
                    scheduled_date=group['scheduled_date'],
                    accepted_at__isnull=True,
                )
                .exclude(pk__in=attempted_batch_ids)
                .prefetch_related('items')
                .order_by('created_at', 'pk')
            )
            if fresh:
                message = compose_reminder_message(
                    property_obj=locked_property,
                    reminder_type=group['reminder_type'],
                    scheduled_date=group['scheduled_date'],
                    tasks=fresh,
                )
                batch = PMLineReminderBatch.objects.create(
                    property=locked_property,
                    reminder_type=group['reminder_type'],
                    scheduled_date=group['scheduled_date'],
                    destination_id=destination_id,
                    message_text=message,
                )
                PMLineReminderBatchItem.objects.bulk_create([
                    PMLineReminderBatchItem(
                        batch=batch,
                        property=locked_property,
                        preventive_maintenance=pm,
                        reminder_type=group['reminder_type'],
                        scheduled_date=group['scheduled_date'],
                    )
                    for pm in fresh
                ])
                batches.append(batch)
            if not batches:
                base_result.update(pm_count=0, would_send=False, status='already_delivered')
                results.append(base_result)
                continue

        for batch in batches:
            batch = PMLineReminderBatch.objects.select_related('property').prefetch_related(
                'items'
            ).get(pk=batch.pk)
            results.append(_deliver_batch(batch))
    return results
