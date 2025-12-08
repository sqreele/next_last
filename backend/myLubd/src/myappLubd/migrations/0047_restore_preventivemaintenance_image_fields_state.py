# Generated manually to fix migration state mismatch
# NOTE: Migration 0040 was originally trying to remove after_image, before_image, etc. from preventivemaintenance,
# but this was incorrect - those fields were never removed from preventivemaintenance (only from maintenanceprocedure).
# Migration 0040 has been fixed to not remove these fields.
# This migration is kept for backward compatibility but is now effectively a no-op since the fields
# were never removed from preventivemaintenance in the first place.

from django.db import migrations, models
from django.db.migrations.operations.base import Operation
import django.core.validators


class AddFieldStateOnly(Operation):
    """
    Adds a field to Django's migration state without touching the database.
    Safe to call multiple times - checks if field already exists first.
    """

    reduces_to_sql = False
    reversible = False

    def __init__(self, model_name, name, field):
        self.model_name = model_name
        self.name = name
        self.field = field
        self.model_name_lower = model_name.lower()

    def state_forwards(self, app_label, state):
        model_key = (app_label, self.model_name_lower)
        model_state = state.models.get(model_key)
        if not model_state:
            return
        # Only add if it doesn't already exist
        if self.name not in model_state.fields:
            model_state.fields[self.name] = self.field.clone()

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        # Database already has these columns; nothing to do here.
        pass

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        # Not reversible
        pass

    def describe(self):
        return f"State-only addition of field {self.name} to {self.model_name}"


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0046_remove_maintenanceprocedure_after_image_and_more'),
    ]

    operations = [
        # These fields exist in the database and model, but were removed from Django's state
        # in migration 0040. We need to add them back to Django's state.
        migrations.SeparateDatabaseAndState(
            database_operations=[],  # No database operations needed - columns already exist
            state_operations=[
                AddFieldStateOnly(
                    'preventivemaintenance',
                    'after_image',
                    models.ImageField(
                        blank=True,
                        help_text='Image after maintenance',
                        null=True,
                        upload_to='maintenance_pm_images/%Y/%m/',
                        validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif'])]
                    )
                ),
                AddFieldStateOnly(
                    'preventivemaintenance',
                    'after_image_jpeg_path',
                    models.CharField(
                        blank=True,
                        help_text='Path to JPEG version of the after image for PDF generation',
                        max_length=500,
                        null=True
                    )
                ),
                AddFieldStateOnly(
                    'preventivemaintenance',
                    'before_image',
                    models.ImageField(
                        blank=True,
                        help_text='Image before maintenance',
                        null=True,
                        upload_to='maintenance_pm_images/%Y/%m/',
                        validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif'])]
                    )
                ),
                AddFieldStateOnly(
                    'preventivemaintenance',
                    'before_image_jpeg_path',
                    models.CharField(
                        blank=True,
                        help_text='Path to JPEG version of the before image for PDF generation',
                        max_length=500,
                        null=True
                    )
                ),
            ],
        ),
    ]

