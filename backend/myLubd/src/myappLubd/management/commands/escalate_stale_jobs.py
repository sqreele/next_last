"""
Bump priority on jobs that have been open too long without movement.

Rules (defaults, all overridable via flags):
    - Job pending or in_progress.
    - Last update >= --hours-pending hours ago (default 24).
    - Current priority below --target-priority (default `high`).

Each affected job gets its priority raised, a remarks line appended that
records the auto-escalation, and a push notification fired to the assignee.

Idempotent: jobs already at the target priority are skipped, so running the
command repeatedly is a no-op.

Schedule example (every hour):
    0 * * * * python manage.py escalate_stale_jobs --hours-pending 24
"""

import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from myappLubd.models import Job
from myappLubd.push import send_push_to_user

logger = logging.getLogger(__name__)


# Higher priorities sort later in this list — index = severity.
PRIORITY_LADDER = ['low', 'medium', 'high']


def priority_index(value: str | None) -> int:
    if value not in PRIORITY_LADDER:
        return 1  # treat unknown as medium
    return PRIORITY_LADDER.index(value)


class Command(BaseCommand):
    help = (
        "Escalate priority on jobs that have been open for more than the "
        "threshold without status movement. Idempotent."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours-pending",
            type=int,
            default=24,
            help="Minimum hours since last update before a job is considered stale.",
        )
        parser.add_argument(
            "--target-priority",
            choices=PRIORITY_LADDER,
            default="high",
            help="Priority to escalate stale jobs to.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=500,
            help="Maximum jobs to process per run.",
        )

    def handle(self, *args, **options):
        hours = max(1, options["hours_pending"])
        target = options["target_priority"]
        target_idx = priority_index(target)
        dry_run = options["dry_run"]
        limit = max(1, options["limit"])

        cutoff = timezone.now() - timedelta(hours=hours)

        candidates = (
            Job.objects.select_related("user", "updated_by")
            .filter(status__in=["pending", "in_progress"], updated_at__lte=cutoff)
            .exclude(priority=target)
            .order_by("updated_at")[:limit]
        )

        total = candidates.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No stale jobs to escalate."))
            return

        self.stdout.write(
            f"Scanning {total} stale job(s) (>= {hours}h since update; target priority={target})."
        )

        escalated = 0
        skipped = 0
        for job in candidates:
            current_idx = priority_index(job.priority)
            if current_idx >= target_idx:
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"  · [DRY] would escalate {job.job_id} ({job.priority} -> {target})"
                )
                escalated += 1
                continue

            try:
                with transaction.atomic():
                    locked = Job.objects.select_for_update().get(pk=job.pk)
                    # Re-check inside the lock so two cron runs don't both bump.
                    if priority_index(locked.priority) >= target_idx:
                        skipped += 1
                        continue
                    stamp = timezone.now().strftime("%Y-%m-%d %H:%M")
                    note = (
                        f"[{stamp} · system → escalated to {target}] "
                        f"No movement in {hours}h."
                    )
                    locked.remarks = (
                        f"{locked.remarks}\n{note}" if locked.remarks else note
                    )
                    locked.priority = target
                    locked.save(update_fields=["priority", "remarks", "updated_at"])

                escalated += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  + escalated {job.job_id} -> {target}")
                )

                # Notify the assignee. Failures here can't break the loop.
                try:
                    send_push_to_user(
                        job.user,
                        {
                            "title": "Job escalated",
                            "body": f"#{job.job_id} bumped to {target} priority (open {hours}h+)",
                            "tag": f"job-escalated-{job.job_id}",
                            "url": f"/dashboard/jobs/{job.job_id}",
                            "renotify": True,
                        },
                    )
                except Exception:  # pragma: no cover - defensive
                    logger.exception("Push for escalated job %s failed", job.job_id)
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("Failed to escalate job %s", job.job_id)
                self.stdout.write(self.style.ERROR(f"  x {job.job_id}: {exc}"))

        summary = (
            f"Done. escalated={escalated} skipped={skipped} "
            f"{'(dry run)' if dry_run else ''}"
        ).strip()
        self.stdout.write(self.style.SUCCESS(summary))
