"""Write application-side Job mutations to Django's admin history."""

import logging

from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType


logger = logging.getLogger(__name__)


def log_job_action(*, job, user, action_flag, message):
    """Add a Job history entry when an authenticated actor is available.

    Django normally writes ``LogEntry`` rows only for changes made inside the
    admin. Jobs are primarily managed through the API, so mirror those writes
    here to make the standard admin "History" page complete and useful.

    History is secondary to the business operation. A logging problem must not
    turn an already-committed API mutation into a client-visible failure.
    """
    if not getattr(user, 'is_authenticated', False) or not getattr(user, 'pk', None):
        return

    try:
        LogEntry.objects.log_action(
            user_id=user.pk,
            content_type_id=ContentType.objects.get_for_model(
                job,
                for_concrete_model=True,
            ).pk,
            object_id=str(job.pk),
            object_repr=str(job)[:200],
            action_flag=action_flag,
            change_message=message,
        )
    except Exception:  # pragma: no cover - defensive; the mutation already succeeded
        logger.exception('Could not write admin history for job=%s', job.pk)
