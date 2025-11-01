from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0026_alter_user_options_remove_job_job_status_created_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='user',
            name='department',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='full_name',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='role',
            field=models.CharField(blank=True, choices=[('Chief Engineer', 'Chief Engineer'), ('Engineer', 'Engineer'), ('Technician', 'Technician'), ('Contractor', 'Contractor'), ('Inspector', 'Inspector')], max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AddIndex(
            model_name='user',
            index=models.Index(fields=['username'], name='myappLubd_u_username_idx'),
        ),
        migrations.AddIndex(
            model_name='user',
            index=models.Index(fields=['full_name'], name='myappLubd_u_full_name_idx'),
        ),
        migrations.AddIndex(
            model_name='user',
            index=models.Index(fields=['role'], name='myappLubd_u_role_idx'),
        ),
        migrations.AddIndex(
            model_name='user',
            index=models.Index(fields=['department'], name='myappLubd_u_department_idx'),
        ),
        migrations.CreateModel(
            name='Frequency',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
                ('interval_days', models.PositiveIntegerField(blank=True, null=True)),
            ],
            options={
                'ordering': ['name'],
                'verbose_name': 'Frequency',
                'verbose_name_plural': 'Frequencies',
            },
        ),
        migrations.CreateModel(
            name='Procedure',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('description', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('active', models.BooleanField(default=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='procedures_created', to=settings.AUTH_USER_MODEL)),
                ('equipment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='procedures', to='myappLubd.machine')),
                ('frequency', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='procedures', to='myappLubd.frequency')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='procedures_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
                'verbose_name': 'Procedure',
                'verbose_name_plural': 'Procedures',
            },
        ),
        migrations.CreateModel(
            name='MaintenanceLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date_performed', models.DateField()),
                ('status', models.CharField(choices=[('Completed', 'Completed'), ('Pending', 'Pending'), ('Skipped', 'Skipped'), ('Rescheduled', 'Rescheduled')], default='Pending', max_length=20)),
                ('remarks', models.TextField(blank=True, null=True)),
                ('photo_url', models.CharField(blank=True, max_length=255, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('performed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='maintenance_performed', to=settings.AUTH_USER_MODEL)),
                ('procedure', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='maintenance_logs', to='myappLubd.procedure')),
                ('verified_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='maintenance_verified', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-date_performed', '-created_at'],
                'verbose_name': 'Maintenance Log',
                'verbose_name_plural': 'Maintenance Logs',
            },
        ),
        migrations.CreateModel(
            name='Contractor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('contact', models.CharField(blank=True, max_length=255, null=True)),
                ('type', models.CharField(choices=[('Internal', 'Internal'), ('External', 'External')], default='Internal', max_length=20)),
                ('assigned_equipment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='contractors', to='myappLubd.machine')),
            ],
            options={
                'ordering': ['name'],
                'verbose_name': 'Contractor',
                'verbose_name_plural': 'Contractors',
            },
        ),
        migrations.AddIndex(
            model_name='procedure',
            index=models.Index(fields=['equipment'], name='procedure_equipment_idx'),
        ),
        migrations.AddIndex(
            model_name='procedure',
            index=models.Index(fields=['frequency'], name='procedure_frequency_idx'),
        ),
        migrations.AddIndex(
            model_name='procedure',
            index=models.Index(fields=['active'], name='procedure_active_idx'),
        ),
        migrations.AddIndex(
            model_name='maintenancelog',
            index=models.Index(fields=['status'], name='maintlog_status_idx'),
        ),
        migrations.AddIndex(
            model_name='maintenancelog',
            index=models.Index(fields=['date_performed'], name='maintlog_date_idx'),
        ),
    ]
