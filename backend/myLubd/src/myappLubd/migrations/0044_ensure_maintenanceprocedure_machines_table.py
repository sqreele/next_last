# Generated manually to ensure maintenanceprocedure_machines table exists

from django.db import migrations
from django.db import connection


def ensure_table_exists(apps, schema_editor):
    """Ensure the many-to-many intermediate table exists"""
    with connection.cursor() as cursor:
        # Check if table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'myappLubd_maintenanceprocedure_machines'
            );
        """)
        table_exists = cursor.fetchone()[0]
        
        if not table_exists:
            # Create the table if it doesn't exist
            # Note: PostgreSQL is case-sensitive, so we need to quote table names
            cursor.execute("""
                CREATE TABLE "myappLubd_maintenanceprocedure_machines" (
                    id SERIAL PRIMARY KEY,
                    maintenanceprocedure_id INTEGER NOT NULL 
                        REFERENCES "myappLubd_maintenanceprocedure"(id) 
                        ON DELETE CASCADE,
                    machine_id INTEGER NOT NULL 
                        REFERENCES "myappLubd_machine"(id) 
                        ON DELETE CASCADE,
                    UNIQUE(maintenanceprocedure_id, machine_id)
                );
                CREATE INDEX myapplubd_maintenanceprocedure_machines_maintenanceprocedure_id_idx 
                    ON "myappLubd_maintenanceprocedure_machines"(maintenanceprocedure_id);
                CREATE INDEX myapplubd_maintenanceprocedure_machines_machine_id_idx 
                    ON "myappLubd_maintenanceprocedure_machines"(machine_id);
            """)


def reverse_ensure_table_exists(apps, schema_editor):
    """Remove the table if needed (for reverse migration)"""
    with connection.cursor() as cursor:
        cursor.execute('DROP TABLE IF EXISTS "myappLubd_maintenanceprocedure_machines" CASCADE;')


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0043_remove_maintenanceprocedure_myapplubd_mp_name_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(
            ensure_table_exists,
            reverse_code=reverse_ensure_table_exists,
        ),
    ]

