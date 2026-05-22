"""
Materialize Job records for PreventiveMaintenance tasks that have reached
their scheduled_date but don't yet have a linked Job.

Idempotent: safe to run from cron every N minutes. Skips PMs that are already
linked to a job, or that are already completed/cancelled. Each PM that crosses
its scheduled_date gets exactly one Job created and back-linked via the
PM.job FK.

Usage:
    python manage.py materialize_due_pm_jobs
    python manage.py materialize_due_pm_jobs --dry-run
    python manage.py materialize_due_pm_jobs --lead-minutes 60
"""

import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from myappLubd.models import Job, PreventiveMaintenance
from myappLubd.push import send_push_to_user

logger = logging.getLogger(__name__)


# PM status values we should NOT materialize from — completed/cancelled work
# is done, overdue stays caught by the dashboard's overdue endpoint.
SKIP_PM_STATUSES = {"completed", "cancelled"}


class Command(BaseCommand):
    help = (
        "Create Job records for PreventiveMaintenance tasks that are due and "
        "don't yet have an associated Job. Safe to run repeatedly."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created without writing anything.",
        )
        parser.add_argument(
            "--lead-minutes",
            type=int,
            default=0,
            help=(
                "Also materialize PMs scheduled within the next N minutes. "
                "Useful so technicians see today's work before the exact tick."
            ),
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=500,
            help="Maximum PMs to process per run. Defaults to 500.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        lead_minutes = max(0, options["lead_minutes"])
        limit = max(1, options["limit"])

        now = timezone.now()
        cutoff = now + timedelta(minutes=lead_minutes)

        # Candidates: PMs without a linked Job, whose scheduled_date has
        # passed (or is within the lead window) and that are not in a
        # terminal state. We don't filter on `completed_date is None`
        # because in practice some legacy rows may keep status='pending'
        # without a Job — we want those too.
        candidates = (
            PreventiveMaintenance.objects.select_related(
                "created_by", "assigned_to", "procedure_template"
            )
            .prefetch_related("topics", "machines", "machines__property")
            .filter(
                job__isnull=True,
                scheduled_date__lte=cutoff,
                completed_date__isnull=True,
            )
            .exclude(status__in=SKIP_PM_STATUSES)
            .order_by("scheduled_date")[:limit]
        )

        total = candidates.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No due PMs to materialize."))
            return

        self.stdout.write(
            f"Found {total} due PM(s) to materialize "
            f"(lead {lead_minutes}m, cutoff {cutoff.isoformat()})."
        )

        created = 0
        skipped = 0
        errors = 0

        for pm in candidates:
            owner = pm.assigned_to or pm.created_by
            if owner is None:
                self.stdout.write(
                    self.style.WARNING(
                        f"  ! Skipping {pm.pm_id}: no assigned_to or created_by."
                    )
                )
                skipped += 1
                continue

            # No automatic room attachment: Machine -> Property, not Room.
            # The dispatcher attaches a room when they pick the job up.
            target_rooms = []

            description_parts = [pm.pmtitle or "Preventive maintenance"]
            if pm.notes:
                description_parts.append(pm.notes.strip())
            if pm.procedure:
                description_parts.append(f"Procedure: {pm.procedure.strip()}")
            description = "\n\n".join(part for part in description_parts if part)

            try:
                if dry_run:
                    self.stdout.write(
                        f"  · [DRY] would create job for {pm.pm_id} "
                        f"(owner={owner.username}, rooms={len(target_rooms)})"
                    )
                    created += 1
                    continue

                with transaction.atomic():
                    # Re-fetch with a row lock so concurrent runs (cron + manual
                    # invocation) don't both create a job for the same PM.
                    locked_pm = (
                        PreventiveMaintenance.objects.select_for_update()
                        .get(pk=pm.pk)
                    )
                    if locked_pm.job_id is not None:
                        skipped += 1
                        continue

                    job = Job.objects.create(
                        user=owner,
                        updated_by=owner,
                        description=description,
                        remarks=f"Auto-created from PM {pm.pm_id} due {pm.scheduled_date.isoformat()}",
                        status="pending",
                        priority=(pm.priority or "medium") if pm.priority != "critical" else "high",
                        is_preventivemaintenance=True,
                    )
                    if target_rooms:
                        job.rooms.set(target_rooms)
                    topics = list(pm.topics.all())
                    if topics:
                        job.topics.set(topics)

                    locked_pm.job = job
                    if locked_pm.status == "pending":
                        locked_pm.status = "in_progress"
                    locked_pm.save(update_fields=["job", "status"])

                created += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  + {pm.pm_id} -> job {job.job_id} (owner={owner.username})"
                    )
                )

                # Best-effort push notification to the assignee so the new job
                # surfaces on their phone immediately. Failures here are
                # already swallowed inside send_push_to_user so they cannot
                # break the materialization run.
                try:
                    send_push_to_user(
                        owner,
                        {
                            'title': 'New preventive maintenance assigned',
                            'body': (pm.pmtitle or 'Preventive maintenance')[:120],
                            'tag': f'pm-due-{pm.pm_id}',
                            'url': f'/dashboard/jobs/{job.job_id}',
                            'icon': '/icon-192x192.png',
                        },
                    )
                except Exception:  # pragma: no cover - defensive
                    logger.exception('Push for materialized PM %s failed', pm.pm_id)
            except Exception as exc:  # pragma: no cover - defensive
                errors += 1
                logger.exception("Failed to materialize PM %s", pm.pm_id)
                self.stdout.write(
                    self.style.ERROR(f"  x {pm.pm_id}: {exc}")
                )

        summary = (
            f"Done. created={created} skipped={skipped} errors={errors} "
            f"{'(dry run)' if dry_run else ''}"
        ).strip()
        if errors:
            self.stdout.write(self.style.WARNING(summary))
        else:
            self.stdout.write(self.style.SUCCESS(summary))
