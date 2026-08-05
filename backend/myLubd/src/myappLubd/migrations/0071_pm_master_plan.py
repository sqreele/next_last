# Generated for completion-based PM master plan workflow

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import django.db.models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0070_alter_jobimage_image'),
    ]

    operations = [
        migrations.CreateModel(
            name='PMMasterPlan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plan_id', models.CharField(blank=True, editable=False, max_length=16, unique=True)),
                ('title', models.TextField(default='No title')),
                ('frequency', models.CharField(choices=[('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'), ('quarterly', 'Quarterly'), ('semi_annual', 'Semi-Annual'), ('annual', 'Annual'), ('custom', 'Custom')], default='monthly', max_length=20)),
                ('custom_days', models.PositiveIntegerField(blank=True, null=True)),
                ('start_date', models.DateTimeField()),
                ('lead_time_days', models.PositiveIntegerField(default=7)),
                ('active', models.BooleanField(default=True)),
                ('last_completed_date', models.DateTimeField(blank=True, null=True)),
                ('next_due_date', models.DateTimeField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, null=True)),
                ('procedure', models.TextField(blank=True, null=True)),
                ('remarks', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assigned_to', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assigned_pm_master_plans', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='created_pm_master_plans', to=settings.AUTH_USER_MODEL)),
                ('machines', models.ManyToManyField(blank=True, related_name='pm_master_plans', to='myappLubd.machine')),
                ('procedure_template', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pm_master_plans', to='myappLubd.maintenanceprocedure')),
                ('topics', models.ManyToManyField(blank=True, related_name='pm_master_plans', to='myappLubd.topic')),
            ],
            options={
                'ordering': ['next_due_date', 'start_date'],
                'indexes': [models.Index(fields=['plan_id'], name='myappLubd_p_plan_id_6073a9_idx'), models.Index(fields=['active', 'next_due_date'], name='myappLubd_p_active_13cd43_idx'), models.Index(fields=['start_date'], name='myappLubd_p_start_d_887e07_idx')],
            },
        ),
        migrations.AddField(
            model_name='preventivemaintenance',
            name='generated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='preventivemaintenance',
            name='master_plan',
            field=models.ForeignKey(blank=True, help_text='Recurring PM master plan that generated this actual work record', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='generated_maintenances', to='myappLubd.pmmasterplan'),
        ),
        migrations.AddField(
            model_name='preventivemaintenance',
            name='occurrence_due_date',
            field=models.DateTimeField(blank=True, help_text='Original projected due date for this generated occurrence', null=True),
        ),
        migrations.AddConstraint(
            model_name='preventivemaintenance',
            constraint=models.UniqueConstraint(condition=django.db.models.Q(('master_plan__isnull', False), ('occurrence_due_date__isnull', False)), fields=('master_plan', 'occurrence_due_date'), name='uniq_pm_master_plan_occurrence'),
        ),
    ]
