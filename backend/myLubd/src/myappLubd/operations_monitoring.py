"""Best-effort operational history. Never turn a delivered email into a retry."""
from contextvars import ContextVar
from dataclasses import dataclass
from functools import wraps
import logging
import os
from pathlib import Path

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)
TASKS = {
    'send_daily_summary': 'Daily email summary',
    'send_pm_line_reminders': 'PM LINE reminders',
    'send_pending_jobs_summary': 'Pending jobs email summary',
    'send_property_jobs_summary': 'Property jobs email summary',
}
_current_run = ContextVar('scheduled_task_run', default=None)
_current_delivery = ContextVar('email_delivery_metadata', default=None)


def _write(callback):
    try:
        # Savepoints also protect a surrounding transaction if logging fails.
        with transaction.atomic():
            return callback()
    except Exception as exc:
        logger.warning('Monitoring history unavailable error_type=%s', type(exc).__name__)
        return None


@dataclass
class RunState:
    run: object
    dry_run: bool = False
    attempted: int = 0
    sent: int = 0
    failed: int = 0


def monitored_task(task_name):
    def decorate(handle):
        @wraps(handle)
        def wrapped(self, *args, **options):
            from .models import ScheduledTaskRun
            dry_run = bool(options.get('dry_run'))
            run = _write(lambda: ScheduledTaskRun.objects.create(
                task_name=task_name,
                source='cron' if os.getenv('SCHEDULED_TASK_SOURCE') == 'cron' else 'manual',
                scope=str(options.get('property_id') or ('all properties' if options.get('all_properties') else 'default'))[:100],
                dry_run=dry_run,
            ))
            state = RunState(run, dry_run=dry_run)
            token = _current_run.set(state)
            failure = None
            try:
                return handle(self, *args, **options)
            except BaseException as exc:
                failure = exc
                raise
            finally:
                _current_run.reset(token)
                if failure is not None:
                    status, error = 'failed', type(failure).__name__
                elif dry_run:
                    status, error = 'dry_run', ''
                elif state.failed:
                    status = 'partial' if state.sent else 'failed'
                    error = 'email_transport_failed'
                elif not state.attempted and task_name != 'send_pm_line_reminders':
                    status, error = 'skipped', ''
                else:
                    status, error = 'succeeded', ''
                if run is not None:
                    _write(lambda: ScheduledTaskRun.objects.filter(pk=run.pk).update(
                        status=status, finished_at=timezone.now(), error_code=error,
                        attempted_count=state.attempted, sent_count=state.sent, failed_count=state.failed,
                    ))
        return wrapped
    return decorate


def record_email_transport(provider, *, http_status=None, message_id='', error_code=''):
    metadata = _current_delivery.get()
    if metadata is not None:
        metadata.update(provider=provider, http_status=http_status,
                        provider_message_id=str(message_id or '')[:128], error_code=error_code[:100])


def tracked_email(send):
    @wraps(send)
    def wrapped(*args, **kwargs):
        from .models import EmailDeliveryLog
        state = _current_run.get()
        recipient = kwargs.get('to_email', args[0] if args else '')
        subject = kwargs.get('subject', args[1] if len(args) > 1 else '')
        # A dry run must remain non-sending even if a command gains a new branch.
        if state is not None and state.dry_run:
            raise RuntimeError('Email transport is disabled during a dry run.')
        delivery = _write(lambda: EmailDeliveryLog.objects.create(
            run=state.run if state else None,
            property_id=kwargs.get('property_id'),
            recipient=str(recipient or '')[:254], subject=str(subject or '')[:255],
        ))
        metadata = {'provider': '', 'provider_message_id': '', 'http_status': None, 'error_code': ''}
        token = _current_delivery.set(metadata)
        success = False
        try:
            success = bool(send(*args, **kwargs))
            return success
        except BaseException as exc:
            metadata['error_code'] = type(exc).__name__
            raise
        finally:
            _current_delivery.reset(token)
            if state is not None:
                state.attempted += 1
                state.sent += int(success)
                state.failed += int(not success)
            if not success and not metadata['error_code']:
                metadata['error_code'] = 'email_not_sent'
            if delivery is not None:
                _write(lambda: EmailDeliveryLog.objects.filter(pk=delivery.pk).update(
                    status='sent' if success else 'failed', finished_at=timezone.now(), **metadata,
                ))
    return wrapped


def cron_snapshot():
    """Read only known cron files/process names; never execute shell commands."""
    daemon_running = None
    try:
        names = []
        for entry in Path('/proc').iterdir():
            if entry.name.isdigit():
                try:
                    names.append((entry / 'comm').read_text().strip())
                except (OSError, UnicodeError):
                    continue
        daemon_running = any(name in {'cron', 'crond'} for name in names)
    except OSError:
        pass
    from django.conf import settings
    schedules = {}
    schedule_timezone = settings.TIME_ZONE
    for filename in ('daily_summary', 'demo_reset'):
        try:
            lines = (Path('/etc/cron.d') / filename).read_text().splitlines()
        except (OSError, UnicodeError):
            continue
        for line in lines:
            if line.startswith('CRON_TZ='):
                schedule_timezone = line.partition('=')[2].strip()
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            fields = line.split()
            if len(fields) < 7:
                continue
            for task in TASKS:
                if f'manage.py {task}' in line:
                    schedules[task] = ' '.join(fields[:5])
    return {'daemon_running': daemon_running, 'schedules': schedules, 'timezone': schedule_timezone}
