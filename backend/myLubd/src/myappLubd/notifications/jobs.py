"""Compose and deliver Property-routed LINE alerts for Job events."""

from __future__ import annotations

import logging
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from ..models import Job
from .line import send_text_message


logger = logging.getLogger(__name__)

JOB_CREATED = 'JOB_CREATED'
JOB_STATUS_CHANGED = 'JOB_STATUS_CHANGED'
JOB_REASSIGNED = 'JOB_REASSIGNED'
SUPPORTED_JOB_EVENTS = {JOB_CREATED, JOB_STATUS_CHANGED, JOB_REASSIGNED}
DETAIL_MAX_LENGTH = 220
SUMMARY_ITEM_LIMIT = 3


def _clean_text(value, fallback='') -> str:
    """Return compact display text without leaking Python sentinel values."""
    if value is None:
        return fallback
    text = ' '.join(str(value).split()).strip()
    if not text or text.lower() in {'none', 'null'}:
        return fallback
    return text


def _person(user, fallback='Unassigned') -> str:
    if user is None:
        return fallback
    full_name = _clean_text(user.get_full_name())
    username = _clean_text(getattr(user, 'username', ''))
    # Usernames are a reasonable operational fallback unless they are emails.
    return full_name or (username if '@' not in username else '') or fallback


def _assignee(job: Job) -> str:
    return _person(getattr(job, 'user', None))


def _summarize(values: list[str]) -> str:
    visible = values[:SUMMARY_ITEM_LIMIT]
    summary = ', '.join(visible)
    remaining = len(values) - len(visible)
    return f'{summary} +{remaining} more' if remaining else summary


def _location(job: Job) -> str:
    rooms = [
        value
        for value in (
            _clean_text(name)
            for name in job.rooms.order_by('name').values_list('name', flat=True)
        )
        if value
    ]
    if rooms:
        summary = _summarize(rooms)
        if len(rooms) > 1:
            return f'Rooms {summary}'
        return summary if summary.casefold().startswith('room ') else f'Room {summary}'
    if job.area_id:
        return _clean_text(job.area.name, 'Not specified')
    return 'Not specified'


def _issue(job: Job) -> str:
    topics = [
        value
        for value in (
            _clean_text(title)
            for title in job.topics.order_by('title').values_list('title', flat=True)
        )
        if value
    ]
    return _summarize(topics) if topics else ''


def _detail(job: Job) -> str:
    detail = _clean_text(job.description)
    if len(detail) <= DETAIL_MAX_LENGTH:
        return detail
    return f'{detail[:DETAIL_MAX_LENGTH - 1].rstrip()}…'


def _timestamp(value) -> str:
    if value is None:
        return 'Not specified'
    return timezone.localtime(value).strftime('%d %b %Y %H:%M')


def _public_job_id(job: Job) -> str:
    return _clean_text(job.job_id, 'Unavailable')


def _job_url(job: Job) -> str:
    base_url = str(settings.FRONTEND_BASE_URL or '').strip().rstrip('/')
    if not base_url:
        return ''
    return f'{base_url}/dashboard/jobs/{quote(_public_job_id(job), safe="")}'


def _status_label(value: str | None) -> str:
    label = _clean_text(dict(Job.STATUS_CHOICES).get(value), 'Unknown')
    return 'Waiting Spare Part' if label == 'Waiting Sparepart' else label


def _context(job: Job, *, label_property: bool) -> list[str]:
    property_name = _clean_text(job.property.name, 'Not specified')
    property_line = (
        f'🏨 Property: {property_name}' if label_property else f'🏨 {property_name}'
    )
    lines = [property_line, f'📍 Location: {_location(job)}']
    issue = _issue(job)
    if issue:
        lines.append(f'🛠 Issue: {issue}' if label_property else f'🛠 {issue}')
    return lines


