"""
Django signals that emit Web Push notifications for important workflow events.

Side-effect strategy: every signal call is wrapped in try/except so a push
provider hiccup can never roll back the originating database write. The
helpers in `push.py` already degrade gracefully when VAPID is unconfigured,
so this module is safe to ship before push keys are provisioned.
"""

from __future__ import annotations

import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Job, JobComment
from .push import send_push_to_user

logger = logging.getLogger(__name__)


# Track the prior status on each Job instance so post_save can decide whether
# a status transition actually happened (instead of pushing for every PATCH).
_PRIOR_STATUS_ATTR = '_pcms_prior_status'


@receiver(pre_save, sender=Job)
def _capture_prior_status(sender, instance: Job, **kwargs):
    if instance.pk is None:
        setattr(instance, _PRIOR_STATUS_ATTR, None)
        return
    try:
        prior = Job.objects.only('status').get(pk=instance.pk).status
    except Job.DoesNotExist:
        prior = None
    setattr(instance, _PRIOR_STATUS_ATTR, prior)


@receiver(post_save, sender=Job)
def _push_on_status_change(sender, instance: Job, created: bool, **kwargs):
    if created:
        _safe_push(
            instance.user,
            {
                'title': 'New job assigned',
                'body': _short(instance.description or instance.job_id),
                'tag': f'job-created-{instance.job_id}',
                'url': f'/dashboard/jobs/{instance.job_id}',
            },
        )
        return

    prior = getattr(instance, _PRIOR_STATUS_ATTR, None)
    if prior is None or prior == instance.status:
        return

    title = f'Job status: {instance.get_status_display()}'
    body = _short(instance.description or instance.job_id)
    _safe_push(
        instance.user,
        {
            'title': title,
            'body': body,
            'tag': f'job-status-{instance.job_id}',
            'url': f'/dashboard/jobs/{instance.job_id}',
            'renotify': True,
        },
    )
    # Notify whoever last updated the job too, but only if they're not the
    # assignee (so the actor doesn't get an echo on their own action).
    if instance.updated_by_id and instance.updated_by_id != instance.user_id:
        _safe_push(
            instance.updated_by,
            {
                'title': title,
                'body': body,
                'tag': f'job-status-{instance.job_id}-updater',
                'url': f'/dashboard/jobs/{instance.job_id}',
                'renotify': True,
            },
        )


@receiver(post_save, sender=JobComment)
def _push_on_new_comment(sender, instance: JobComment, created: bool, **kwargs):
    if not created:
        return
    job = instance.job
    if job is None or job.user_id is None:
        return
    # Don't echo the author's own comment back to them.
    if instance.author_id and instance.author_id == job.user_id:
        return
    _safe_push(
        job.user,
        {
            'title': 'New comment on your job',
            'body': _short(instance.comment),
            'tag': f'job-comment-{job.job_id}',
            'url': f'/dashboard/jobs/{job.job_id}',
        },
    )


def _short(value: str | None, limit: int = 120) -> str:
    if not value:
        return ''
    text = str(value).strip().replace('\n', ' ')
    return text if len(text) <= limit else text[: limit - 1] + '…'


def _safe_push(user, payload):
    if user is None:
        return
    try:
        send_push_to_user(user, payload)
    except Exception:  # pragma: no cover - belt-and-braces
        logger.exception('Push notification failed for user=%s', getattr(user, 'pk', None))
