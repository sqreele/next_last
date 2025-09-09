# Generated performance optimization migration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0019_maintenanceprocedure_difficulty_level_and_more'),
    ]

    operations = [
        # Add indexes for Job model
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['status', '-created_at'], name='job_status_created_idx'),
        ),
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['is_preventivemaintenance', '-created_at'], name='job_pm_created_idx'),
        ),
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['is_defective', '-created_at'], name='job_defect_created_idx'),
        ),
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['-created_at'], name='job_created_idx'),
        ),
        
        # Add indexes for Property model
        migrations.AddIndex(
            model_name='property',
            index=models.Index(fields=['property_id'], name='property_id_idx'),
        ),
        
        # Add indexes for Room model
        migrations.AddIndex(
            model_name='room',
            index=models.Index(fields=['name'], name='room_name_idx'),
        ),
        
        # Add indexes for PreventiveMaintenance model
        migrations.AddIndex(
            model_name='preventivemaintenance',
            index=models.Index(fields=['scheduled_date', 'completion_date'], name='pm_schedule_complete_idx'),
        ),
        migrations.AddIndex(
            model_name='preventivemaintenance',
            index=models.Index(fields=['frequency', '-scheduled_date'], name='pm_freq_schedule_idx'),
        ),
    ]