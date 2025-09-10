"""
Add performance indexes for better query performance
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0020_alter_job_created_at_alter_job_updated_at'),
    ]

    operations = [
        # Job model indexes
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_status_created ON myappLubd_job (status, created_at);",
            reverse_sql="DROP INDEX IF EXISTS idx_job_status_created;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_user_status ON myappLubd_job (user_id, status);",
            reverse_sql="DROP INDEX IF EXISTS idx_job_user_status;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_pm_created ON myappLubd_job (is_preventivemaintenance, created_at);",
            reverse_sql="DROP INDEX IF EXISTS idx_job_pm_created;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_updated_at ON myappLubd_job (updated_at);",
            reverse_sql="DROP INDEX IF EXISTS idx_job_updated_at;"
        ),
        
        # PreventiveMaintenance model indexes
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_scheduled ON myappLubd_preventivemaintenance (scheduled_date);",
            reverse_sql="DROP INDEX IF EXISTS idx_pm_scheduled;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_completed ON myappLubd_preventivemaintenance (completed_date);",
            reverse_sql="DROP INDEX IF EXISTS idx_pm_completed;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_frequency ON myappLubd_preventivemaintenance (frequency);",
            reverse_sql="DROP INDEX IF EXISTS idx_pm_frequency;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_status ON myappLubd_preventivemaintenance (status);",
            reverse_sql="DROP INDEX IF EXISTS idx_pm_status;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_created_by ON myappLubd_preventivemaintenance (created_by_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_pm_created_by;"
        ),
        
        # Property model indexes
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_pm ON myappLubd_property (is_preventivemaintenance);",
            reverse_sql="DROP INDEX IF EXISTS idx_property_pm;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_name ON myappLubd_property (name);",
            reverse_sql="DROP INDEX IF EXISTS idx_property_name;"
        ),
        
        # Room model indexes
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_type_active ON myappLubd_room (room_type, is_active);",
            reverse_sql="DROP INDEX IF EXISTS idx_room_type_active;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_name ON myappLubd_room (name);",
            reverse_sql="DROP INDEX IF EXISTS idx_room_name;"
        ),
        
        # Machine model indexes
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machine_status ON myappLubd_machine (status);",
            reverse_sql="DROP INDEX IF EXISTS idx_machine_status;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machine_property ON myappLubd_machine (property_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_machine_property;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machine_maintenance ON myappLubd_machine (last_maintenance_date);",
            reverse_sql="DROP INDEX IF EXISTS idx_machine_maintenance;"
        ),
        
        # UserProfile model indexes
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_userprofile_google ON myappLubd_userprofile (google_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_userprofile_google;"
        ),
        
        # JobImage model indexes
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobimage_job ON myappLubd_jobimage (job_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_jobimage_job;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobimage_uploaded ON myappLubd_jobimage (uploaded_at);",
            reverse_sql="DROP INDEX IF EXISTS idx_jobimage_uploaded;"
        ),
        
        # Many-to-many relationship indexes
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_rooms ON myappLubd_job_rooms (job_id, room_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_job_rooms;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_topics ON myappLubd_job_topics (job_id, topic_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_job_topics;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_users ON myappLubd_property_users (property_id, user_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_property_users;"
        ),
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_properties ON myappLubd_room_properties (room_id, property_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_room_properties;"
        ),
    ]
