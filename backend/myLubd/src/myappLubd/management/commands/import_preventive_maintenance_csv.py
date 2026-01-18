import pathlib

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

from myappLubd.services import PreventiveMaintenanceService


User = get_user_model()


class Command(BaseCommand):
    help = "Import preventive maintenance records from a CSV file."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", type=str, help="Path to CSV file.")
        parser.add_argument(
            "--default-user-email",
            type=str,
            help="Fallback user email when Creator Email is missing.",
        )

    def handle(self, *args, **options):
        csv_path = pathlib.Path(options["csv_path"])
        if not csv_path.exists():
            raise CommandError(f"CSV file not found: {csv_path}")

        default_user = None
        default_email = options.get("default_user_email")
        if default_email:
            default_user = User.objects.filter(email__iexact=default_email).first()

        if default_user is None:
            default_user = User.objects.filter(is_superuser=True).first()

        if default_user is None:
            raise CommandError(
                "Default user is required. Provide --default-user-email or create a superuser."
            )

        content = csv_path.read_text(encoding="utf-8-sig")
        result = PreventiveMaintenanceService.import_from_csv_content(content, default_user)

        self.stdout.write(self.style.SUCCESS("Import complete"))
        self.stdout.write(f"Created: {result['created']}")
        self.stdout.write(f"Updated: {result['updated']}")
        if result["errors"]:
            self.stdout.write(self.style.WARNING("Errors:"))
            for error in result["errors"]:
                self.stdout.write(f"  Row {error['row']}: {error['error']}")
