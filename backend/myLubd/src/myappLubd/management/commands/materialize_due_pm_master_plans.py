"""Generate actual PreventiveMaintenance records from PM master plans.

This command is idempotent: each generated record is keyed by
(master_plan, occurrence_due_date), so repeated cron runs do not create
duplicate PM forms.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from myappLubd.services import PreventiveMaintenanceService


class Command(BaseCommand):
    help = "Generate PM forms from active PM master plans inside each plan's lead window."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report without writing records.")
        parser.add_argument("--limit", type=int, default=500, help="Maximum PM forms to create.")

    def handle(self, *args, **options):
        result = PreventiveMaintenanceService.materialize_master_plan_occurrences(
            cutoff=timezone.now(),
            dry_run=options["dry_run"],
            limit=max(1, options["limit"]),
        )
        for item in result["created"]:
            label = item["pm_id"] or "DRY-RUN"
            self.stdout.write(f"{label}: plan={item['plan_id']} due={item['due_date']}")
        summary = (
            f"Done. created={result['created_count']} skipped={result['skipped']} "
            f"{'(dry run)' if result['dry_run'] else ''}"
        ).strip()
        self.stdout.write(self.style.SUCCESS(summary))
