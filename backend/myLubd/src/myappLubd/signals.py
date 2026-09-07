"""
Django signals that emit Web Push and LINE notifications for workflow events.

Side-effect strategy: every signal call is wrapped in try/except so a push
provider hiccup can never roll back the originating database write. LINE work
is registered with ``transaction.on_commit`` and its transport also degrades
gracefully when credentials are absent or the provider is unavailable.
"""

from __future__ import annotations

import logging
from functools import partial

from django.core.cache import cache
from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Inventory, InventoryCategory, Job, JobComment, Tenant


@receiver(post_save, sender=Tenant)
def _create_default_inventory_categories(sender, instance, created, **kwargs):
    if created:
        InventoryCategory.ensure_defaults(instance)


from .push import send_push_to_user
from .tenancy import get_property_summary_recipients

logger = logging.getLogger(__name__)


# Track the prior status on each Job instance so post_save can decide whether
# a status transition actually happened (instead of pushing for every PATCH).
_PRIOR_STATUS_ATTR = '_pcms_prior_status'
_PRIOR_ASSIGNEE_ATTR = '_pcms_prior_assignee_id'
# Same trick for Inventory.status so we only push on the transition into
# low_stock / out_of_stock, never on every PATCH that touches an unrelated
# field on a row that happens to already be low.
_PRIOR_INV_STATUS_ATTR = '_pcms_prior_inv_status'


@receiver(pre_save, sender=Job)
def _capture_prior_status(sender, instance: Job, **kwargs):
    if instance.pk is None:
        setattr(instance, _PRIOR_STATUS_ATTR, None)
        setattr(instance, _PRIOR_ASSIGNEE_ATTR, None)
        return
    try:
        prior = Job.objects.only('status', 'user_id').get(pk=instance.pk)
    except Job.DoesNotExist:
        setattr(instance, _PRIOR_STATUS_ATTR, None)
        setattr(instance, _PRIOR_ASSIGNEE_ATTR, None)
        return
    setattr(instance, _PRIOR_STATUS_ATTR, prior.status)
    setattr(instance, _PRIOR_ASSIGNEE_ATTR, prior.user_id)


def _schedule_job_line_event(**event):
    """Register LINE work without making notification wiring a write hazard."""
    try:
        from .notifications.jobs import send_job_event_notification
    except Exception:  # pragma: no cover - startup/package failure safeguard
        logger.exception('Unable to load Job LINE notification service')
        return
    transaction.on_commit(partial(send_job_event_notification, **event))


@receiver(post_save, sender=Job)
def _push_on_status_change(sender, instance: Job, created: bool, **kwargs):
    if created:
        _schedule_job_line_event(
            job_id=instance.pk,
            event_type='JOB_CREATED',
            actor_id=instance.updated_by_id,
        )
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
    prior_assignee_id = getattr(instance, _PRIOR_ASSIGNEE_ATTR, None)
    if prior is not None and prior != instance.status:
        _schedule_job_line_event(
            job_id=instance.pk,
            event_type='JOB_STATUS_CHANGED',
            actor_id=instance.updated_by_id,
            old_status=prior,
        )
    if prior_assignee_id is not None and prior_assignee_id != instance.user_id:
        _schedule_job_line_event(
            job_id=instance.pk,
            event_type='JOB_REASSIGNED',
            actor_id=instance.updated_by_id,
            old_assignee_id=prior_assignee_id,
        )

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


@receiver(pre_save, sender=Inventory)
def _capture_prior_inventory_status(sender, instance: Inventory, **kwargs):
    if instance.pk is None:
        setattr(instance, _PRIOR_INV_STATUS_ATTR, None)
        return
    try:
        prior = Inventory.objects.only('status').get(pk=instance.pk).status
    except Inventory.DoesNotExist:
        prior = None
    setattr(instance, _PRIOR_INV_STATUS_ATTR, prior)


@receiver(post_save, sender=Inventory)
def _push_on_inventory_low_stock(sender, instance: Inventory, created: bool, **kwargs):
    """Push the property's staff when an item drops into low/out of stock.

    De-duplicated via cache: each (item, transition) only fires one push per
    24h, so a batch import or a wobbly quantity field can't spam phones."""
    prior = getattr(instance, _PRIOR_INV_STATUS_ATTR, None)
    new = instance.status
    if new not in ('low_stock', 'out_of_stock'):
        return
    if not created and prior == new:
        return  # already in this state, no new event
    if instance.property_id is None:
        return

    dedupe_key = f'pcms:inv-low-stock:{instance.pk}:{new}'
    if cache.get(dedupe_key):
        return
    cache.set(dedupe_key, 1, timeout=24 * 60 * 60)

    title = (
        'Item out of stock' if new == 'out_of_stock' else 'Inventory low'
    )
    body = (
        f"{instance.name} — {instance.quantity} {instance.unit} "
        f"(min {instance.min_quantity})"
    )
    # Notify the users canonically authorized for this property's tenant
    # scope; the client still decides whether to surface the notification.
    for user in get_property_summary_recipients(instance.property):
        try:
            send_push_to_user(
                user,
                {
                    'title': title,
                    'body': body,
                    'tag': f'inv-{instance.pk}-{new}',
                    'url': '/dashboard/inventory',
                    'renotify': True,
                },
            )
        except Exception:  # pragma: no cover - defensive
            logger.exception('Inventory push failed for user=%s', user.pk)


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
