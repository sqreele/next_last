"""Compose and deliver Property-routed LINE alerts for Job events."""

from __future__ import annotations

import logging
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model

from ..models import Job
from .line import send_text_message


logger = logging.getLogger(__name__)

JOB_CREATED = 'JOB_CREATED'
JOB_STATUS_CHANGED = 'JOB_STATUS_CHANGED'
JOB_REASSIGNED = 'JOB_REASSIGNED'
SUPPORTED_JOB_EVENTS = {JOB_CREATED, JOB_STATUS_CHANGED, JOB_REASSIGNED}


def _person(user, fallback='Unassigned') -> str:
    if user is None:
        return fallback
    full_name = user.get_full_name().strip()
    return (
        full_name
        or str(user.email or '').strip()
        or str(user.username or '').strip()
        or fallback
    )


def _location(job: Job) -> str:
    rooms = ', '.join(job.rooms.order_by('name').values_list('name', flat=True))
    if rooms:
        return rooms
    if job.area_id:
        return job.area.name
    return 'Not specified'


def _title(job: Job) -> str:
    topic = job.topics.order_by('title').values_list('title', flat=True).first()
    return topic or (job.description or job.job_id).strip().splitlines()[0]


def _job_url(job: Job) -> str:
    base_url = str(settings.FRONTEND_BASE_URL or '').strip().rstrip('/')
    if not base_url:
        return ''
    return f'{base_url}/dashboard/jobs/{quote(job.job_id, safe="")}'


def _status_label(value: str | None) -> str:
    return dict(Job.STATUS_CHOICES).get(value, str(value or 'Unknown'))


def _common(job: Job) -> list[str]:
    return [
        f'Property: {job.property.name}',
        f'Room/Area: {_location(job)}',
    ]


def _compose_created(job: Job, actor) -> str:
    lines = [
        '🔧 New Maintenance Job',
        '',
        *_common(job),
        f'Job: {_title(job)}',
        f'Priority: {job.get_priority_display()}',
        f'Assigned to: {_person(job.user)}',
        f'Status: {job.get_status_display()}',
        '',
        f'Created by: {_person(actor, "System")}',
    ]
    url = _job_url(job)
    if url:
        lines.extend(['', f'View Job: {url}'])
    return '\n'.join(lines)


def _compose_status(job: Job, actor, old_status: str | None) -> str:
    return '\n'.join([
        '🔄 Job Status Updated',
        '',
        f'Job #{job.job_id}',
        _title(job),
        '',
        *_common(job),
        '',
        'Status:',
        f'{_status_label(old_status)} → {job.get_status_display()}',
        '',
        'Updated by:',
        _person(actor, 'System'),
    ])


def _compose_reassigned(job: Job, actor, old_assignee) -> str:
    return '\n'.join([
        '👤 Job Reassigned',
        '',
        f'Job #{job.job_id}',
        _title(job),
        '',
        *_common(job),
        '',
        'From:',
        _person(old_assignee),
        '',
        'To:',
        _person(job.user),
        '',
        'Reassigned by:',
        _person(actor, 'System'),
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

    user_model = get_user_model()
    actor = user_model.objects.filter(pk=actor_id).first() if actor_id else None
    if event_type == JOB_CREATED:
        message = _compose_created(job, actor)
    elif event_type == JOB_STATUS_CHANGED:
        if old_status is None or old_status == job.status:
            return False
        message = _compose_status(job, actor, old_status)
    else:
        if old_assignee_id is None or old_assignee_id == job.user_id:
            return False
        old_assignee = user_model.objects.filter(pk=old_assignee_id).first()
        message = _compose_reassigned(job, actor, old_assignee)

    return send_text_message(destination_id=destination_id, text=message)
