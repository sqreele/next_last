# Generated manually to fix migration state mismatch
# The fields after_image, before_image, etc. were already removed from the database
# by migrations 0036 and 0038 using RunPython, but Django's migration state still thinks they exist.
# This migration updates Django's state without touching the database.

from django.db import migrations
from django.db.migrations.operations.base import Operation


class RemoveFieldStateOnly(Operation):
    """
    Removes a field from Django's migration state without touching the database.
    Safe to call multiple times because it simply pops the field if present.
    """

    reduces_to_sql = False
    reversible = False

    def __init__(self, model_name, name):
        self.model_name = model_name
        self.name = name
        self.model_name_lower = model_name.lower()

    def state_forwards(self, app_label, state):
        model_key = (app_label, self.model_name_lower)
        model_state = state.models.get(model_key)
        if not model_state:
            return
        if self.name in model_state.fields:
            model_state.fields.pop(self.name)

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        # Intentionally do nothing - fields were already removed by migrations 0036/0038
        # This operation only updates Django's migration state
        pass

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        # Not reversible - fields were already removed from database
        pass

    def describe(self):
        return f"State-only removal of field {self.name} from {self.model_name}"


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0045_add_inventory_model'),
    ]

    operations = [
        # These fields were already removed from the database by migrations 0036 and 0038
        # using RunPython. We only need to update Django's migration state here.
        migrations.SeparateDatabaseAndState(
            database_operations=[],  # No database operations needed
            state_operations=[
                RemoveFieldStateOnly('maintenanceprocedure', 'after_image'),
                RemoveFieldStateOnly('maintenanceprocedure', 'after_image_jpeg_path'),
                RemoveFieldStateOnly('maintenanceprocedure', 'before_image'),
                RemoveFieldStateOnly('maintenanceprocedure', 'before_image_jpeg_path'),
            ],
        ),
    ]