def _compose_created(job: Job) -> str:
    lines = [
        '🔧 New Maintenance Job',
        '',
        *_context(job, label_property=True),
    ]
    detail = _detail(job)
    if detail:
        lines.append(f'📝 Detail: {detail}')
    lines.extend([
        '',
        f'👤 Assigned to: {_assignee(job)}',
        f'📌 Status: {_status_label(job.status)}',
        f'⏰ Created: {_timestamp(job.created_at)}',
        '',
        f'Job ID: {_public_job_id(job)}',
    ])
    url = _job_url(job)
    if url:
        lines.extend(['', f'🔗 View Job: {url}'])
    lines.extend(['', 'StayMaint'])
    return '\n'.join(lines)


def _compose_status(job: Job, old_status: str | None) -> str:
    if job.status == 'completed':
        return _compose_completed(job)
    return '\n'.join([
        '🔄 Job Status Updated',
        '',
        *_context(job, label_property=False),
        '',
        f'{_status_label(old_status)} ➜ {_status_label(job.status)}',
        '',
        f'👤 Technician: {_assignee(job)}',
        f'⏰ Updated: {_timestamp(job.updated_at)}',
        '',
        f'Job ID: {_public_job_id(job)}',
    ])


def _compose_completed(job: Job) -> str:
    return '\n'.join([
        '✅ Maintenance Completed',
        '',
        *_context(job, label_property=False),
        '',
        '📌 Status: Completed',
        f'👤 Completed by: {_assignee(job)}',
        f'⏰ Completed: {_timestamp(job.completed_at or job.updated_at)}',
        '',
        f'Job ID: {_public_job_id(job)}',
        '',
        'StayMaint',
    ])


def _compose_reassigned(job: Job, old_assignee) -> str:
    return '\n'.join([
        '👷 Job Reassigned',
        '',
        *_context(job, label_property=False),
        '',
        f'From: {_person(old_assignee)}',
        f'To: {_assignee(job)}',
        '',
        f'📌 Status: {_status_label(job.status)}',
        f'⏰ Updated: {_timestamp(job.updated_at)}',
        '',
        f'Job ID: {_public_job_id(job)}',
    ])


def send_job_event_notification(
    *,
    job_id: int,
    event_type: str,
    actor_id: int | None = None,
    old_status: str | None = None,
    old_assignee_id: int | None = None,
) -> bool:
    """Resolve all routing from canonical Job.property and deliver once."""
    try:
        return _send_job_event_notification(
            job_id=job_id,
            event_type=event_type,
            actor_id=actor_id,
            old_status=old_status,
            old_assignee_id=old_assignee_id,
        )
    except Exception:
        logger.exception(
            'Unexpected Job LINE notification failure event=%s job=%s',
            event_type,
            job_id,
        )
        return False


def _send_job_event_notification(
    *,
    job_id: int,
    event_type: str,
    actor_id: int | None = None,
    old_status: str | None = None,
    old_assignee_id: int | None = None,
) -> bool:
    if not settings.LINE_CHANNEL_ACCESS_TOKEN:
        return False
    if event_type not in SUPPORTED_JOB_EVENTS:
        logger.warning('Unsupported Job LINE event event=%s job=%s', event_type, job_id)
        return False

    try:
        job = (
            Job.objects.select_related('property', 'area', 'user')
            .prefetch_related('rooms', 'topics')
            .get(pk=job_id)
        )
    except Job.DoesNotExist:
        logger.warning('Job LINE event dropped because Job no longer exists job=%s', job_id)
        return False

    property_obj = job.property
    destination_id = str(property_obj.line_destination_id or '').strip()
    if not property_obj.line_notifications_enabled or not destination_id:
        return False

    if event_type == JOB_CREATED:
        message = _compose_created(job)
    elif event_type == JOB_STATUS_CHANGED:
        if old_status is None or old_status == job.status:
            return False
        message = _compose_status(job, old_status)
    else:
        if old_assignee_id is None or old_assignee_id == job.user_id:
            return False
        user_model = get_user_model()
        old_assignee = user_model.objects.filter(pk=old_assignee_id).first()
        message = _compose_reassigned(job, old_assignee)

    return send_text_message(destination_id=destination_id, text=message)
