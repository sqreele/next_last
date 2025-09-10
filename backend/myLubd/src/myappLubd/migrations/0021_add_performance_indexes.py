"""
Add performance indexes for better query performance
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0020_alter_job_created_at_alter_job_updated_at'),
    ]

    operations = [
        # Job model indexes
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['status', 'created_at'], name='idx_job_status_created'),
        ),
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['user_id', 'status'], name='idx_job_user_status'),
        ),
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['is_preventivemaintenance', 'created_at'], name='idx_job_pm_created'),
        ),
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['updated_at'], name='idx_job_updated_at'),
        ),
        
        # PreventiveMaintenance model indexes
        migrations.AddIndex(
            model_name='preventivemaintenance',
            index=models.Index(fields=['scheduled_date'], name='idx_pm_scheduled'),
        ),
        migrations.AddIndex(
            model_name='preventivemaintenance',
            index=models.Index(fields=['completed_date'], name='idx_pm_completed'),
        ),
        migrations.AddIndex(
            model_name='preventivemaintenance',
            index=models.Index(fields=['frequency'], name='idx_pm_frequency'),
        ),
        migrations.AddIndex(
            model_name='preventivemaintenance',
            index=models.Index(fields=['status'], name='idx_pm_status'),
        ),
        migrations.AddIndex(
            model_name='preventivemaintenance',
            index=models.Index(fields=['created_by_id'], name='idx_pm_created_by'),
        ),
        
        # Property model indexes
        migrations.AddIndex(
            model_name='property',
            index=models.Index(fields=['is_preventivemaintenance'], name='idx_property_pm'),
        ),
        migrations.AddIndex(
            model_name='property',
            index=models.Index(fields=['name'], name='idx_property_name'),
        ),
        
        # Room model indexes
        migrations.AddIndex(
            model_name='room',
            index=models.Index(fields=['room_type', 'is_active'], name='idx_room_type_active'),
        ),
        migrations.AddIndex(
            model_name='room',
            index=models.Index(fields=['name'], name='idx_room_name'),
        ),
        
        # Machine model indexes
        migrations.AddIndex(
            model_name='machine',
            index=models.Index(fields=['status'], name='idx_machine_status'),
        ),
        migrations.AddIndex(
            model_name='machine',
            index=models.Index(fields=['property_id'], name='idx_machine_property'),
        ),
        migrations.AddIndex(
            model_name='machine',
            index=models.Index(fields=['last_maintenance_date'], name='idx_machine_maintenance'),
        ),
        
        # UserProfile model indexes
        migrations.AddIndex(
            model_name='userprofile',
            index=models.Index(fields=['google_id'], name='idx_userprofile_google'),
        ),
        
        # JobImage model indexes
        migrations.AddIndex(
            model_name='jobimage',
            index=models.Index(fields=['job_id'], name='idx_jobimage_job'),
        ),
        migrations.AddIndex(
            model_name='jobimage',
            index=models.Index(fields=['uploaded_at'], name='idx_jobimage_uploaded'),
        ),
    ]